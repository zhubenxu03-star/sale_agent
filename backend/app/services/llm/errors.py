class ChatProviderError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 502) -> None:
        self.safe_message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


class ChatProviderTimeout(ChatProviderError):
    def __init__(self) -> None:
        super().__init__("大模型服务响应超时，请稍后重试", "LLM_TIMEOUT", 503)
