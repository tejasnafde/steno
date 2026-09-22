# Architecture notes

## Overview

```
browser -> chat (FastAPI) -> provider SDKs (google-genai / openai / anthropic)
        -> steno (httpx patch: latency, ttft, tokens, previews, status)
        -> ingest (FastAPI, XADD) -> Redis stream -> worker (XREADGROUP)
        -> Postgres (inference_logs) -> Grafana (reads Postgres directly)
```

`chat` also owns `conversations` and `messages` in the same Postgres
instance, written directly with no queue. Only observability data goes
through the ingest/Redis/worker path.

## Ingestion flow

1. `chat/main.py` calls `steno.instrument()` at import time, patching
   `httpx.AsyncClient.send` and, if importable, the anthropic SDK's
   `httpx2` fork. No provider SDK code is touched.
2. `chat` wraps a provider call in `steno.session(str(conversation_id))`,
   a ContextVar set for the request, tagging any HTTP call underneath with
   that session id with no argument threading through `providers.py`.
3. Patched `send()` checks the request host against a `PROVIDERS` map and
   the path against inference substrings (`generatecontent`, `/messages`,
   `/chat/completions`, `/responses`). A non-match falls through to the
   original `send` untouched, so model listing and auth calls are never
   logged. On a match, an event dict is built before the request goes out:
   `event_id`, session id, provider, model, `started_at`, and an
   `input_preview` (redacted, last 300 characters of the last message).
4. Non-streaming responses are already fully read by the time `send()`
   returns, so the event finalizes immediately. Streaming responses get
   `response.stream` wrapped in a `TeeStream` that copies each chunk for
   later parsing while yielding it unchanged; it records `ttft_ms` on the
   first chunk and emits when the stream ends, is cancelled, or raises.
5. `emit()` puts the event on an in-process `asyncio.Queue` (lazy,
   `maxsize=10_000`), drained by one task, `flush_forever`: wait for one
   item, sleep 0.5s to let more arrive, drain up to 100, POST the batch to
   `STENO_ENDPOINT`, retrying 3 times with `2**attempt` backoff.

One event's shape, crossing the wire to ingest (fields trimmed for space):

```json
{"event_id": "5e7f9c2a-...", "session_id": "3f1e6b10-...",
 "provider": "google", "model": "gemini-3.5-flash", "status": "ok",
 "latency_ms": 842, "ttft_ms": 210, "input_tokens": 143, "output_tokens": 88,
 "started_at": "2026-09-22T10:15:03.120Z", "error": null,
 "input_preview": "...redacted tail", "output_preview": "...redacted head"}
```

6. `ingest/main.py` validates each event on its own (pydantic `Event`,
   max 500 per batch), pushes the valid ones with `XADD ... MAXLEN ~
   1_000_000`, and returns **202 Accepted** with `{"accepted": n,
   "rejected": m}` before any Postgres write. 202 means "durably queued in
   Redis", not "visible in Postgres or Grafana".
7. `ingest/worker.py` reads with `XREADGROUP`, count 200, block 2000ms,
   inserts the batch in one `executemany` (`ON CONFLICT (event_id) DO
   NOTHING`) inside one transaction, commits, then `XACK`s the entries.
   An entry counts as delivered only after the ack.

## Logging strategy

Instrumentation sits at the httpx layer, under all four provider SDKs,
instead of wrapping each SDK's client methods. One code path parses four
wire formats (Google, Anthropic, OpenAI, and Groq under `x_groq`) instead
of four call sites each hand-tracking latency and tokens. A new call site
in `chat/providers.py` needs zero logging code; wrapping each SDK method
instead breaks the moment a provider changes a signature or return type.
The anthropic SDK ships on `httpx2`, an internal fork, not `httpx`, and
patching only `httpx` would silently miss every Anthropic call, which is
why `instrument()` patches both and no-ops on `httpx2` if not installed.

`steno.session(conversation_id)` uses a ContextVar, not a parameter, so
tagging a log row with a conversation costs one `with` block, and is
per-asyncio-task, so concurrent requests do not bleed session ids.
`ttft_ms` is set once, on the first chunk delivered through
`TeeStream.__aiter__`, and stays null for non-streaming responses.

PII redaction (`steno/redact.py`, regexes for email, card, phone) runs
only on the preview fields, truncated to 300 characters. **Full prompts
and completions are never sent to ingest and never stored**: previews are
enough to eyeball a call in Grafana's "Recent" panel, and storing full
text here would duplicate what `chat`'s own `messages` table owns, with
none of its access control. `input_preview` keeps the last 300 characters
of the final message; `output_preview` keeps the first 300. That
asymmetry is intentional, not a bug.

## Cancellation

Two paths, both must emit a log row or Grafana under-counts cancellations.

1. **Before the first byte**: the browser aborts, Starlette cancels the
   request's generator, and `send()` is still awaiting `original_send`. It
   catches `asyncio.CancelledError`, marks the event `status: "cancelled"`,
   emits it, and re-raises. `TeeStream` is never involved here.
2. **Mid-stream**: `TeeStream.__aiter__`'s `async for` catches
   `CancelledError` (and `GeneratorExit`) and calls `finish("cancelled")`
   before re-raising. `aclose` also calls `finish`, a no-op after the
   first call, so whichever path fires first wins.

In `chat`, `send_message`'s `generate()` accumulates `parts` as each delta
streams out. Its `finally` block persists whatever was collected as an
assistant message under `asyncio.shield(...)`: the enclosing scope is
already cancelled, so without shielding the insert would itself raise
`CancelledError` before the write lands. A cancelled reply is saved, not
dropped, so the conversation can resume.

## Schema

Three tables in `db/schema.sql`, the single source of truth, loaded by
Postgres on first start.

- **`conversations`**: id, `user_id`, optional title (first 60 characters of
  the first user message), timestamps. Owned by `chat`. `user_id` is an
  anonymous per-browser identity from an HttpOnly `uid` cookie set on first
  request; every conversation query filters by it. There are no accounts,
  which is the right trade for a demo that strangers open from a link: no
  sign-up wall, and nobody sees another visitor's chats.
- **`messages`**: one row per turn, `role` constrained to
  `user`/`assistant`, `model` on assistant turns, a real foreign key to `conversations` (`on delete
  cascade`) and one index (`conversation_id, id`). Small, transactional,
  always read by conversation id, so both fit without complication.
- **`inference_logs`**: one row per LLM call, written only by the worker.
  Typed columns (provider, model, status, latency_ms, ttft_ms, tokens,
  started_at) cover everything Grafana groups, filters, or takes
  percentiles over; `jsonb metadata` holds the long tail (`{"stream":
  bool}`, or `{"parse_error": "..."}`) with no migration for new,
  rarely-queried fields. `event_id uuid unique` is the idempotency key:
  `flush_forever` retries a batch POST up to 3 times, and `ON CONFLICT
  (event_id) DO NOTHING` makes a retry safe to replay. `session_id` is a
  bare uuid, deliberately not a foreign key to `conversations.id`: a log
  event can outlive its conversation, and `steno` has no dependency on
  `chat`'s schema at all, so a third-party app could use the SDK with no
  `conversations` table in existence. A foreign key here would make the
  observability table depend on the product table, backwards from the
  ownership split the schema states. Indexes: `started_idx` (`started_at
  desc`) serves every panel's time filter; `session_idx` serves "all
  calls for this conversation" (not yet exposed in the UI);
  `provider_model_idx` serves the by-provider/by-model timeseries panels.

## Scaling considerations

- **SDK queue**: bounded at 10,000, drop-on-overflow (`dropped` counter,
  logged every 100 drops). Protects the host app from blocking on a stalled ingest
  endpoint, at the cost of silent loss past that bound. `ingest` itself
  holds only a Redis connection, so it scales horizontally with no
  coordination between replicas.
- **Redis consumer group** (`writers`): workers scale by adding consumers;
  `XREADGROUP` gives each a disjoint slice, `XACK` tracks per-consumer
  progress. A second `worker` replica today would just work.
- **Postgres write path is batched**: up to 200 entries per read, one
  `executemany`. This single connection, single process is today's actual
  throughput ceiling.
- **At real volume**: low thousands of events/day is already
  over-provisioned. At sustained high volume, retention beats more
  Postgres: keep recent rows for Grafana, ship older rows to BigQuery or
  ClickHouse, since Postgres MVCC and index upkeep grow with table size in
  a way a columnar store does not. Partition by `started_at` first, which
  makes dropping old data cheap instead of a vacuum-heavy `DELETE`.
- **Grafana reads Postgres directly**, no metrics layer. Fine while a
  `percentile_cont` over a time window stays fast; stops once panel
  queries compete with the worker for I/O, at which point a materialized
  rollup table should replace the raw-table queries.

## Failure handling assumptions

- **Provider down or errors**: the exception surfaces in `providers.py`;
  `generate()` yields an inline `[error] ...` chunk and still saves the
  partial text. `steno`'s `send()` marks the event `status: "error"`.
- **Ingest down**: `flush_forever` retries 3 times (1s, 2s, 4s), then
  moves on. **The failed batch is not requeued or persisted; it is lost.**
  The biggest gap here: an outage longer than a few seconds loses whatever
  was queued, with no effect on the chat request itself.
- **Redis down**: `pipe.execute()` raises in `/v1/logs`, FastAPI returns
  500, and the SDK retry loop above eventually drops the batch. `/health`
  fails too, so an external check catches it.
- **Postgres down, or the worker crashes mid-batch**: the worker's connect
  at startup fails and the process exits, retried by `restart:
  unless-stopped`; if Postgres drops after connecting, the next
  `executemany` raises and crashes the worker. The batch is one
  transaction, so a crash before `commit` writes nothing; a crash between
  `commit` and `XACK` writes everything once. Either way no Redis data is
  lost: unacked entries replay from the "0" cursor once both are back, and
  already-committed rows hit `ON CONFLICT DO NOTHING` on replay. Net
  effect: a delay, not a loss or a duplicate.
- **Duplicate delivery**: handled uniformly by the `event_id` unique
  constraint, whichever failure above caused the redelivery.
- **Malformed payload**: each event is validated on its own. A bad event
  is counted in `rejected` and skipped; the rest of the batch is queued.
  The SDK does not inspect `rejected`, so a bug that produces invalid
  events shows up only in the ingest response, not in Grafana.

## Deployment

Local and production run the same `docker-compose.yml`; production adds
`deploy/compose.prod.yml` for restart policies, Grafana's public root URL,
and a Caddy origin. Locally, one command:

```sh
docker compose up --build
```

Production is the same file plus the overlay, on one free-tier `e2-micro`
GCE instance (`deploy/startup.sh` installs Docker and a 2 GB swapfile so
the build does not OOM on a 1 GB machine). `deploy/deploy.sh` tars the
tree to the VM over `gcloud compute ssh`, writes `.env` from a local
`.env.prod`, and runs the compose overlay. A Caddy container fronts two
hostnames:

- `steno.tn07.dev` (chat) is DNS-only and served direct with a Let's
  Encrypt certificate. Caddy proxies to `chat`, streams without buffering,
  and 308-redirects `/admin*` and `/api/admin/*` to the admin host.
- `steno-admin.tn07.dev` (Grafana, the allowlist page, the allowlist API)
  is proxied by Cloudflare so Cloudflare Access can gate it with an email
  allowlist. The zone runs SSL mode `full`, so Caddy's own CA certificate
  is enough on that host. Anonymous Viewer access is on in Grafana only
  because Access is the real auth layer in front of it.

The allowlist is editable from `/admin/access` on the admin host, a page in
the chat app that calls the Access API with a scoped token (`CF_ACCESS_*`
in `.env.prod`); the page is inside the protected path, so only allowlisted
users reach it, and it refuses to remove the caller's own address.

**Why the chat host is not behind Cloudflare**: the first deployment used a
Cloudflare Tunnel, then a proxied origin. Measured from India, requests
through Cloudflare's Mumbai colo to the US origin stalled for 5 to 17 s on
about 40 percent of samples over both, while the same requests measured
from inside the VM took 130 to 190 ms and the raw path from India to the
VM took a steady 0.8 to 1.2 s. Visitors talk to the VM directly; only the
admin surface, used by one person, pays the Cloudflare hop for Access.
Cost of the choice: ports 80 and 443 are open to the world, and DDoS
protection is gone for the chat host. Cloudflare Web Analytics still
counts visits through its beacon script.

**Why not Cloud Run**: the pipeline needs a stateful Redis stream and
Postgres regardless of where the app code runs, so a serverless target
still needs a managed Redis and Postgres beside it, at higher cost than
one VM running all five containers. At this traffic, a free-tier VM is
cheaper and no less correct.

## What I would do with more time

1. Persist the SDK's dropped batches to disk and retry them: the biggest
   real gap above.
2. Expose the SDK's `dropped` counter, queue depth, and the ingest
   `rejected` count as metrics instead of log lines.
3. Add a conversation-scoped Grafana panel or UI view using the unused
   `inference_logs_session_idx`.
4. Partition `inference_logs` by `started_at` before an unpartitioned
   retention `DELETE` gets expensive, and add retry/backoff around
   provider calls themselves (distinct from the logging retry) so a
   transient 5xx is not always user-visible.
5. Add integration tests for the full path (ingest to Redis to worker to
   Postgres); only `parse_response` and `redact` are unit tested today.
6. A "regenerate" affordance for a cancelled reply; the partial answer is
   already saved, nothing reads it back yet.
