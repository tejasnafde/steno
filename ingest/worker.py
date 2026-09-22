"""Redis stream -> Postgres. Idempotent on event_id, acks only after the insert commits."""
import asyncio
import json
import os

import psycopg
import redis.asyncio as redis
from psycopg.types.json import Jsonb

STREAM, GROUP = "inference_logs", "writers"
CONSUMER = os.environ.get("HOSTNAME", "worker")
SQL = """
insert into inference_logs (event_id, session_id, provider, model, status, http_status, latency_ms, ttft_ms,
  input_tokens, output_tokens, started_at, input_preview, output_preview, error, metadata)
values (%(event_id)s, %(session_id)s, %(provider)s, %(model)s, %(status)s, %(http_status)s, %(latency_ms)s, %(ttft_ms)s,
  %(input_tokens)s, %(output_tokens)s, %(started_at)s, %(input_preview)s, %(output_preview)s, %(error)s, %(metadata)s)
on conflict (event_id) do nothing
"""


async def main():
    r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379"), socket_timeout=10)
    try:
        await r.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise
    conn = await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], autocommit=True)
    cursor = "0"  # "0" replays this consumer's un-acked entries after a crash, then ">" reads new ones
    while True:
        try:
            res = await r.xreadgroup(GROUP, CONSUMER, {STREAM: cursor}, count=200, block=2000)
        except redis.TimeoutError:  # idle stream; redis-py surfaces a long block as a socket timeout
            res = None
        if not res or not res[0][1]:
            cursor = ">"
            continue
        entries = res[0][1]
        rows = []
        for entry_id, fields in entries:
            row = json.loads(fields[b"e"])
            row["metadata"] = Jsonb(row.get("metadata") or {})
            rows.append(row)
        async with conn.cursor() as cur:
            await cur.executemany(SQL, rows)
        await r.xack(STREAM, GROUP, *[entry_id for entry_id, fields in entries])
        print(f"wrote {len(rows)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
