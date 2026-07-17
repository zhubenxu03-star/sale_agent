import { NextRequest, NextResponse } from "next/server";
import {
  backendResponse,
  callBackend,
  containsTenantId,
  forbiddenTenantResponse,
  readJsonBody,
  sanitizeLoginPayload,
  setAuthCookie,
} from "@/lib/bff/backend";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (containsTenantId(body)) return forbiddenTenantResponse();
  const result = await callBackend("/api/v1/auth/login", { method: "POST", body });
  if (result.status !== 200) return backendResponse(result);

  const { token, publicPayload } = sanitizeLoginPayload(result.payload);
  if (!token) {
    return backendResponse({
      status: 502,
      payload: {
        success: false,
        data: null,
        message: "登录服务返回异常，请稍后重试",
        error_code: "MISSING_ACCESS_TOKEN",
      },
    });
  }
  const response = NextResponse.json(publicPayload, { status: 200 });
  setAuthCookie(response, token);
  return response;
}
