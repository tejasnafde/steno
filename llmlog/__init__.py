"""Auto-instrumentation for LLM calls.

instrument() patches AsyncClient.send in httpx and httpx2 (the anthropic SDK's fork). Every
request to a known provider host is timed, parsed for model, tokens and previews, then
shipped to the ingestion endpoint in batches. Application code only uses the provider SDKs.
"""
import asyncio
import contextlib
import contextvars
import json
import os
import time
import uuid
from datetime import datetime, timezone

import httpx

from .redact import redact

PROVIDERS = {
    "generativelanguage.googleapis.com": "google",
    "aiplatform.googleapis.com": "google",
    "api.anthropic.com": "anthropic",
    "api.openai.com": "openai",
    "api.groq.com": "groq",
}
OPENAI_WIRE = {"openai", "groq"}
INFERENCE_PATHS = ("generatecontent", "/messages", "/chat/completions", "/responses")
PREVIEW_CHARS = 300
BATCH_SIZE = 100
FLUSH_SECONDS = 0.5

session_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("llmlog_session", default=None)
endpoint = os.environ.get("LLMLOG_ENDPOINT", "http://localhost:8001/v1/logs")
queue: asyncio.Queue | None = None
flusher: asyncio.Task | None = None
dropped = 0


@contextlib.contextmanager
def session(session_id: str):
    """Tag every LLM call made inside the block with a conversation id."""
    token = session_var.set(session_id)
    try:
        yield
    finally:
        session_var.reset(token)


def instrument(url: str | None = None) -> None:
    global endpoint
    if url:
        endpoint = url
    patch(httpx)
    try:
        import httpx2
    except ImportError:
        return
    patch(httpx2)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def elapsed_ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def model_name(provider: str, path: str, body: dict) -> str | None:
    if provider == "google":  # /v1beta/models/{model}:streamGenerateContent
        return path.rsplit("/models/", 1)[-1].split(":")[0] or None
    return body.get("model")


def input_text(provider: str, body: dict) -> str:
    try:
        if provider == "google":
            return "".join(p.get("text", "") for p in body["contents"][-1]["parts"])
        content = body["messages"][-1]["content"]
        if isinstance(content, list):
            return "".join(b.get("text", "") for b in content if isinstance(b, dict))
        return str(content)
    except (KeyError, IndexError, TypeError):
        return ""


def parse_response(provider: str, content_type: str, raw: bytes) -> tuple[str, int | None, int | None]:
    """Return (output_text, input_tokens, output_tokens) from a full response body, SSE or JSON."""
    text = raw.decode("utf-8", "replace")
    if "text/event-stream" in content_type:
        lines = (line[5:].strip() for line in text.splitlines() if line.startswith("data:"))
        objs = [json.loads(d) for d in lines if d and d != "[DONE]"]
    else:
        objs = [json.loads(text)] if text.strip() else []

    out, inp, outp = [], None, None
    for o in objs:
        if provider == "google":
            for c in o.get("candidates") or []:
                for p in (c.get("content") or {}).get("parts") or []:
                    out.append(p.get("text", ""))
            if u := o.get("usageMetadata"):
                inp, outp = u.get("promptTokenCount"), u.get("candidatesTokenCount")
        elif provider == "anthropic":
            t = o.get("type")
            if t == "content_block_delta":
                out.append(o["delta"].get("text", ""))
            elif t == "message_start":
                inp = o["message"]["usage"].get("input_tokens")
            elif t == "message_delta":
                outp = o["usage"].get("output_tokens")
            elif t == "message":
                out += [b.get("text", "") for b in o.get("content", [])]
                inp, outp = o["usage"].get("input_tokens"), o["usage"].get("output_tokens")
        elif provider in OPENAI_WIRE:
            for c in o.get("choices") or []:
                out.append((c.get("delta") or c.get("message") or {}).get("content") or "")
            if u := o.get("usage") or (o.get("x_groq") or {}).get("usage"):
                inp, outp = u.get("prompt_tokens"), u.get("completion_tokens")
    return "".join(out), inp, outp


def finalize(event: dict, content_type: str, raw: bytes) -> None:
    try:
        text, inp, outp = parse_response(event["provider"], content_type, raw)
        event["input_tokens"], event["output_tokens"] = inp, outp
        event["output_preview"] = redact(text)[:PREVIEW_CHARS]
        if event["status"] == "error" and not event.get("error"):
            event["error"] = raw[:PREVIEW_CHARS].decode("utf-8", "replace")
    except Exception as e:  # logging must never break the app
        event["metadata"]["parse_error"] = repr(e)[:200]


def emit(event: dict) -> None:
    global queue, flusher, dropped
    if queue is None:
        queue = asyncio.Queue(maxsize=10_000)
        flusher = asyncio.get_running_loop().create_task(flush_forever())
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        dropped += 1  # drop on overflow; spill to disk if ingest outages must be lossless
        if dropped % 100 == 1:
            print(f"llmlog: dropped {dropped} events, ingest not keeping up", flush=True)


async def flush_forever() -> None:
    async with httpx.AsyncClient(timeout=5) as client:
        while True:
            batch = [await queue.get()]
            await asyncio.sleep(FLUSH_SECONDS)
            while not queue.empty() and len(batch) < BATCH_SIZE:
                batch.append(queue.get_nowait())
            for attempt in range(3):
                try:
                    (await client.post(endpoint, json={"events": batch})).raise_for_status()
                    break
                except Exception:
                    await asyncio.sleep(2**attempt)


def patch(mod) -> None:
    if getattr(mod.AsyncClient.send, "patched", False):
        return
    original_send = mod.AsyncClient.send

    class TeeStream(mod.AsyncByteStream):
        """Wraps a streaming response body: copies bytes for parsing, emits once when it ends."""

        def __init__(self, inner, event, content_type, t0):
            self.inner, self.event, self.content_type, self.t0 = inner, event, content_type, t0
            self.chunks: list[bytes] = []
            self.done = False

        async def __aiter__(self):
            try:
                async for chunk in self.inner:
                    if "ttft_ms" not in self.event:
                        self.event["ttft_ms"] = elapsed_ms(self.t0)
                    self.chunks.append(chunk)
                    yield chunk
                self.finish("ok")
            except (asyncio.CancelledError, GeneratorExit):
                self.finish("cancelled")
                raise
            except Exception as e:
                self.finish("error", repr(e))
                raise

        async def aclose(self):
            self.finish("cancelled")  # no-op after a normal finish
            await self.inner.aclose()

        def finish(self, status, error=None):
            if self.done:
                return
            self.done = True
            event = self.event
            event["latency_ms"] = elapsed_ms(self.t0)
            if event["status"] == "ok":  # an HTTP error status set earlier wins
                event["status"], event["error"] = status, error
            finalize(event, self.content_type, b"".join(self.chunks))
            emit(event)

    async def send(self, request, **kwargs):
        provider = PROVIDERS.get(request.url.host)
        if not provider or not any(p in request.url.path.lower() for p in INFERENCE_PATHS):
            return await original_send(self, request, **kwargs)

        try:
            body = json.loads(request.content or b"{}")
        except ValueError:
            body = {}
        event = {
            "event_id": str(uuid.uuid4()),
            "session_id": session_var.get(),
            "provider": provider,
            "model": model_name(provider, request.url.path, body),
            "status": "ok",
            "started_at": now(),
            "input_preview": redact(input_text(provider, body))[-PREVIEW_CHARS:],
            "metadata": {"stream": bool(body.get("stream")) or "stream" in request.url.path.lower()},
        }
        t0 = time.perf_counter()
        try:
            response = await original_send(self, request, **kwargs)
        except asyncio.CancelledError:
            event.update(status="cancelled", latency_ms=elapsed_ms(t0))
            emit(event)
            raise
        except Exception as e:
            event.update(status="error", error=repr(e)[:PREVIEW_CHARS], latency_ms=elapsed_ms(t0))
            emit(event)
            raise

        event["http_status"] = response.status_code
        if response.status_code >= 400:
            event["status"] = "error"
        content_type = response.headers.get("content-type", "")
        if response.is_stream_consumed:  # non-streaming: httpx read the body inside send()
            event["latency_ms"] = elapsed_ms(t0)
            finalize(event, content_type, response.content)
            emit(event)
        else:
            response.stream = TeeStream(response.stream, event, content_type, t0)
        return response

    send.patched = True
    mod.AsyncClient.send = send
