import type { ApiErrorResponse, ApiResponse } from "@/types/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError("网络连接失败，请检查服务状态", 503, "NETWORK_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as
    | ApiResponse<T>
    | ApiErrorResponse
    | null;
  if (!response.ok || !payload?.success) {
    const errorPayload = payload as ApiErrorResponse | null;
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw new ApiError(
      errorPayload?.message || statusMessage(response.status),
      response.status,
      errorPayload?.error_code || "REQUEST_FAILED",
    );
  }
  return payload.data;
}

export function statusMessage(status: number): string {
  if (status === 401) return "登录已过期，请重新登录";
  if (status === 404) return "请求的资源不存在";
  if (status === 422) return "提交内容有误，请检查表单";
  if (status === 503) return "后端服务暂时不可用，请稍后重试";
  return "请求失败，请稍后重试";
}
