import { proxyKnowledgeDownload } from "@/lib/bff/knowledge";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyKnowledgeDownload(id);
}
