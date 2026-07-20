import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import {
  clearAuthCookie,
  containsTenantId,
  forbiddenTenantResponse,
  unauthorizedResponse,
} from "@/lib/bff/backend";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, path: string[]) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return unauthorizedResponse();
  const bodyType = request.headers.get("content-type") || "";
  let body: BodyInit | undefined;
  if (bodyType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (form.has("tenant_id")) return forbiddenTenantResponse();
    body = form;
  } else if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        if (containsTenantId(json)) return forbiddenTenantResponse();
      } catch {
        return NextResponse.json({ success: false, data: null, message: "请求格式无效", error_code: "INVALID_REQUEST" }, { status: 422 });
      }
    }
    body = text;
  }
  const base = (process.env.BACKEND_API_URL || "http://localhost:8000").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), path.includes("upload") || path.includes("process") ? 120_000 : 30_000);
  try {
    const upstream = await fetch(`${base}/api/v1/champion/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: request.headers.get("accept") || "application/json",
        ...(bodyType && !bodyType.includes("multipart/form-data") ? { "Content-Type": bodyType } : {}),
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    if (upstream.status === 401) {
      const response = NextResponse.json(await upstream.json().catch(() => ({ success: false, data: null, message: "登录已过期", error_code: "UNAUTHORIZED" })), { status: 401 });
      clearAuthCookie(response);
      return response;
    }
    if (upstream.body && (request.method === "GET" && path.at(-1) === "download")) {
      return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream", "Content-Disposition": upstream.headers.get("Content-Disposition") || "attachment", "X-Content-Type-Options": "nosniff" } });
    }
    const text = await upstream.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { success: false, data: null, message: "后端响应格式无效", error_code: "INVALID_BACKEND_RESPONSE" }; }
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return NextResponse.json({ success: false, data: null, message: "销冠知识库服务暂时不可用，请稍后重试", error_code: "CHAMPION_BACKEND_UNAVAILABLE" }, { status: 503 });
  } finally { clearTimeout(timeout); }
}

type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: NextRequest, context: Context) { return proxy(request, (await context.params).path); }
export async function POST(request: NextRequest, context: Context) { return proxy(request, (await context.params).path); }
export async function PUT(request: NextRequest, context: Context) { return proxy(request, (await context.params).path); }
export async function PATCH(request: NextRequest, context: Context) { return proxy(request, (await context.params).path); }
export async function DELETE(request: NextRequest, context: Context) { return proxy(request, (await context.params).path); }
