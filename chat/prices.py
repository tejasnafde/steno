"""List prices, USD per 1M tokens, from the providers' pricing pages on 2026-09-26. The dashboard multiplies
inference_logs tokens by these. Gemini and Groq run on free tiers here, so their real bill is zero; the
dashboard shows what the traffic would cost on a paid key. Unknown models cost nothing on the chart."""
from .db import q

PRICES = {  # model: (input, output)
    "gemini-3.5-flash-lite": (0.30, 2.50),
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.8-flash": (0.75, 3.75),
    "nano-banana-pro-preview": (0.00, 120.00),  # image output tokens; about 0.134 USD per 1K or 2K image
    "openai/gpt-oss-120b": (0.15, 0.60),
    "openai/gpt-oss-20b": (0.075, 0.30),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-5.4": (2.50, 15.00),
}
PAID_BY_VISITOR = ("openai", "anthropic")  # no server key exists for these, so every call used the visitor's own

DDL = """
create table if not exists model_prices (
  model        text primary key,
  input_usd    numeric not null,   -- per 1M input tokens
  output_usd   numeric not null    -- per 1M output tokens
)"""


async def ensure_table():
    await q(DDL)
    for model, (i, o) in PRICES.items():
        await q("insert into model_prices values (%s, %s, %s) on conflict (model) do update set input_usd=excluded.input_usd, output_usd=excluded.output_usd", model, i, o)
