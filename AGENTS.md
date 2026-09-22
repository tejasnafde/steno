# Agent notes

Small codebase, keep it that way. Read this before editing.

## Layout

- `llmlog/` is the SDK. `instrument()` patches `AsyncClient.send` on `httpx` and `httpx2` (the anthropic SDK moved to that fork; patching one misses the other). `session(id)` tags calls through a ContextVar. Events queue in memory and flush in batches to `LLMLOG_ENDPOINT`.
- `chat/` is the chatbot API: FastAPI routes in `main.py`, one async generator per provider in `providers.py`. It owns `conversations` and `messages`. It serves `chat/static` when present; the Dockerfile builds `web/` into it.
- `web/` is the React UI: Vite, TypeScript, Tailwind v4, shadcn (base-nova preset, so use `render`, not `asChild`). Structure: `src/lib/api.ts` (fetch layer and types), `src/hooks/use-chat.ts` (all state), `src/components/*.tsx` (one component per file), `src/components/ui` (shadcn, do not hand-edit). Dev: `npm run dev` in `web/` proxies `/api` to :8000.
- `ingest/main.py` validates batches and appends to a Redis stream. `ingest/worker.py` consumes with a consumer group and inserts into `inference_logs`.
- `db/schema.sql` is the only schema definition. Postgres loads it on first start. Schema decisions live in its comments.

## Commands

```sh
docker compose up --build          # everything
python -m pytest -q                # unit tests (needs .venv with requirements + pytest)
docker compose exec postgres psql -U app -d app
docker compose logs -f chat ingest worker          # request logs (uvicorn) and worker batch counts
gcloud --configuration=personal compute ssh llmlog --zone us-central1-a -- \
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

## Behaviour worth knowing

- Cancel: the browser aborts the fetch, Starlette cancels the generator, the SDK closes the response, `TeeStream.aclose` logs `cancelled`, and the partial answer is saved under `asyncio.shield`.
- A cancel before the first byte surfaces as `CancelledError` inside `send`, not in the stream. Both paths emit.
- Gemini reports cumulative `usageMetadata` on every chunk; the parser keeps the last one.
- The worker starts reading at `"0"` to replay its own pending entries, then switches to `">"`.
