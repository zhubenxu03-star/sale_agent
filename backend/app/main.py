from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import install_exception_handlers
from app.db.session import get_db

app = FastAPI(
    title="Sales Agent API",
    description="销转智能体多租户后端基础服务",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
install_exception_handlers(app)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["系统"])
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "service": settings.app_name,
                "database": "unavailable",
            },
        )
    try:
        Redis.from_url(settings.redis_url, socket_connect_timeout=1).ping()
    except RedisError:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "service": settings.app_name,
                "database": "connected",
                "redis": "unavailable",
            },
        )
    return {
        "status": "ok",
        "service": settings.app_name,
        "database": "connected",
        "redis": "connected",
    }
