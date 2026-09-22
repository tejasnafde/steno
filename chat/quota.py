"""Limits for a free, public chat. A per-IP burst window in memory, then daily message and token caps per
identity read from the same tables everything else uses. Requests on a visitor's own key skip the daily caps."""
import os
import time
from collections import deque

from fastapi import HTTPException, Request

from .auth import Viewer
from .db import q

BURST_PER_MINUTE = int(os.environ.get("BURST_PER_MINUTE", "10"))
DAILY = {  # (messages, tokens) per 24 hours
    "visitor": (int(os.environ.get("DAILY_MESSAGES_ANON", "20")), int(os.environ.get("DAILY_TOKENS_ANON", "60000"))),
    "user": (int(os.environ.get("DAILY_MESSAGES_USER", "100")), int(os.environ.get("DAILY_TOKENS_USER", "400000"))),
}
recent: dict[str, deque] = {}  # ip -> send times in the last minute; one process, so memory is enough

DDL = """
create table if not exists quota_hits (
  id          bigserial primary key,
  user_id     text not null,
  kind        text not null,   -- burst, messages, tokens
  created_at  timestamptz not null default now()
)"""


async def ensure_table():
    await q(DDL)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")


async def reject(v: Viewer, kind: str, detail: str):
    await q("insert into quota_hits (user_id, kind) values (%s, %s)", v.user_id, kind)
    raise HTTPException(429, detail)


async def check(v: Viewer, request: Request, own_key: bool) -> None:
    now = time.time()
    window = recent.setdefault(client_ip(request), deque())
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= BURST_PER_MINUTE:
        await reject(v, "burst", f"Slow down: {BURST_PER_MINUTE} messages a minute is the limit.")
    window.append(now)
    if own_key:
        return
    tier = "visitor" if v.anonymous else "user"
    max_messages, max_tokens = DAILY[tier]
    used = await q(
        "select count(*) n from messages m join conversations c on c.id=m.conversation_id where c.user_id=%s and m.role='user' and m.created_at > now() - interval '24 hours'",
        v.user_id, one=True,
    )
    if used["n"] >= max_messages:
        more = f" Sign in for {DAILY['user'][0]} a day, or" if v.anonymous else " Or"
        await reject(v, "messages", f"Daily limit reached: {max_messages} messages.{more} use your own API key under Your keys.")
    tokens = await q(
        "select coalesce(sum(coalesce(l.input_tokens, 0) + coalesce(l.output_tokens, 0)), 0) t from inference_logs l join conversations c on c.id=l.session_id where c.user_id=%s and l.started_at > now() - interval '24 hours'",
        v.user_id, one=True,
    )
    if tokens["t"] >= max_tokens:
        await reject(v, "tokens", f"Daily token limit reached ({max_tokens:,}). It resets 24 hours after your first message, or use your own API key.")
