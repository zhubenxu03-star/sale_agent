import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

export async function GET(request: NextRequest) {
  return proxyAuthenticated(request, "/api/v1/auth/me");
}
