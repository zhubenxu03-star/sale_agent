import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

export async function GET(request: NextRequest) {
  return proxyAuthenticated(request, "/api/v1/customers", { includeSearch: true });
}

export async function POST(request: NextRequest) {
  return proxyAuthenticated(request, "/api/v1/customers", { method: "POST" });
}
