import os

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

pool = AsyncConnectionPool(os.environ["DATABASE_URL"], open=False, kwargs={"row_factory": dict_row})


async def q(sql, *args, one=False):
    async with pool.connection() as conn:
        cur = await conn.execute(sql, args)
        if cur.description:
            return await (cur.fetchone() if one else cur.fetchall())
