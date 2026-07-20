from uuid import UUID

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.exceptions import AppException

RELEASE_SCRIPT = """
local value = redis.call('DECR', KEYS[1])
if value <= 0 then redis.call('DEL', KEYS[1]) end
return value
"""


class GenerationLease:
    def __init__(self, user_id: UUID) -> None:
        settings = get_settings()
        self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
        self.key = f"sales-agent:generation:{user_id}"
        self.limit = settings.agent_max_concurrent_requests_per_user

    async def __aenter__(self) -> "GenerationLease":
        try:
            count = await self.redis.incr(self.key)
            await self.redis.expire(self.key, get_settings().agent_request_timeout_seconds + 30)
            if count > self.limit:
                await self.redis.eval(RELEASE_SCRIPT, 1, self.key)
                raise AppException(429, "同时生成任务过多，请稍后再试", "GENERATION_LIMIT_EXCEEDED")
        except AppException:
            await self.redis.aclose()
            raise
        except RedisError as exc:
            await self.redis.aclose()
            raise AppException(
                503, "生成并发控制服务暂不可用", "GENERATION_GUARD_UNAVAILABLE"
            ) from exc
        return self

    async def __aexit__(self, *_: object) -> None:
        try:
            await self.redis.eval(RELEASE_SCRIPT, 1, self.key)
        finally:
            await self.redis.aclose()
