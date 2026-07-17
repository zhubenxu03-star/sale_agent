import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import {
  backendResponse,
  callBackend,
  containsTenantId,
  forbiddenTenantResponse,
  readJsonBody,
  unauthorizedResponse,
} from "@/lib/bff/backend";

export async function proxyAuthenticated(
  request: NextRequest,
  backendPath: string,
  options: { method?: string; includeSearch?: boolean; body?: unknown } = {},
) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return unauthorizedResponse();

  let body = options.body;
  if (body === undefined && !["GET", "DELETE"].includes(options.method || request.method)) {
    body = await readJsonBody(request);
  }
  if (containsTenantId(body)) return forbiddenTenantResponse();

  const result = await callBackend(backendPath, {
    method: options.method || request.method,
    body,
    token,
    search: options.includeSearch ? request.nextUrl.search : undefined,
  });
  return backendResponse(result);
}
