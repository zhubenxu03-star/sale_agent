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
  if (!body || typeof body !== "object") {
    return backendResponse({
      status: 422,
      payload: {
        success: false,
        data: null,
        message: "注册信息格式不正确",
        error_code: "VALIDATION_ERROR",
      },
    });
  }

  const registerResult = await callBackend("/api/v1/auth/register-tenant", {
    method: "POST",
    body,
  });
  if (registerResult.status !== 201) return backendResponse(registerResult);

  const record = body as Record<string, unknown>;
  const loginResult = await callBackend("/api/v1/auth/login", {
    method: "POST",
    body: {
      tenant_code: record.tenant_code,
      email: record.email,
      password: record.password,
    },
  });
  if (loginResult.status !== 200) return backendResponse(loginResult);
  const { token } = sanitizeLoginPayload(loginResult.payload);
  if (!token) return backendResponse({ status: 502, payload: loginResult.payload });

  const response = NextResponse.json(registerResult.payload, { status: 201 });
  setAuthCookie(response, token);
  return response;
}
