import asyncio
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

import steno
from . import access, providers

steno.instrument()
CONTEXT_MESSAGES = 20  # fixed window; add summarisation when context cost matters
COOKIE = "uid"
pool = AsyncConnectionPool(os.environ["DATABASE_URL"], open=False, kwargs={"row_factory": dict_row})


@asynccontextmanager
async def lifespan(app):
    await pool.open()
    yield
    await pool.close()


app = FastAPI(title="chat", lifespan=lifespan)
app.include_router(access.router)


async def q(sql, *args, one=False):
    async with pool.connection() as conn:
        cur = await conn.execute(sql, args)
        if cur.description:
            return await (cur.fetchone() if one else cur.fetchall())


async def user_id(request: Request, response: Response) -> uuid.UUID:
    """Anonymous per-browser identity. Conversations are scoped to it; there are no accounts."""
    try:
        return uuid.UUID(request.cookies.get(COOKIE, ""))
    except ValueError:
        uid = uuid.uuid4()
        response.set_cookie(COOKIE, str(uid), max_age=365 * 24 * 3600, httponly=True, samesite="lax")
        return uid


async def owned(cid: uuid.UUID, uid: uuid.UUID):
    if not await q("select 1 from conversations where id=%s and user_id=%s", cid, uid, one=True):
        raise HTTPException(404)


class Send(BaseModel):
    content: str
    provider: str = "google"
    model: str | None = None


@app.get("/api/models")
async def list_models():
    return {p: await providers.list_models(p) for p in providers.configured()}


@app.get("/api/conversations")
async def list_conversations(uid: uuid.UUID = Depends(user_id)):
    return await q("select id, title, created_at, updated_at from conversations where user_id=%s order by updated_at desc limit 100", uid)


@app.post("/api/conversations", status_code=201)
async def create_conversation(uid: uuid.UUID = Depends(user_id)):
    return await q("insert into conversations (user_id) values (%s) returning id", uid, one=True)


@app.delete("/api/conversations/{cid}", status_code=204)
async def delete_conversation(cid: uuid.UUID, uid: uuid.UUID = Depends(user_id)):
    await owned(cid, uid)
    await q("delete from conversations where id=%s", cid)


@app.get("/api/conversations/{cid}/messages")
async def get_messages(cid: uuid.UUID, uid: uuid.UUID = Depends(user_id)):
    await owned(cid, uid)
    return await q("select id, role, content, model, created_at from messages where conversation_id=%s order by id", cid)


@app.post("/api/conversations/{cid}/messages")
async def send_message(cid: uuid.UUID, body: Send, uid: uuid.UUID = Depends(user_id)):
    if body.provider not in providers.PROVIDERS:
        raise HTTPException(400, "unknown provider")
    await owned(cid, uid)
    model = body.model or providers.DEFAULT_MODEL[body.provider]
    await q("insert into messages (conversation_id, role, content) values (%s, 'user', %s)", cid, body.content)
    await q("update conversations set title=coalesce(title, left(%s, 60)), updated_at=now() where id=%s", body.content, cid)
    rows = await q(
        "select role, content from (select id, role, content from messages where conversation_id=%s order by id desc limit %s) t order by id",
        cid, CONTEXT_MESSAGES,
    )
    history = [{"role": r["role"], "content": r["content"]} for r in rows]

    async def generate():
        parts = []
        try:
            with steno.session(str(cid)):
                async for delta in providers.stream(body.provider, model, history):
                    parts.append(delta)
                    yield delta
        except Exception as e:
            yield f"\n\n[error] {e}"
        finally:
            if parts:
                # A cancelled request keeps its partial answer, so the conversation can resume.
                # shield: the cancelled scope re-raises on any await, but the insert still completes.
                await asyncio.shield(q(
                    "insert into messages (conversation_id, role, content, model) values (%s, 'assistant', %s, %s)", cid, "".join(parts), model,
                ))

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8", headers={"X-Model": model})


static = os.path.join(os.path.dirname(__file__), "static")  # web/dist, copied in by the Dockerfile
if os.path.isdir(static):
    @app.get("/admin/access")
    async def access_page():  # the SPA handles this path; every other /admin path is Grafana
        return FileResponse(os.path.join(static, "index.html"))

    app.mount("/", StaticFiles(directory=static, html=True))
