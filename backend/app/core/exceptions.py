import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppException(Exception):
    def __init__(self, status_code: int, message: str, error_code: str) -> None:
        self.status_code = status_code
        self.message = message
        self.error_code = error_code
        super().__init__(message)


def error_payload(message: str, error_code: str) -> dict[str, object]:
    return {
        "success": False,
        "data": None,
        "message": message,
        "error_code": error_code,
    }


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(_: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(exc.message, exc.error_code),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        logger.info("Request validation failed: %s", exc.errors())
        return JSONResponse(
            status_code=422,
            content=error_payload("参数校验失败", "VALIDATION_ERROR"),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(str(exc.detail), "HTTP_ERROR"),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled application error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_payload("服务内部错误", "INTERNAL_SERVER_ERROR"),
        )
