import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError, statusMessage } from "@/lib/api/client";
import { buildLocalMockReply } from "@/lib/mockReply";
import { loginSchema, registerSchema } from "@/schemas/auth";
import { collectionToLines, linesToArray } from "@/schemas/customer";
import type { Customer } from "@/types/api";

afterEach(() => vi.unstubAllGlobals());

describe("client data utilities", () => {
  it("returns the data envelope from a successful request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { total: 1 }, message: "ok" }), { status: 200 })));
    await expect(apiRequest<{ total: number }>("/api/customers")).resolves.toEqual({ total: 1 });
  });
  it("preserves backend error messages and codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, data: null, message: "企业编码已存在", error_code: "TENANT_CODE_CONFLICT" }), { status: 409 })));
    await expect(apiRequest("/api/auth/register")).rejects.toMatchObject({ status: 409, errorCode: "TENANT_CODE_CONFLICT", message: "企业编码已存在" });
  });
  it("maps a network failure to a readable 503 error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(apiRequest("/api/customers")).rejects.toEqual(new ApiError("网络连接失败，请检查服务状态", 503, "NETWORK_ERROR"));
  });
  it("provides a readable 503 fallback message", () => {
    expect(statusMessage(503)).toContain("后端服务暂时不可用");
  });
  it("validates a normal login form", () => {
    expect(loginSchema.safeParse({ tenant_code: "alpha-company", email: "admin@test.com", password: "Test123456" }).success).toBe(true);
  });
  it("rejects uppercase tenant codes", () => {
    expect(loginSchema.safeParse({ tenant_code: "Alpha", email: "admin@test.com", password: "Test123456" }).success).toBe(false);
  });
  it("rejects mismatched registration passwords", () => {
    expect(registerSchema.safeParse({ tenant_name: "测试公司", tenant_code: "alpha", admin_name: "管理员", email: "admin@test.com", password: "Test123456", confirm_password: "Different123" }).success).toBe(false);
  });
  it("converts multiline customer fields to arrays", () => {
    expect(linesToArray("需求一\n\n需求二 ")).toEqual(["需求一", "需求二"]);
  });
  it("converts customer arrays back to editable lines", () => {
    expect(collectionToLines(["需求一", "需求二"])).toBe("需求一\n需求二");
  });
  it("uses customer context in local replies", () => {
    const customer = { name: "周明远", company_name: "云启科技", core_needs: ["CRM集成"] } as Customer;
    expect(buildLocalMockReply(customer, "希望了解实施周期")).toContain("周明远");
  });
});
