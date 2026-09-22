"""One async generator of text deltas per provider, all through official SDKs.
llmlog observes these calls at the httpx layer, so nothing here knows about logging."""
import os

DEFAULT_MODEL = {
    "google": "gemini-3.5-flash",
    "groq": "openai/gpt-oss-120b",
    "openai": "gpt-4.1-mini",
    "anthropic": "claude-opus-5",
}
clients: dict = {}


def client(name, factory):
    if name not in clients:  # lazy, so a missing key only fails the provider you pick
        clients[name] = factory()
    return clients[name]


async def google(model, messages):
    from google import genai
    c = client("google", lambda: genai.Client(api_key=os.environ["GEMINI_API_KEY"]))
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages]
    async for chunk in await c.aio.models.generate_content_stream(model=model, contents=contents):
        if chunk.text:
            yield chunk.text


async def anthropic(model, messages):
    from anthropic import AsyncAnthropic
    c = client("anthropic", AsyncAnthropic)
    async with c.messages.stream(model=model, max_tokens=16000, messages=messages) as s:
        async for text in s.text_stream:
            yield text


def openai_compatible(name, base_url=None, key_env="OPENAI_API_KEY"):
    async def generate(model, messages):
        from openai import AsyncOpenAI
        c = client(name, lambda: AsyncOpenAI(base_url=base_url, api_key=os.environ[key_env]))
        stream = await c.chat.completions.create(model=model, messages=messages, stream=True, stream_options={"include_usage": True})
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    return generate


PROVIDERS = {
    "google": google,
    "groq": openai_compatible("groq", "https://api.groq.com/openai/v1", "GROQ_API_KEY"),
    "openai": openai_compatible("openai"),
    "anthropic": anthropic,
}


def stream(provider: str, model: str | None, messages: list[dict]):
    return PROVIDERS[provider](model or DEFAULT_MODEL[provider], messages)
