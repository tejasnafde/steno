"""Ingestion API: validate a batch of inference events and append them to a Redis stream.
Fast path only; the worker does the database writes."""
import os
from datetime import datetime
from typing import Literal
from uuid import UUID

import redis.asyncio as redis
from fastapi import FastAPI
from pydantic import BaseModel, Field

STREAM = "inference_logs"
app = FastAPI(title="ingest")
r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"))


class Event(BaseModel):
    event_id: UUID
    session_id: UUID | None = None
    provider: str
    model: str | None = None
    status: Literal["ok", "error", "cancelled"]
    http_status: int | None = None
    latency_ms: int
    ttft_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    started_at: datetime
    input_preview: str = ""
    output_preview: str = ""
    error: str | None = None
    metadata: dict = {}


class Batch(BaseModel):
    events: list[Event] = Field(max_length=500)


@app.post("/v1/logs", status_code=202)
async def logs(batch: Batch):
    pipe = r.pipeline()
    for e in batch.events:
        pipe.xadd(STREAM, {"e": e.model_dump_json()}, maxlen=1_000_000, approximate=True)
    await pipe.execute()
    return {"accepted": len(batch.events)}


@app.get("/health")
async def health():
    return {"ok": await r.ping()}
