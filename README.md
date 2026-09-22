# inference-logger

A small chatbot plus an auto-instrumenting SDK that logs every LLM call into an ingestion pipeline and Postgres.

```
browser -> chat (FastAPI, SSE-style streaming)
              |  official provider SDKs (google-genai / openai / anthropic; Groq rides the openai SDK)
              |  llmlog patches httpx underneath them: latency, ttft, tokens, previews, status
              v
           ingest (FastAPI)  --XADD-->  Redis stream  --XREADGROUP-->  worker  -->  Postgres
```

## Run

```sh
cp .env.example .env     # set at least one provider key
docker compose up --build
open http://localhost:8000
```

## Layout

| Path | What |
|---|---|
| `llmlog/` | The SDK. `llmlog.instrument()` patches `httpx`/`httpx2` `AsyncClient.send`; `llmlog.session(id)` tags calls. Zero app code changes. |
| `chat/` | Chatbot API and static UI. Owns `conversations` and `messages`. |
| `ingest/main.py` | Validates event batches, appends to a Redis stream, returns 202. |
| `ingest/worker.py` | Consumer group reader, idempotent inserts into `inference_logs`. |
| `db/schema.sql` | Three tables. See comments for the decisions. |

## Test

```sh
python -m pytest -q
```

Agent and contributor notes: `AGENTS.md`. Architecture notes: `ARCHITECTURE.md` (pending).
