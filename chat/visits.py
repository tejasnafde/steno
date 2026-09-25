"""Page loads of the app itself (not API calls), so the dashboard can show who opened the site and from where.
Country, city and network owner come from ip-api.com, looked up once per IP in the background."""
import asyncio
import re

import httpx
from fastapi import Request

from .auth import verify, SESSION_COOKIE, ANON_COOKIE
from .db import q

PAGES = re.compile(r"^/($|s/[\w-]+$|admin/access$)")
BOTS = re.compile(r"bot|crawl|spider|slurp|headless|preview|curl|wget|python|go-http|monitor", re.I)
DDL = """
create table if not exists visits (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  path        text not null,
  ip          text,
  country     text,
  city        text,
  org         text,                -- network owner: an office or company ISP stands out from a home one
  user_agent  text,
  referer     text,
  user_id     text,                -- signed-in uid, or the anonymous uid cookie
  email       text,
  is_bot      boolean not null default false
);
create index if not exists visits_at_idx on visits (at desc);
"""
geo: dict[str, tuple] = {}


async def ensure_table():
    await q(DDL)


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for", "")  # Caddy sets this to the real client
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)


async def locate(ip: str) -> tuple:
    if ip in geo:
        return geo[ip]
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = (await c.get(f"http://ip-api.com/json/{ip}", params={"fields": "status,country,city,org,isp"})).json()
        geo[ip] = (r.get("country"), r.get("city"), r.get("org") or r.get("isp")) if r.get("status") == "success" else (None, None, None)
    except Exception:
        return (None, None, None)  # not cached, so a later visit retries
    return geo[ip]


async def record(request: Request) -> None:
    ip = client_ip(request)
    agent = request.headers.get("user-agent", "")
    session = verify(request.cookies.get(SESSION_COOKIE))
    country, city, org = await locate(ip) if ip and not ip.startswith(("10.", "172.", "192.168.", "127.")) else (None, None, None)
    await q(
        "insert into visits (path, ip, country, city, org, user_agent, referer, user_id, email, is_bot) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        request.url.path, ip, country, city, org, agent[:300], request.headers.get("referer", "")[:300] or None,
        session.user_id if session else request.cookies.get(ANON_COOKIE), session.email if session else None, bool(BOTS.search(agent)),
    )


def track(request: Request) -> None:
    """Called for every GET; records only page loads, off the request path so a slow lookup never delays the page."""
    if request.method == "GET" and PAGES.match(request.url.path) and "text/html" in request.headers.get("accept", "text/html"):
        asyncio.create_task(record(request))
