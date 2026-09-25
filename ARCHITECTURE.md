# Architecture notes

## Overview

```
browser -> chat (FastAPI) -> provider SDKs (google-genai / openai / anthropic)
        -> steno (httpx patch: latency, ttft, tokens, previews, status)
        -> ingest (FastAPI, XADD) -> Redis stream -> worker (XREADGROUP)
        -> Postgres (inference_logs) -> Grafana (reads Postgres directly)
```

`chat` also owns `conversations` and `messages` in the same Postgres instance, written directly
with no queue. Only observability data goes through the ingest/Redis/worker path.

## Ingestion flow

1. `chat/main.py` calls `steno.instrument()` at import time, patching `httpx.AsyncClient.send`
   and, if importable, the anthropic SDK's `httpx2` fork. No provider SDK code is touched.
2. `chat` wraps a provider call in `steno.session(str(conversation_id))`, a ContextVar, tagging
   any HTTP call underneath with that session id with no argument threading through
   `providers.py`.
3. Patched `send()` checks the request host against a `PROVIDERS` map and the path against
   inference substrings (`generatecontent`, `/messages`, `/chat/completions`, `/responses`); a
   non-match falls through to the original `send` untouched, so model listing and auth calls are
   never logged. On a match, an event dict is built before the request goes out: `event_id`,
   session id, provider, model, `started_at`, and a redacted `input_preview` (last 300
   characters of the last message).
4. Non-streaming responses are already fully read by the time `send()` returns, so the event
   finalizes immediately. Streaming responses get `response.stream` wrapped in a `TeeStream`
   that copies each chunk while yielding it unchanged, recording `ttft_ms` on the first chunk
   and emitting when the stream ends, is cancelled, or raises.
5. `emit()` puts the event on an in-process `asyncio.Queue` (lazy, `maxsize=10_000`), drained by
   `flush_forever`: wait for one item, sleep 0.5s to let more arrive, drain up to 100, POST the
   batch to `STENO_ENDPOINT`, retrying 3 times with `2**attempt` backoff.

One event's shape, crossing the wire to ingest (fields trimmed for space):

```json
{"event_id": "5e7f9c2a-...", "session_id": "3f1e6b10-...",
 "provider": "google", "model": "gemini-3.5-flash", "status": "ok",
 "latency_ms": 842, "ttft_ms": 210, "input_tokens": 143, "output_tokens": 88,
 "started_at": "2026-09-22T10:15:03.120Z", "error": null,
 "input_preview": "...redacted tail", "output_preview": "...redacted head"}
```

6. `ingest/main.py` validates each event on its own (pydantic `Event`, max 500 per batch),
   pushes the valid ones with `XADD ... MAXLEN ~ 1_000_000`, and returns **202 Accepted** with
   `{"accepted": n, "rejected": m}` before any Postgres write: durably queued in Redis, not yet
   visible in Postgres or Grafana.
7. `ingest/worker.py` reads with `XREADGROUP`, count 200, block 2000ms, inserts the batch in one
   `executemany` (`ON CONFLICT (event_id) DO NOTHING`) inside one transaction, commits, then
   `XACK`s the entries. An entry counts as delivered only after the ack.

## Logging strategy

Instrumentation sits at the httpx layer, under all four provider SDKs, instead of wrapping each
SDK's client methods. One code path parses four wire formats (Google, Anthropic, OpenAI, and
Groq under `x_groq`) instead of four call sites each hand-tracking latency and tokens; a new
call site in `chat/providers.py` needs zero logging code, where wrapping each SDK method would
break the moment a provider changes a signature or return type. The anthropic SDK ships on
`httpx2`, an internal fork, not `httpx`, so `instrument()` patches both and no-ops on `httpx2`
if not installed, or it would silently miss every Anthropic call.

`steno.session(conversation_id)` uses a ContextVar, not a parameter, so tagging a log row costs
one `with` block and stays per-asyncio-task, which keeps concurrent requests from bleeding
session ids. `ttft_ms` is set once, on the first chunk delivered through `TeeStream.__aiter__`,
and stays null for non-streaming responses.

PII redaction (`steno/redact.py`, regexes for email, card, phone) runs only on the preview
fields, truncated to 300 characters. **Full prompts and completions are never sent to ingest and
never stored**: previews are enough to eyeball a call in Grafana's "Recent" panel, and storing
full text here would duplicate what `chat`'s own `messages` table owns, with none of its access
control. `input_preview` keeps the last 300 characters of the final message, `output_preview`
the first 300; that asymmetry is intentional, not a bug.

### Bring your own key

OpenAI and Anthropic have no server key. A visitor can enter their own in the
UI; it lives in that browser's `localStorage` and travels as an `X-Key-<provider>`
header on each request. `chat` builds an SDK client per (provider, key) for the
call and stores nothing. The logging SDK records request bodies and timings,
never headers, so keys do not reach `inference_logs`.

### Limits

`chat/quota.py` runs before every send. A per-IP sliding window in process memory
(10 a minute) stops a script from clearing cookies to reset its identity; then two
daily caps per identity, messages counted from `messages` (exact, synchronous)
and tokens summed from `inference_logs` joined to the identity's conversations
(a second behind, which is fine for a cap). Visitors get 20 messages and 60k
tokens, signed-in users 100 and 400k, so signing in is the first upgrade path
and a visitor's own API key is the second: those requests skip the daily caps.
Every rejection is a row in `quota_hits`, so abuse is visible on the dashboard's
Usage row, not just refused.

### Visits

A middleware in `chat` records each page load of the app itself (`/`, shared
links `/s/<token>`, and `/admin/access`), never API calls or assets, in the
`visits` table: time, path, client IP (Caddy passes it in `X-Forwarded-For`),
browser, referrer, and the signed-in email or anonymous id. Country, city and
network owner come from ip-api.com, looked up once per IP off the request path.
Bots are flagged by user agent. The dashboard's Visitors row excludes bots and
anyone on the admin allowlist, so it counts other people. Caddy also writes a
JSON access log to stdout for the raw record. The table is created at startup
with `create table if not exists`, so adding it did not reset production data.

### Generated images

Image models answer with bytes. In production `chat/images.py` uploads them to
the public-read bucket `steno-images-teejayproject` under a random UUID name with a 30-day
lifecycle, and the message stores a Markdown image pointing at the URL; the
bucket is on the free tier and the URL is as guessable as a share link. Locally,
with no bucket configured, the image is inlined as a data URI so the flow still
works. Either way images are stripped to `[image]` before history goes back to
a model, so a picture never costs tokens on later turns.

## Cancellation

Two paths, both must emit a log row or Grafana under-counts cancellations.

1. **Before the first byte**: the browser aborts, Starlette cancels the request's generator, and
   `send()` is still awaiting `original_send`. It catches `asyncio.CancelledError`, marks the
   event `status: "cancelled"`, emits it, and re-raises. `TeeStream` is never involved here.
2. **Mid-stream**: `TeeStream.__aiter__`'s `async for` catches `CancelledError` (and
   `GeneratorExit`) and calls `finish("cancelled")` before re-raising. `aclose` also calls
   `finish`, a no-op after the first call, so whichever path fires first wins.

In `chat`, `send_message`'s `generate()` accumulates `parts` as each delta streams out. Its
`finally` block persists whatever was collected as an assistant message under
`asyncio.shield(...)`: the enclosing scope is already cancelled, so without shielding the insert
would itself raise `CancelledError` before the write lands. A cancelled reply is saved, not
dropped, so the conversation can resume.

## Identity

`viewer()` in `chat/auth.py` resolves one of two identities on every request. **Anonymous**:
`anonymous_id()` reads or mints the HttpOnly `uid` cookie (365 days); every conversation query
filters by `user_id`, so a fresh visitor with no cookie has no conversations, and nothing to
sign up for. **Signed in**: the browser (`web/src/lib/firebase.ts`) opens a Firebase Auth Google
popup, then posts the ID token to `POST /api/auth/session`. The server verifies it with
`google-auth`'s `verify_firebase_token`, upserts the `users` row, moves this browser's anonymous
conversations onto the account (`update conversations set user_id=<uid> where
user_id=<anon-uid>`), and sets a `session` cookie: `uid|email|issued_at` plus an HMAC-SHA256
signature over that payload with `SESSION_SECRET`, 30 days. `DELETE /api/auth/session` clears
it; `GET /api/me` returns `{user, admin}`, `admin` being membership in `admin_allowlist`.

Forking a conversation requires a signed-in viewer, 401 otherwise; every other conversation
endpoint works anonymously (`web/src/components/message-actions.tsx` shows a sign-in popover
instead of the branch action when signed out). The same `admin_allowlist` table also gates
`/admin`, through a Caddy `forward_auth` check under Deployment.

## Schema

Five tables in `db/schema.sql`, the single source of truth, loaded by Postgres on first start.

- **`users`**: id (the Firebase Auth uid), email, name, picture, created_at. Upserted by `POST
  /api/auth/session` on every sign-in.
- **`admin_allowlist`**: email, added_by, created_at. Who may open `/admin`; seeded from
  `ADMIN_EMAILS`, edited from `/admin/access`.
- **`conversations`**: id, `user_id`, optional title, `archived_at`, timestamps. Owned by
  `chat`. `user_id` holds either the anonymous per-browser `uid` cookie or a Firebase uid after
  sign-in, and every conversation query filters by it; signing in moves a browser's anonymous
  rows onto the account by rewriting this column.
- **`messages`**: one row per turn, `role` constrained to `user`/`assistant`, `model` on
  assistant turns, a real foreign key to `conversations` (`on delete cascade`) and one index
  (`conversation_id, id`). Small, transactional, always read by conversation id, so both fit
  without complication.
- **`inference_logs`**: one row per LLM call, written only by the worker. Typed columns
  (provider, model, status, latency_ms, ttft_ms, tokens, started_at) cover everything Grafana
  groups, filters, or takes percentiles over; `jsonb metadata` holds the long tail (`{"stream":
  bool}`, or `{"parse_error": "..."}`) with no migration for new, rarely-queried fields.
  `event_id uuid unique` is the idempotency key: `flush_forever` retries a batch POST up to 3
  times, and `ON CONFLICT (event_id) DO NOTHING` makes a retry safe to replay. `session_id` is a
  bare uuid, deliberately not a foreign key to `conversations.id`: a log event can outlive its
  conversation, and `steno` has no dependency on `chat`'s schema at all, so a third-party app
  could use the SDK with no `conversations` table in existence. A foreign key here would make
  the observability table depend on the product table, backwards from the ownership split the
  schema states. Indexes: `started_idx` (`started_at desc`) serves every panel's time filter;
  `session_idx` serves "all calls for this conversation" (not yet exposed in the UI);
  `provider_model_idx` serves the by-provider/by-model timeseries panels.

## Scaling considerations

- **SDK queue**: bounded at 10,000, drop-on-overflow (`dropped` counter, logged every 100
  drops), protecting the host app from a stalled ingest endpoint at the cost of silent loss past
  that bound. `ingest` itself holds only a Redis connection, so it scales horizontally with no
  coordination between replicas.
- **Redis consumer group** (`writers`): `XREADGROUP` gives each consumer a disjoint slice and
  `XACK` tracks per-consumer progress, so a second `worker` replica today would just work.
- **Postgres write path is batched**: up to 200 entries per read, one `executemany`. This single
  connection, single process is today's actual throughput ceiling.
- **At real volume**: low thousands of events/day is already over-provisioned. At sustained high
  volume, retention beats more Postgres: keep recent rows for Grafana, ship older rows to
  BigQuery or ClickHouse, since Postgres MVCC and index upkeep grow with table size in a way a
  columnar store does not; partition by `started_at` first, which makes dropping old data cheap
  instead of a vacuum-heavy `DELETE`.
- **Grafana reads Postgres directly**, no metrics layer. Fine while a `percentile_cont` over a
  time window stays fast; stops once panel queries compete with the worker for I/O, at which
  point a materialized rollup table should replace it.

## Failure handling assumptions

- **Provider down or errors**: the exception surfaces in `providers.py`; `generate()` yields an
  inline `[error] ...` chunk and still saves the partial text, while `steno`'s `send()` marks
  the event `status: "error"`.
- **Ingest down**: `flush_forever` retries 3 times (1s, 2s, 4s), then moves on. **The failed
  batch is not requeued or persisted; it is lost.** An outage longer than a few seconds loses
  whatever was queued, with no effect on the chat request itself.
- **Redis down**: `pipe.execute()` raises in `/v1/logs`, FastAPI returns 500, and the SDK retry
  loop eventually drops the batch. `/health` fails too, so an external check catches it.
- **Postgres down, or the worker crashes mid-batch**: the worker's connect at startup fails and
  the process exits, retried by `restart: unless-stopped`; a later drop crashes the worker on
  the next `executemany`. The batch is one transaction, so a crash before `commit` writes
  nothing and a crash between `commit` and `XACK` writes everything once; either way no Redis
  data is lost, since unacked entries replay from the "0" cursor and already-committed rows hit
  `ON CONFLICT DO NOTHING` on replay. Net effect: a delay, not a loss or a duplicate.
- **Duplicate delivery**: handled uniformly by the `event_id` unique constraint, whichever
  failure above caused the redelivery.
- **Malformed payload**: each event is validated on its own. A bad event is counted in
  `rejected` and skipped, the rest of the batch is queued, and the SDK does not inspect
  `rejected`, so a bug that produces invalid events shows up only in the ingest response, not in
  Grafana.

## Deployment

Local and production run the same `docker-compose.yml`; production adds
`deploy/compose.prod.yml` for restart policies, Grafana's public root URL, and a Caddy
container. Locally, one command:

```sh
docker compose up --build
```

Locally there is no Caddy, so Grafana answers directly at `localhost:3000/admin/` with no
allowlist check; that gate only exists once the app is on the open internet.

Production is the same file plus the overlay, on one free-tier `e2-micro` GCE instance
(`deploy/startup.sh` installs Docker and a 2 GB swapfile so the build does not OOM on a 1 GB
machine). `deploy/deploy.sh` tars the tree to the VM over `gcloud compute ssh`, writes `.env`
from a local `.env.prod` (provider keys, `PUBLIC_HOST`, `ADMIN_EMAILS`, `SESSION_SECRET`), and
runs the compose overlay.

One hostname, `steno.tn07.dev`, DNS-only (not proxied by Cloudflare), with a Let's Encrypt
certificate from Caddy, ports 80 and 443 open to the world. `deploy/Caddyfile` routes three
ways:

- `/admin/access` and `/api/admin/*` go straight to `chat`, ungated by Caddy: `/api/admin/check`
  must stay reachable since Caddy calls it for everything else, and `GET`/`PUT
  /api/admin/allowlist` do their own auth (`require_admin` in `chat/admin.py`) regardless of how
  the request arrived.
- Everything else under `/admin*` (Grafana) goes through `forward_auth chat:8000 { uri
  /api/admin/check }` first: anonymous gets a 302 to `/?signin=1&next=<uri>` so the SPA can open
  sign-in and return; signed in but not allowlisted gets 403; allowlisted gets 200 and Caddy
  proxies to Grafana, which keeps anonymous Viewer access on since only vetted requests ever
  reach it.
- Everything else goes to `chat`, streamed without buffering (`flush_interval -1`).

`admin_allowlist` is seeded from `ADMIN_EMAILS` on startup and edited from `/admin/access`; `PUT
/api/admin/allowlist` never lets the caller remove their own address.

**Why the chat host is not behind Cloudflare**: the first deployment used a Cloudflare Tunnel,
then a proxied origin, with the admin surface behind Cloudflare Access on a second hostname.
Measured from India, requests through Cloudflare's Mumbai colo to the US origin stalled for 5 to
17 s on about 40 percent of samples over both, while the same requests measured from inside the
VM took 130 to 190 ms and the raw path from India to the VM took a steady 0.8 to 1.2 s. Direct
proxying from the same colo also returned 522 connection timeouts on 10 to 30 percent of
attempts, with no SYN reaching the VM (packet capture) and a 0.0.0.0/0 firewall rule in place,
so this was Cloudflare's path, not the origin. The admin surface has since moved off Cloudflare
Access entirely, onto the same host and gate as above, so nothing in the request path depends on
Cloudflare today. Cost of the choice: ports 80 and 443 are open to the world, and DDoS
protection is gone. Cloudflare Web Analytics still counts visits through its beacon script in
`web/index.html`.

**Why not Cloud Run**: the pipeline needs a stateful Redis stream and Postgres regardless of
where the app code runs, so a serverless target still needs a managed Redis and Postgres beside
it, at higher cost than one VM running all five containers. At this traffic, a free-tier VM is
cheaper and no less correct.

### Build and release

GitHub Actions builds the image on every push to `main` (Workload Identity
Federation, no stored secrets) and pushes it to Artifact Registry with a
cleanup policy that keeps the last three versions. On the VM a systemd timer
runs `deploy/steno-pull.sh` every two minutes: it logs in to the registry with
the VM's own service account, pulls, and `compose up -d` recreates only the
containers whose image changed. The VM never builds: an e2-micro spent 4 to
17 minutes per build and served 502s while doing it. `deploy/deploy.sh` ships
config only (compose, Caddyfile, schema, dashboards, `.env`).

## What I would do with more time

1. Persist the SDK's dropped batches to disk and retry them: the biggest real gap above.
2. Expose the SDK's `dropped` counter, queue depth, and the ingest `rejected` count as metrics
   instead of log lines.
3. Add a conversation-scoped Grafana panel or UI view using the unused
   `inference_logs_session_idx`.
4. Partition `inference_logs` by `started_at` before an unpartitioned retention `DELETE` gets
   expensive, and add retry/backoff around provider calls themselves (distinct from the logging
   retry) so a transient 5xx is not always user-visible.
5. Add integration tests for the full path (ingest to Redis to worker to Postgres); today's unit
   tests cover only `parse_response`, `redact`, and the session cookie signer.
6. A "regenerate" affordance for a cancelled reply; the partial answer is already saved, nothing
   reads it back yet.
7. Message editing and retry: today a bad turn can only be forked away from, not corrected in
   place.
8. Public share links for a conversation, read-only, no sign-in.
   the swapfile only to survive its own build.
