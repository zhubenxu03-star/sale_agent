import type { EntityStatus, PageData } from "@/types/api";

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  knowledge_type: "company";
  status: EntityStatus;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  document_count: number;
  ready_document_count: number;
  chunk_count: number;
}

export type DocumentStatus =
  "uploaded" | "processing" | "ready" | "failed" | "disabled";
export type ProcessingStage =
  | "waiting"
  | "parsing"
  | "chunking"
  | "embedding"
  | "saving"
  | "completed"
  | "failed";

export interface KnowledgeDocument {
  id: string;
  knowledge_base_id: string;
  original_filename: string;
  display_name: string;
  file_extension: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: DocumentStatus;
  processing_stage: ProcessingStage;
  progress: number;
  chunk_count: number;
  error_code: string | null;
  error_message: string | null;
  uploaded_by_user_id: string;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export type KnowledgeDocumentPage = PageData<KnowledgeDocument>;

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  content_hash: string;
  token_count: number;
  page_number: number | null;
  sheet_name: string | null;
  row_start: number | null;
  row_end: number | null;
  section_title: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export type KnowledgeChunkPage = PageData<KnowledgeChunk>;

export interface KnowledgeSearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  score: number;
  page_number: number | null;
  sheet_name: string | null;
  row_start: number | null;
  row_end: number | null;
  section_title: string | null;
  citation_label: string;
}

export interface KnowledgeSearchData {
  query: string;
  results: KnowledgeSearchResult[];
  embedding_mode: "test" | "production";
  duration_ms: number;
}

export interface KnowledgeSearchInput {
  query: string;
  knowledge_base_id?: string;
  top_k: number;
  min_score: number;
}
