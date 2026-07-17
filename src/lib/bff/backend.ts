import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  DEFAULT_AUTH_COOKIE_MAX_AGE,
} from "@/lib/auth/constants";
import type { ApiErrorResponse } from "@/types/api";

const REQUEST_TIMEOUT_MS = 10_000;

export interface BackendResult {
  status: number;
  payload: unknown;
}

export function containsTenantId(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsTenantId);
  return Object.entries(value).some(
    ([key, nested]) => key === "tenant_id" || containsTenantId(nested),
  );
}

export function forbiddenTenantResponse(): NextResponse<ApiErrorResponse> {
  const payload: ApiErrorResponse = {
      success: false,
      data: null,
      message: "请求中不允许包含 tenant_id",
      error_code: "TENANT_ID_FORBIDDEN",
    };
  return NextResponse.json(payload, { status: 422 });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function callBackend(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    search?: string;
  } = {},
): Promise<BackendResult> {
  const backendUrl = (process.env.BACKEND_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendUrl}${path}${options.search || ""}`, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {
          success: false,
          data: null,
          message: "后端返回了无法解析的响应",
          error_code: "INVALID_BACKEND_RESPONSE",
        };
      }
    }
    return { status: response.status, payload };
  } catch {
    return {
      status: 503,
      payload: {
        success: false,
        data: null,
        message: "后端服务暂时不可用，请稍后重试",
        error_code: "BACKEND_UNAVAILABLE",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function setAuthCookie(response: NextResponse, token: string): void {
  const configuredMaxAge = Number(process.env.AUTH_COOKIE_MAX_AGE_SECONDS);
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge:
      Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
        ? configuredMaxAge
        : DEFAULT_AUTH_COOKIE_MAX_AGE,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function backendResponse(result: BackendResult): NextResponse {
  const response = NextResponse.json(result.payload, { status: result.status });
  if (result.status === 401) clearAuthCookie(response);
  return response;
}

export function sanitizeLoginPayload(payload: unknown): {
  token: string | null;
  publicPayload: unknown;
} {
  if (!payload || typeof payload !== "object") {
    return { token: null, publicPayload: payload };
  }
  const record = payload as Record<string, unknown>;
  if (!record.data || typeof record.data !== "object") {
    return { token: null, publicPayload: payload };
  }
  const { access_token, ...safeData } = record.data as Record<string, unknown>;
  return {
    token: typeof access_token === "string" ? access_token : null,
    publicPayload: { ...record, data: safeData },
  };
}

export function unauthorizedResponse(): NextResponse<ApiErrorResponse> {
  const payload: ApiErrorResponse = {
      success: false,
      data: null,
      message: "登录已过期，请重新登录",
      error_code: "UNAUTHORIZED",
    };
  const response = NextResponse.json(payload, { status: 401 });
  clearAuthCookie(response);
  return response;
}
