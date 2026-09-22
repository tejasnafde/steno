# steno

A small chatbot plus an auto-instrumenting SDK that logs every LLM call into
an event pipeline and Postgres, with Grafana dashboards on top. The SDK
patches httpx under the official provider SDKs, so no call site in the
chatbot knows it is being logged.

```
browser -> chat (FastAPI, streamed responses)
              |  official provider SDKs (google-genai / openai / anthropic; Groq rides the openai SDK)
              |  steno patches httpx underneath them: latency, ttft, tokens, previews, status
              v
           ingest (FastAPI)  --XADD-->  Redis stream  --XREADGROUP-->  worker  -->  Postgres  -->  Grafana
```

## Quickstart

```sh
cp .env.example .env        # set at least one of GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY
docker compose up --build
open http://localhost:8000       # chat UI
open http://localhost:3000/admin/  # Grafana dashboards
```

## Layout

| Path | What |
|---|---|
| `steno/` | The SDK. `instrument()` patches `AsyncClient.send` on `httpx` and `httpx2` (the anthropic SDK's fork). `session(id)` tags calls with a conversation id via a ContextVar. Events batch in memory and flush to `STENO_ENDPOINT`. |
| `chat/` | Chatbot API (`main.py`), one streaming generator per provider (`providers.py`), and the Cloudflare Access allowlist API (`access.py`). Owns `conversations` and `messages`, scoped to an anonymous per-browser `uid` cookie. Serves the built `web/` UI as static files. |
| `web/` | React UI: Vite, TypeScript, Tailwind v4, shadcn (base-nova). `src/lib/api.ts` is the fetch layer, `src/hooks/use-chat.ts` holds the chat state, `src/components/*` one component per file. `/admin/access` edits who may open `/admin`. |
| `ingest/` | `main.py` validates a batch of events and appends to a Redis stream, returns 202. `worker.py` reads the stream with a consumer group and writes to Postgres, idempotent on `event_id`. |
| `db/` | `schema.sql`, the only schema definition. Three tables: `conversations`, `messages`, `inference_logs`. Decisions live in its comments. |
| `grafana/` | Provisioned datasource (reads Postgres directly) and the `Inference` dashboard. |
| `deploy/` | Production compose overlay, VM startup script, and the deploy script for a single free-tier GCE instance behind a Cloudflare Tunnel. |

## Using the SDK in your own app

```python
import steno
steno.instrument("http://ingest:8001/v1/logs")

with steno.session(conversation_id):
    ...  # any google-genai / openai / anthropic call, streaming or not
```

Nothing else changes. The SDK only looks at requests whose host matches a
known provider and whose path looks like an inference call; everything else
passes through untouched.

## Tests

```sh
python -m pytest -q
```

Covers response parsing for each provider's wire format (Google, Anthropic,
OpenAI, Groq) and the PII redaction regexes.

## Bonus checklist (from the assignment)

| Item | Status |
|---|---|
| Multi-provider | Done: Gemini, Groq (open-weight model), OpenAI, and an Anthropic adapter. |
| Streaming | Done, for all four providers. |
| Latency / throughput / error dashboards | Done, Grafana reading Postgres directly. |
| Docker Compose, one command | Done: `docker compose up --build`. |
| Event based | Done: Redis Streams with a consumer group, not a direct DB write from ingest. |
| PII redaction | Done: regex redaction on preview fields only; full prompts are never stored. |
| Cancel / list / resume conversations | Done: abort mid-stream saves the partial answer so the conversation can continue. |
| Self-hosted Kubernetes | Not done. One free-tier VM with Compose is the cheapest correct deployment at this traffic; Kubernetes adds operational cost with no benefit at this scale. |

See `ARCHITECTURE.md` for the full ingestion flow, schema reasoning, scaling
considerations, and failure handling assumptions.

## Deploy

`deploy/deploy.sh` ships the working tree to a GCE VM over `gcloud compute ssh` and
runs `docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d --build`.
It reads a local `.env.prod` with `PUBLIC_HOST`, `TUNNEL_TOKEN`, and the
provider API keys. `deploy/startup.sh` is the one-time VM setup (Docker plus
a swapfile) run from the GCE instance metadata.

## Dashboards

Grafana reads `inference_logs` directly (no Prometheus) at http://localhost:3000/admin/.
The `Inference` dashboard has five rows: Overview (call count, error and cancel
rate, p95 latency, total tokens), Latency (p50/p95 latency and ttft by model),
Throughput (calls and tokens per interval), Errors (error/cancel counts and a
table of recent failures), and Recent (last 50 calls with previews).
Anonymous Viewer access is on because the deployed instance sits behind
Cloudflare Access, which handles auth in front of it.
