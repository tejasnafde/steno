# Agent notes

Small codebase, keep it that way. Read this before editing.

## Layout

- `llmlog/` is the SDK. `instrument()` patches `AsyncClient.send` on `httpx` and `httpx2` (the anthropic SDK moved to that fork; patching one misses the other). `session(id)` tags calls through a ContextVar. Events queue in memory and flush in batches to `LLMLOG_ENDPOINT`.
- `chat/` is the chatbot: FastAPI routes in `main.py`, one async generator per provider in `providers.py`, a single static `index.html`. It owns `conversations` and `messages`.
- `ingest/main.py` validates batches and appends to a Redis stream. `ingest/worker.py` consumes with a consumer group and inserts into `inference_logs`.
- `db/schema.sql` is the only schema definition. Postgres loads it on first start. Schema decisions live in its comments.

## Commands

```sh
docker compose up --build          # everything
python -m pytest -q                # unit tests (needs .venv with requirements + pytest)
docker compose exec postgres psql -U app -d app
```

## Conventions

- No leading-underscore names. Module scope is the privacy boundary.
- No em dashes anywhere. No emoji in code or UI copy.
- Comments explain a decision or a ceiling, not what the code does.
- One flat module per concern. Do not add packages, base classes, or config layers for one use.
- Commit messages: plain imperative subject, no AI attribution trailers.

## Behaviour worth knowing

- Cancel: the browser aborts the fetch, Starlette cancels the generator, the SDK closes the response, `TeeStream.aclose` logs `cancelled`, and the partial answer is saved under `asyncio.shield`.
- A cancel before the first byte surfaces as `CancelledError` inside `send`, not in the stream. Both paths emit.
- Gemini reports cumulative `usageMetadata` on every chunk; the parser keeps the last one.
- The worker starts reading at `"0"` to replay its own pending entries, then switches to `">"`.
