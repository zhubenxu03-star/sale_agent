import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { clearAuthCookie, containsTenantId, forbiddenTenantResponse, readJsonBody, unauthorizedResponse } from "@/lib/bff/backend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return unauthorizedResponse();
  const body = await readJsonBody(request);
  if (containsTenantId(body)) return forbiddenTenantResponse();
  const base = (process.env.BACKEND_API_URL || "http://localhost:8000").replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/api/v1/agent/generate-stream`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: request.signal,
    });
    if (!upstream.ok || !upstream.body) {
      const payload = await upstream.json().catch(() => ({ success: false, data: null, message: "模型服务异常", error_code: "LLM_UNAVAILABLE" }));
      const response = NextResponse.json(payload, { status: upstream.status });
      if (upstream.status === 401) clearAuthCookie(response);
      return response;
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, data: null, message: "大模型服务连接中断，请稍后重试", error_code: "LLM_CONNECTION_INTERRUPTED" },
      { status: 503 },
    );
  }
}
