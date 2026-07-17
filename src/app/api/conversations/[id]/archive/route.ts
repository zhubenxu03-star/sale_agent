import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyAuthenticated(
    request,
    `/api/v1/conversations/${encodeURIComponent(id)}/archive`,
    { method: "PATCH", body: null },
  );
}
