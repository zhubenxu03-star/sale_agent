import { NextRequest } from "next/server";
import { proxyKnowledgeUpload } from "@/lib/bff/knowledge";

export async function POST(request: NextRequest) {
  return proxyKnowledgeUpload(request);
}
