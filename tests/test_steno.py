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
