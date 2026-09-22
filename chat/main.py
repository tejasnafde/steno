import asyncio
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel

import llmlog
from . import providers

llmlog.instrument()
CONTEXT_MESSAGES = 20  # fixed window; add summarisation when context cost matters
pool = AsyncConnectionPool(os.environ["DATABASE_URL"], open=False, kwargs={"row_factory": dict_row})


@asynccontextmanager
async def lifespan(app):
    await pool.open()
    yield
    await pool.close()


app = FastAPI(title="chat", lifespan=lifespan)


async def q(sql, *args, one=False):
    async with pool.connection() as conn:
        cur = await conn.execute(sql, args)
        if cur.description:
            return await (cur.fetchone() if one else cur.fetchall())


class Send(BaseModel):
    content: str
    provider: str = "google"
    model: str | None = None


@app.get("/api/models")
async def list_models():
    return {p: await providers.list_models(p) for p in providers.configured()}


@app.get("/api/conversations")
async def list_conversations():
    return await q("select id, title, created_at, updated_at from conversations order by updated_at desc limit 100")


@app.post("/api/conversations", status_code=201)
async def create_conversation():
    return await q("insert into conversations default values returning id", one=True)


@app.get("/api/conversations/{cid}/messages")
async def get_messages(cid: uuid.UUID):
    return await q("select id, role, content, created_at from messages where conversation_id=%s order by id", cid)


@app.post("/api/conversations/{cid}/messages")
async def send_message(cid: uuid.UUID, body: Send):
    if body.provider not in providers.PROVIDERS:
        raise HTTPException(400, "unknown provider")
    if not await q("select 1 from conversations where id=%s", cid, one=True):
        raise HTTPException(404)
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
            with llmlog.session(str(cid)):
                async for delta in providers.stream(body.provider, body.model, history):
                    parts.append(delta)
                    yield delta
        except Exception as e:
            yield f"\n\n[error] {e}"
        finally:
            if parts:
                # A cancelled request keeps its partial answer, so the conversation can resume.
                # shield: the cancelled scope re-raises on any await, but the insert still completes.
                await asyncio.shield(q("insert into messages (conversation_id, role, content) values (%s, 'assistant', %s)", cid, "".join(parts)))

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


static = os.path.join(os.path.dirname(__file__), "static")  # web/dist, copied in by the Dockerfile
if os.path.isdir(static):
    app.mount("/", StaticFiles(directory=static, html=True))
