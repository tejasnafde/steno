"""Identity. Anonymous visitors get a uid cookie; Google sign-in (Firebase Auth) upgrades it to a
signed session cookie and moves the anonymous conversations onto the account."""
import asyncio
import hashlib
import hmac
import os
import time
import uuid
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

from .db import q

SECRET = os.environ.get("SESSION_SECRET", "dev-only-not-secret").encode()
FIREBASE_PROJECT = os.environ.get("FIREBASE_PROJECT", "teejayproject")
SESSION_COOKIE, ANON_COOKIE = "session", "uid"
SESSION_DAYS, ANON_DAYS = 30, 365
router = APIRouter(prefix="/api")


@dataclass
class Viewer:
    user_id: str
    email: str | None = None

    @property
    def anonymous(self) -> bool:
        return self.email is None


def sign(uid: str, email: str) -> str:
    payload = f"{uid}|{email}|{int(time.time())}"
    return payload + "." + hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()


def verify(cookie: str | None) -> Viewer | None:
    if not cookie or "." not in cookie:
        return None
    payload, sig = cookie.rsplit(".", 1)
    if not hmac.compare_digest(sig, hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()):
        return None
    uid, email, issued = payload.split("|")
    if time.time() - int(issued) > SESSION_DAYS * 86400:
        return None
    return Viewer(uid, email)


def anonymous_id(request: Request, response: Response) -> str:
    try:
        return str(uuid.UUID(request.cookies.get(ANON_COOKIE, "")))
    except ValueError:
        uid = str(uuid.uuid4())
        response.set_cookie(ANON_COOKIE, uid, max_age=ANON_DAYS * 86400, httponly=True, samesite="lax")
        return uid


def viewer(request: Request, response: Response) -> Viewer:
    return verify(request.cookies.get(SESSION_COOKIE)) or Viewer(anonymous_id(request, response))


class Token(BaseModel):
    idToken: str


@router.post("/auth/session")
async def create_session(body: Token, request: Request, response: Response):
    try:
        info = await asyncio.to_thread(id_token.verify_firebase_token, body.idToken, google_requests.Request(), FIREBASE_PROJECT)
    except ValueError as e:
        raise HTTPException(401, f"invalid token: {e}")
    uid, email = info["sub"], info.get("email")
    if not email:
        raise HTTPException(400, "account has no email")
    await q(
        "insert into users (id, email, name, picture) values (%s, %s, %s, %s) on conflict (id) do update set email=excluded.email, name=excluded.name, picture=excluded.picture",
        uid, email, info.get("name"), info.get("picture"),
    )
    anon = request.cookies.get(ANON_COOKIE)
    if anon:  # the conversations started before signing in now belong to the account
        await q("update conversations set user_id=%s where user_id=%s", uid, anon)
    response.set_cookie(SESSION_COOKIE, sign(uid, email), max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax")
    return await me_payload(Viewer(uid, email))


@router.delete("/auth/session", status_code=204)
async def delete_session(response: Response):
    response.delete_cookie(SESSION_COOKIE)


@router.get("/me")
async def me(v: Viewer = Depends(viewer)):
    return await me_payload(v)


async def me_payload(v: Viewer):
    if v.anonymous:
        return {"user": None, "admin": False}
    user = await q("select id, email, name, picture from users where id=%s", v.user_id, one=True)
    admin = bool(await q("select 1 from admin_allowlist where email=%s", v.email, one=True))
    return {"user": user, "admin": admin}
