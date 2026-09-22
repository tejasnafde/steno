import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import steno
from . import admin, auth, providers
from .auth import Viewer, viewer
from .db import pool, q

steno.instrument()
CONTEXT_MESSAGES = 20  # fixed window; add summarisation when context cost matters
TITLE_PROMPT = "Write a title of at most five words for this conversation. Reply with the title only, no quotes."


@asynccontextmanager
async def lifespan(app):
    await pool.open()
    await admin.seed_allowlist()
    yield
    await pool.close()


app = FastAPI(title="chat", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(admin.router)


async def owned(cid: uuid.UUID, v: Viewer):
    row = await q("select id, title from conversations where id=%s and user_id=%s", cid, v.user_id, one=True)
    if not row:
        raise HTTPException(404)
    return row


class Send(BaseModel):
    content: str
    provider: str = "google"
    model: str | None = None


class Patch(BaseModel):
    title: str | None = None
    archived: bool | None = None


class Fork(BaseModel):
    upto: int


@app.get("/api/models")
async def list_models():
    return {p: await providers.list_models(p) for p in providers.configured()}


@app.get("/api/conversations")
async def list_conversations(v: Viewer = Depends(viewer)):
    return await q(
        "select id, title, archived_at, created_at, updated_at from conversations where user_id=%s order by updated_at desc limit 200", v.user_id
    )


@app.post("/api/conversations", status_code=201)
async def create_conversation(v: Viewer = Depends(viewer)):
    return await q("insert into conversations (user_id) values (%s) returning id", v.user_id, one=True)


@app.patch("/api/conversations/{cid}")
async def patch_conversation(cid: uuid.UUID, body: Patch, v: Viewer = Depends(viewer)):
    await owned(cid, v)
    if body.title is not None:
        await q("update conversations set title=left(%s, 120) where id=%s", body.title.strip() or None, cid)
    if body.archived is not None:
        await q("update conversations set archived_at=%s where id=%s", datetime.now(timezone.utc) if body.archived else None, cid)
    return await q("select id, title, archived_at, created_at, updated_at from conversations where id=%s", cid, one=True)


@app.delete("/api/conversations/{cid}", status_code=204)
async def delete_conversation(cid: uuid.UUID, v: Viewer = Depends(viewer)):
    await owned(cid, v)
    await q("delete from conversations where id=%s", cid)


@app.get("/api/conversations/{cid}/messages")
async def get_messages(cid: uuid.UUID, v: Viewer = Depends(viewer)):
    await owned(cid, v)
    return await q("select id, role, content, model, created_at from messages where conversation_id=%s order by id", cid)


@app.post("/api/conversations/{cid}/fork", status_code=201)
async def fork_conversation(cid: uuid.UUID, body: Fork, v: Viewer = Depends(viewer)):
    """Copy the conversation up to a message into a new one, so the rest can go another way or to another model."""
    if v.anonymous:
        raise HTTPException(401, "sign in to branch")
    src = await owned(cid, v)
    new = await q("insert into conversations (user_id, title) values (%s, %s) returning id", v.user_id, src["title"], one=True)
    await q(
        "insert into messages (conversation_id, role, content, model) select %s, role, content, model from messages where conversation_id=%s and id<=%s order by id",
        new["id"], cid, body.upto,
    )
    return new


@app.get("/api/conversations/{cid}/export")
async def export_conversation(cid: uuid.UUID, v: Viewer = Depends(viewer)):
    src = await owned(cid, v)
    rows = await q("select role, content, model, created_at from messages where conversation_id=%s order by id", cid)
    lines = [f"# {src['title'] or 'Conversation'}", ""]
    for r in rows:
        who = "You" if r["role"] == "user" else (r["model"] or "Assistant")
        lines += [f"**{who}**", "", r["content"], ""]
    name = (src["title"] or "conversation")[:40].replace("/", "-")
    return PlainTextResponse("\n".join(lines), media_type="text/markdown", headers={"Content-Disposition": f'attachment; filename="{name}.md"'})


async def make_title(cid: uuid.UUID, prompt: str, reply: str) -> None:
    """Name the conversation with the cheapest configured model; fall back to the prompt's first words."""
    title = ""
    provider = next((p for p in providers.CHEAP if p in providers.configured()), None)
    if provider:
        text = f"User: {prompt[:800]}\nAssistant: {reply[:800]}"
        parts = []
        try:
            with steno.session(str(cid)):
                async for delta in providers.stream(provider, providers.CHEAP[provider], [{"role": "user", "content": f"{TITLE_PROMPT}\n\n{text}"}]):
                    parts.append(delta)
            title = "".join(parts).strip().strip('"').splitlines()[0][:80]
        except Exception:
            title = ""
    await q("update conversations set title=%s where id=%s and title is null", title or prompt.strip()[:60], cid)


@app.post("/api/conversations/{cid}/messages")
async def send_message(cid: uuid.UUID, body: Send, v: Viewer = Depends(viewer)):
    if body.provider not in providers.PROVIDERS:
        raise HTTPException(400, "unknown provider")
    conversation = await owned(cid, v)
    model = body.model or providers.DEFAULT_MODEL[body.provider]
    first_turn = conversation["title"] is None
    await q("insert into messages (conversation_id, role, content) values (%s, 'user', %s)", cid, body.content)
    await q("update conversations set updated_at=now() where id=%s", cid)
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
                if first_turn:  # scheduled before the await below: in a cancelled scope that await re-raises and nothing after it runs
                    asyncio.create_task(make_title(cid, body.content, "".join(parts)))
                # A cancelled request keeps its partial answer, so the conversation can resume.
                # shield: the cancelled scope re-raises on any await, but the insert still completes.
                await asyncio.shield(q(
                    "insert into messages (conversation_id, role, content, model) values (%s, 'assistant', %s, %s)", cid, "".join(parts), model,
                ))

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={"X-Model": model, "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"},
    )


static = os.path.join(os.path.dirname(__file__), "static")  # web/dist, copied in by the Dockerfile
if os.path.isdir(static):
    @app.get("/admin/access")
    async def access_page():  # the SPA handles this path; every other /admin path is Grafana
        return FileResponse(os.path.join(static, "index.html"))

    app.mount("/", StaticFiles(directory=static, html=True))
