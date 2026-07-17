import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  backendResponse,
  callBackend,
  clearAuthCookie,
  containsTenantId,
  sanitizeLoginPayload,
  setAuthCookie,
} from "@/lib/bff/backend";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { proxy } from "@/proxy";

afterEach(() => vi.unstubAllGlobals());

describe("BFF security", () => {
  it("rejects a top-level tenant_id", () => {
    expect(containsTenantId({ tenant_id: "unsafe" })).toBe(true);
  });
  it("rejects a nested tenant_id", () => {
    expect(containsTenantId({ data: [{ profile: { tenant_id: "unsafe" } }] })).toBe(true);
  });
  it("allows normal business payloads", () => {
    expect(containsTenantId({ name: "客户", company_name: "企业" })).toBe(false);
  });
  it("removes access_token from the public login payload", () => {
    const result = sanitizeLoginPayload({ success: true, data: { access_token: "secret", token_type: "bearer", user: { id: "1" } }, message: "登录成功" });
    expect(result.token).toBe("secret");
    expect(JSON.stringify(result.publicPayload)).not.toContain("secret");
    expect(JSON.stringify(result.publicPayload)).not.toContain("access_token");
  });
  it("sets an HttpOnly, SameSite=Lax auth cookie", () => {
    const response = NextResponse.json({ ok: true });
    setAuthCookie(response, "secret-token");
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=86400");
  });
  it("clears the auth cookie with Max-Age zero", () => {
    const response = NextResponse.json({ ok: true });
    clearAuthCookie(response);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("forwards authorization without exposing it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: "1" }, message: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await callBackend("/api/v1/customers", { token: "secret-token" });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
  });
  it("returns a clear 503 when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await callBackend("/health");
    expect(result.status).toBe(503);
    expect(JSON.stringify(result.payload)).toContain("后端服务暂时不可用");
  });
  it("clears the cookie when FastAPI returns 401", () => {
    const response = backendResponse({ status: 401, payload: { success: false, data: null, message: "无效", error_code: "INVALID_TOKEN" } });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("login success sets cookie and never exposes the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { access_token: "secret-token", token_type: "bearer", user: {}, tenant: {} }, message: "登录成功" }), { status: 200 })));
    const request = new NextRequest("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ tenant_code: "alpha", email: "a@a.com", password: "Test123456" }) });
    const response = await loginRoute(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await response.text()).not.toContain("secret-token");
  });
  it("login failure does not set a valid cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, data: null, message: "登录失败", error_code: "LOGIN_FAILED" }), { status: 401 })));
    const request = new NextRequest("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify({ tenant_code: "alpha", email: "a@a.com", password: "wrongpass" }) });
    const response = await loginRoute(request);
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).not.toContain("secret-token");
  });
  it("logout clears the cookie", async () => {
    const response = await logoutRoute();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("redirects an unauthenticated protected request to login", () => {
    const response = proxy(new NextRequest("http://localhost/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
  it("allows a protected request with an auth cookie", () => {
    const request = new NextRequest("http://localhost/", { headers: { cookie: "sales_agent_access_token=opaque" } });
    const response = proxy(request);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
