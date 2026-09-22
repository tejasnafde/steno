"""Manage the Cloudflare Access email allowlist that guards /admin. Active only when the three
CF_ACCESS_* variables are set (production). The endpoint itself sits under /admin, so Access
protects it too; the Cf-Access-Authenticated-User-Email header check refuses direct hits."""
import os

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api/admin")
ACCOUNT, APP, TOKEN = (os.environ.get(k) for k in ("CF_ACCOUNT_ID", "CF_ACCESS_APP_ID", "CF_ACCESS_TOKEN"))
BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/access/apps/{APP}"


class Allowlist(BaseModel):
    emails: list[EmailStr]


def guard(request: Request) -> str:
    if not (ACCOUNT and APP and TOKEN):
        raise HTTPException(501, "Access management is not configured on this deployment")
    email = request.headers.get("cf-access-authenticated-user-email")
    if not email:
        raise HTTPException(403, "not behind Cloudflare Access")
    return email


async def cf(method: str, path: str = "", **kwargs) -> dict:
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.request(method, BASE + path, headers={"Authorization": f"Bearer {TOKEN}"}, **kwargs)
    data = r.json()
    if not data.get("success"):
        raise HTTPException(502, str(data.get("errors")))
    return data["result"]


def emails_of(policy: dict) -> list[str]:
    return [rule["email"]["email"] for rule in policy.get("include", []) if "email" in rule]


@router.get("/allowlist")
async def get_allowlist(request: Request):
    me = guard(request)
    policy = (await cf("GET"))["policies"][0]
    return {"emails": emails_of(policy), "me": me}


@router.put("/allowlist")
async def put_allowlist(body: Allowlist, request: Request):
    me = guard(request)
    emails = sorted({*map(str.lower, body.emails), me.lower()})  # never lock yourself out
    policy = (await cf("GET"))["policies"][0]
    await cf("PUT", f"/policies/{policy['id']}", json={
        "name": policy["name"], "decision": policy["decision"],
        "include": [{"email": {"email": e}} for e in emails],
    })
    return {"emails": emails, "me": me}
