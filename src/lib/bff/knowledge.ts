import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import {
  backendResponse,
  forbiddenTenantResponse,
  unauthorizedResponse,
} from "@/lib/bff/backend";

const backendUrl = () =>
  (process.env.BACKEND_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function tokenOrNull() {
  return (await cookies()).get(AUTH_COOKIE_NAME)?.value || null;
}

async function responsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return {
      success: false,
      data: null,
      message: "后端返回了无法解析的响应",
      error_code: "INVALID_BACKEND_RESPONSE",
    };
  }
}

function unavailableResponse() {
  return backendResponse({
    status: 503,
    payload: {
      success: false,
      data: null,
      message: "知识库服务暂时不可用，请稍后重试",
      error_code: "KNOWLEDGE_BACKEND_UNAVAILABLE",
    },
  });
}

export async function proxyKnowledgeUpload(request: NextRequest) {
  const token = await tokenOrNull();
  if (!token) return unauthorizedResponse();
  const formData = await request.formData();
  if (formData.has("tenant_id")) return forbiddenTenantResponse();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(
      `${backendUrl()}/api/v1/knowledge/documents/upload`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        cache: "no-store",
        signal: controller.signal,
      },
    );
    return backendResponse({
      status: response.status,
      payload: await responsePayload(response),
    });
  } catch {
    return unavailableResponse();
  } finally {
    clearTimeout(timeout);
  }
}

export async function proxyKnowledgeDownload(documentId: string) {
  const token = await tokenOrNull();
  if (!token) return unauthorizedResponse();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(
      `${backendUrl()}/api/v1/knowledge/documents/${encodeURIComponent(documentId)}/download`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return backendResponse({
        status: response.status,
        payload: await responsePayload(response),
      });
    }
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition":
          response.headers.get("content-disposition") || "attachment",
        ...(response.headers.get("content-length")
          ? {
              "Content-Length": response.headers.get(
                "content-length",
              ) as string,
            }
          : {}),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailableResponse();
  } finally {
    clearTimeout(timeout);
  }
}
