import { NextRequest } from "next/server";
import { proxyAuthenticated } from "@/lib/bff/authenticated";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyAuthenticated(
    request,
    `/api/v1/knowledge/documents/${encodeURIComponent(id)}/enable`,
    { method: "PATCH", body: {} },
  );
}
