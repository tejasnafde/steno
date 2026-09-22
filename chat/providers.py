"""One async generator of text deltas per provider, all through official SDKs.
steno observes these calls at the httpx layer, so nothing here knows about logging."""
import asyncio
import os

# SDKs are imported inside the provider functions and pulled in at startup by warm() for the providers
# that have a key. On a 1 GB shared-core VM an unused SDK is 30 MB of resident memory that ends up in swap.

DEFAULT_MODEL = {
    "google": "gemini-3.5-flash-lite",  # lowest time to first token of the family (measured 0.8 to 1.9 s)
    "groq": "openai/gpt-oss-120b",
    "openai": "gpt-4.1-mini",
    "anthropic": "claude-opus-5",
}
# Cheapest configured model, used for one-line jobs like conversation titles. Checked in this order.
CHEAP = {"groq": "openai/gpt-oss-20b", "google": "gemini-3.5-flash-lite", "openai": "gpt-4.1-nano", "anthropic": "claude-haiku-4-5"}
clients: dict = {}


def client(name, factory, key=None):
    """One SDK client per (provider, key). key is a visitor's own key (BYOK); None means the server's."""
    if (name, key) not in clients:  # lazy, so a missing key only fails the provider you pick
        clients[(name, key)] = factory()
    return clients[(name, key)]


async def google(model, messages, key=None):
    from google import genai
    c = client("google", lambda: genai.Client(api_key=key or os.environ["GEMINI_API_KEY"]), key)
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages]
    async for chunk in await c.aio.models.generate_content_stream(model=model, contents=contents):
        if chunk.text:
            yield chunk.text


async def anthropic(model, messages, key=None):
    from anthropic import AsyncAnthropic
    c = client("anthropic", lambda: AsyncAnthropic(api_key=key or os.environ["ANTHROPIC_API_KEY"]), key)
    async with c.messages.stream(model=model, max_tokens=16000, messages=messages) as s:
        async for text in s.text_stream:
            yield text


def openai_compatible(name, base_url=None, key_env="OPENAI_API_KEY"):
    async def generate(model, messages, key=None):
        from openai import AsyncOpenAI
        c = client(name, lambda: AsyncOpenAI(base_url=base_url, api_key=key or os.environ[key_env]), key)
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


KEY_ENV = {"google": "GEMINI_API_KEY", "groq": "GROQ_API_KEY", "openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}
NOT_CHAT = ("whisper", "tts", "guard", "orpheus", "embedding", "moderation", "dall-e", "image", "audio", "realtime", "transcribe")
models_cache: dict[tuple, list[str]] = {}
BYOK = ("openai", "anthropic")  # providers a visitor may bring their own key for


async def list_models(provider: str, key: str | None = None) -> list[str]:
    """Model ids the key can use, fetched once per (provider, key)."""
    if (provider, key) in models_cache:
        return models_cache[(provider, key)]
    ids: list[str] = []
    try:
        if provider == "google":
            from google import genai
            c = client("google", lambda: genai.Client(api_key=key or os.environ["GEMINI_API_KEY"]), key)
            async for m in await c.aio.models.list():
                if "generateContent" in (m.supported_actions or []):
                    ids.append(m.name.removeprefix("models/"))
        elif provider == "anthropic":
            from anthropic import AsyncAnthropic
            ids = [m.id async for m in client("anthropic", lambda: AsyncAnthropic(api_key=key or os.environ["ANTHROPIC_API_KEY"]), key).models.list()]
        else:
            from openai import AsyncOpenAI
            factory = lambda: AsyncOpenAI(base_url="https://api.groq.com/openai/v1" if provider == "groq" else None, api_key=key or os.environ[KEY_ENV[provider]])
            ids = [m.id async for m in client(provider, factory, key).models.list()]
    except Exception:
        ids = []
    ids = sorted(i for i in ids if not any(x in i.lower() for x in NOT_CHAT))
    default = DEFAULT_MODEL[provider]
    models_cache[(provider, key)] = [default] + [i for i in ids if i != default]
    return models_cache[(provider, key)]


def configured() -> list[str]:
    return [p for p in PROVIDERS if os.environ.get(KEY_ENV[p])]


def available(keys: dict[str, str]) -> list[str]:
    """Providers usable for this request: the server's keys plus the visitor's own for BYOK providers."""
    return [p for p in PROVIDERS if os.environ.get(KEY_ENV[p]) or (p in BYOK and keys.get(p))]


def warm() -> None:
    """Import each configured SDK and fetch its model list at startup, so the first visitor does not pay for either."""
    for p in configured():
        asyncio.create_task(list_models(p))


def stream(provider: str, model: str | None, messages: list[dict], key: str | None = None):
    return PROVIDERS[provider](model or DEFAULT_MODEL[provider], messages, key)
