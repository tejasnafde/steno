"""Run with: python -m pytest -q"""
from steno import completed, parse_response
from steno.redact import redact

SSE = "text/event-stream"


def test_google_sse():
    raw = (b'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n'
           b'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":2}}\n\n')
    assert parse_response("google", SSE, raw) == ("Hello", 7, 2)


def test_anthropic_sse():
    raw = (b'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":11}}}\n\n'
           b'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n'
           b'data: {"type":"message_delta","usage":{"output_tokens":3}}\n\n')
    assert parse_response("anthropic", SSE, raw) == ("Hi", 11, 3)


def test_openai_sse_and_json():
    raw = (b'data: {"choices":[{"delta":{"content":"Yo"}}]}\n\n'
           b'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1}}\n\ndata: [DONE]\n\n')
    assert parse_response("openai", SSE, raw) == ("Yo", 5, 1)
    js = b'{"choices":[{"message":{"content":"full"}}],"usage":{"prompt_tokens":2,"completion_tokens":1}}'
    assert parse_response("openai", "application/json", js) == ("full", 2, 1)


def test_groq_usage_field():
    raw = b'data: {"choices":[{"delta":{"content":"a"}}],"x_groq":{"usage":{"prompt_tokens":9,"completion_tokens":1}}}\n\n'
    assert parse_response("groq", SSE, raw) == ("a", 9, 1)


def test_completed_markers():
    assert completed("groq", b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
    assert not completed("groq", b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
    assert completed("google", b'data: {"candidates":[{"finishReason":"STOP"}]}')
    assert not completed("anthropic", b'data: {"type":"content_block_delta"}')


def test_redact():
    out = redact("mail a@b.co, card 4111 1111 1111 1111, phone +91 84528 67602, year 2024")
    assert "[EMAIL]" in out and "[CARD]" in out and "[PHONE]" in out and "2024" in out


def test_session_cookie_roundtrip(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://x")
    from chat import auth
    cookie = auth.sign("uid123", "a@b.co")
    v = auth.verify(cookie)
    assert v and v.user_id == "uid123" and v.email == "a@b.co" and not v.anonymous
    assert auth.verify(cookie[:-1] + ("0" if cookie[-1] != "0" else "1")) is None
    assert auth.verify("garbage") is None


def test_friendly_errors(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://x")
    from chat.providers import friendly_error

    class Status(Exception):
        def __init__(self, status_code, body):
            self.status_code, self.body = status_code, body

    bad_key = Status(401, {"error": {"code": "invalid_api_key", "message": "Incorrect API key provided: sk-proj-xxx"}})
    assert friendly_error(bad_key, "openai", "gpt-4.1-mini") == "OpenAI rejected the API key. Check it under Your keys."
    assert "sk-proj" not in friendly_error(bad_key, "openai", "gpt-4.1-mini")
    no_credit = Status(429, {"error": {"code": "credit_balance_exhausted", "message": "You have no credits remaining."}})
    assert "no credit left" in friendly_error(no_credit, "openai", "gpt-4.1-mini")
    assert "rate limiting" in friendly_error(Status(429, {"error": {"code": "rate_limit_exceeded", "message": "slow down"}}), "groq", "x")
    assert "does not offer the model nope" in friendly_error(Status(404, {"error": {"message": "model nope not found"}}), "google", "nope")
    assert "having trouble" in friendly_error(Status(503, {}), "anthropic", "x")
    assert friendly_error(TimeoutError("t"), "groq", "x").startswith("Could not reach Groq")


def test_burst_window(monkeypatch):
    import asyncio
    monkeypatch.setenv("DATABASE_URL", "postgresql://x")
    from chat import quota
    from chat.auth import Viewer
    from fastapi import HTTPException

    class Req:
        headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}
        client = None

    async def no_db(*a, **k):
        return None

    monkeypatch.setattr(quota, "q", no_db)
    quota.recent.clear()
    v = Viewer("visitor-1")
    for _ in range(quota.BURST_PER_MINUTE):
        asyncio.run(quota.check(v, Req(), own_key=True))
    try:
        asyncio.run(quota.check(v, Req(), own_key=True))
        assert False, "expected 429"
    except HTTPException as e:
        assert e.status_code == 429 and "Slow down" in e.detail
