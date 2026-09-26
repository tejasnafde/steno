# Agent notes

Small codebase, keep it that way. Read this before editing.

## Layout

- `steno/` is the SDK. `instrument()` patches `AsyncClient.send` on `httpx` and `httpx2` (the anthropic SDK moved to that fork; patching one misses the other). `session(id)` tags calls through a ContextVar. Events queue in memory and flush in batches to `STENO_ENDPOINT`.
- `chat/` is the chatbot API: FastAPI routes in `main.py`, one async generator per provider in `providers.py`, identity and the session cookie in `auth.py`, the admin allowlist and the forward_auth check in `admin.py`, the connection pool in `db.py`, quotas in `quota.py`, page-load tracking in `visits.py`, list prices in `prices.py` (add a model there when you add one to `DEFAULT_MODEL` or `CHEAP`), and generated-image storage in `images.py` (GCS when `IMAGE_BUCKET` is set, data URI otherwise). It owns `users`, `admin_allowlist`, `conversations`, and `messages`. It serves `chat/static` when present; the Dockerfile builds `web/` into it.
- `web/` is the React UI: Vite, TypeScript, Tailwind v4, shadcn (base-nova preset, so use `render`, not `asChild`). Structure: `src/lib/api.ts` (fetch layer and types), `src/hooks/use-chat.ts` (conversation and streaming state), `src/hooks/use-auth.ts` (sign-in state), `src/components/*.tsx` (one component per file, including `message-actions.tsx` for copy and branch), `src/components/ui` (shadcn, do not hand-edit). Dev: `npm run dev` in `web/` proxies `/api` to :8000.
- `ingest/main.py` validates batches and appends to a Redis stream. `ingest/worker.py` consumes with a consumer group and inserts into `inference_logs`.
- `db/schema.sql` is the only schema definition. Postgres loads it on first start. Schema decisions live in its comments.

## Commands

```sh
docker compose up --build          # everything
python -m pytest -q                # unit tests (needs .venv with requirements + pytest)
docker compose exec postgres psql -U app -d app
docker compose logs -f chat ingest worker          # request logs (uvicorn) and worker batch counts
gcloud --configuration=personal compute ssh steno --zone us-central1-a -- \
  'cd app && sudo docker compose -f docker-compose.yml -f deploy/compose.prod.yml logs -f --tail 100 chat'
```

Latency: `inference_logs.latency_ms` and `ttft_ms` are provider-side numbers measured at the httpx layer. The chat
service adds about 20 ms before the first byte (three Postgres queries, about 1 ms). The UI shows client-measured
first token and total per reply. Grafana has p50/p95 by model.

## Conventions

- No leading-underscore names. Module scope is the privacy boundary.
- UI is built from shadcn components only. Check `web/src/components/ui` before writing markup; add with `npx shadcn@latest add <name>`.
- No em dashes anywhere. No emoji in code or UI copy.
- Comments explain a decision or a ceiling, not what the code does.
- One flat module per concern. Do not add packages, base classes, or config layers for one use.
- Commit messages: plain imperative subject, no AI attribution trailers.

## Release

Push to `main`. GitHub Actions builds and publishes the image; the VM pulls it within two minutes
(`deploy/steno-pull.timer`). Run `deploy/deploy.sh` only when compose, Caddyfile, schema, dashboards or `.env` change.
A schema change needs `docker compose down -v` on the VM first; there are no migrations.

## Behaviour worth knowing

- Cancel: the browser aborts the fetch, Starlette cancels the generator, the SDK closes the response, `TeeStream.aclose` logs `cancelled`, and the partial answer is saved under `asyncio.shield`.
- A cancel before the first byte surfaces as `CancelledError` inside `send`, not in the stream. Both paths emit.
- Gemini reports cumulative `usageMetadata` on every chunk; the parser keeps the last one.
- Retry and edit are one operation: `POST .../truncate {after}` drops later messages, then the client sends again.
- Share links: `share_token` on the conversation; `/s/<token>` and `/api/shared/<token>` are public, `DELETE .../share` revokes.
- Image models (Gemini `nano-banana`, anything with `image` in the id) return `inline_data` parts; `providers.google` uploads them through `images.store` and yields a Markdown image. `IMAGE_MARKDOWN` strips any image from history before it goes back to a model.
- The worker starts reading at `"0"` to replay its own pending entries, then switches to `">"`.
- The `session` cookie is `uid|email|issued_at` plus a `.`-separated HMAC-SHA256 signature over that payload with `SESSION_SECRET`. `verify()` checks the signature, then checks the 30-day window against `issued_at`; there is no separate expiry field.
- Caddy's `forward_auth` calls `GET /api/admin/check` before proxying `/admin*`. Anonymous gets a 302 to `/?signin=1&next=<uri>` so the SPA can open sign-in and return; signed in but not on `admin_allowlist` gets 403; allowlisted gets 200 and Caddy proxies through.
- In `send_message`'s `generate()`, title generation is scheduled with `asyncio.create_task` before the `asyncio.shield`-ed message insert, not after: once the request is cancelled, any `await` past that point re-raises immediately, so code placed after the shielded insert would never run. See the comment in `chat/main.py`.
