from pydantic import BaseModel


class APIResponse[T](BaseModel):
    success: bool = True
    data: T
    message: str = "操作成功"


class ErrorResponse(BaseModel):
    success: bool = False
    data: None = None
    message: str
    error_code: str


def success_response(data: object, message: str = "操作成功") -> dict[str, object]:
    return {"success": True, "data": data, "message": message}
