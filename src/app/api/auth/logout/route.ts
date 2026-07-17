import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/bff/backend";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: null,
    message: "已退出登录",
  });
  clearAuthCookie(response);
  return response;
}
