import os
import time
from fastapi import Request, HTTPException
from shared.redis_client import redis_client
from src.config import settings


lua_path = os.path.join(
    os.path.dirname(__file__),
    "..",
    "shared",
    "sliding_window.lua"
)

with open(lua_path) as f:
    lua_script = f.read()

rate_limit_script = redis_client.register_script(lua_script)


def rate_limit():

    async def dependency(request: Request):

        ip = request.client.host if request.client else "unknown"

        key = f"rate_limit:{ip}"

        allowed = rate_limit_script(
            keys=[key],
            args=[
                int(time.time()),
                settings.rate_limit_window,
                settings.rate_limit_max_requests
            ]
        )

        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Try again later."
            )

    return dependency