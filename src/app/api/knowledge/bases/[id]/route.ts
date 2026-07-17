import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return proxyAuthenticated(
    request,
    `/api/v1/knowledge/bases/${encodeURIComponent(id)}`,
  );
}

export async function PUT(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return proxyAuthenticated(
    request,
    `/api/v1/knowledge/bases/${encodeURIComponent(id)}`,
    {
      method: "PUT",
    },
  );
}

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  return proxyAuthenticated(
    request,
    `/api/v1/knowledge/bases/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
