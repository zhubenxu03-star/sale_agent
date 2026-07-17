import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

export async function POST(request: NextRequest) {
  return proxyAuthenticated(request, "/api/v1/knowledge/search", {
    method: "POST",
  });
}
