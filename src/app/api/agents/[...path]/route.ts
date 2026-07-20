import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxyAuthenticated(request, `/api/v1/agents/${path.join("/")}`);
}

export async function PUT(request: NextRequest, context: Context) {
  const { path } = await context.params;
  return proxyAuthenticated(request, `/api/v1/agents/${path.join("/")}`, { method: "PUT" });
}
