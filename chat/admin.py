"""Who may open /admin. Caddy asks /api/admin/check before proxying anything under /admin to Grafana;
the allowlist itself is edited from the /admin/access page."""
import os
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from .auth import Viewer, viewer
from .db import pool, q

router = APIRouter(prefix="/api/admin")


async def seed_allowlist():
    for email in filter(None, os.environ.get("ADMIN_EMAILS", "").lower().split(",")):
        await q("insert into admin_allowlist (email, added_by) values (%s, 'env') on conflict do nothing", email.strip())


async def allowed(email: str | None) -> bool:
    return bool(email) and bool(await q("select 1 from admin_allowlist where email=%s", email.lower(), one=True))


async def require_admin(v: Viewer = Depends(viewer)) -> Viewer:
    if v.anonymous:
        raise HTTPException(401, "sign in first")
    if not await allowed(v.email):
        raise HTTPException(403, "not on the allowlist")
    return v


@router.get("/check")
async def check(request: Request, v: Viewer = Depends(viewer)):
    """forward_auth target: 2xx lets the request through, anything else is sent to the browser as is."""
    if v.anonymous:
        target = request.headers.get("x-forwarded-uri", "/admin/")
        return RedirectResponse(f"/?signin=1&next={quote(target, safe='')}", status_code=302)
    if not await allowed(v.email):
        raise HTTPException(403, f"{v.email} is not on the allowlist")
    return {"ok": True}


class Allowlist(BaseModel):
    emails: list[EmailStr]


@router.get("/allowlist")
async def get_allowlist(v: Viewer = Depends(require_admin)):
    rows = await q("select email from admin_allowlist order by created_at")
    return {"emails": [r["email"] for r in rows], "me": v.email}


@router.put("/allowlist")
async def put_allowlist(body: Allowlist, v: Viewer = Depends(require_admin)):
    emails = sorted({*(e.lower() for e in body.emails), v.email.lower()})  # never lock yourself out
    async with pool.connection() as conn:
        await conn.execute("delete from admin_allowlist where email <> all(%s)", (emails,))
        for e in emails:
            await conn.execute("insert into admin_allowlist (email, added_by) values (%s, %s) on conflict do nothing", (e, v.email))
    return {"emails": emails, "me": v.email}
