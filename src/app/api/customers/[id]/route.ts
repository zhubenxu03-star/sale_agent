import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyAuthenticated(request, `/api/v1/customers/${encodeURIComponent(id)}`);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyAuthenticated(request, `/api/v1/customers/${encodeURIComponent(id)}`, {
    method: "PUT",
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyAuthenticated(request, `/api/v1/customers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
