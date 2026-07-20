export type ChampionRole = "admin" | "manager" | "sales";
export type ChampionSourceStatus = "uploaded" | "mapping_required" | "processing" | "review_required" | "ready" | "failed" | "disabled";
export type ChampionCardStatus = "draft" | "review" | "approved" | "rejected" | "disabled";

export interface ChampionSource {
  id: string;
  name: string;
  source_type: string;
  original_filename: string | null;
  file_extension: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  retain_original: boolean;
  status: ChampionSourceStatus;
  processing_stage: string;
  progress: number;
  record_count: number;
  conversation_count: number;
  candidate_card_count: number;
  approved_card_count: number;
  redaction_count: number;
  error_code: string | null;
  error_message: string | null;
  uploaded_by_user_id: string;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface ChampionPreview {
  records: Record<string, unknown>[];
  redacted_records: Record<string, unknown>[];
  redaction_count: number;
  mapping_required: boolean;
}

export interface ChampionCard {
  id: string;
  tenant_id: string;
  source_id: string | null;
  conversation_id: string | null;
  title: string;
  card_type: string;
  applicable_industries: string[];
  applicable_sales_stages: string[];
  applicable_customer_sentiments: string[];
  trigger_patterns: string[];
  customer_intent: string | null;
  customer_objection: string | null;
  customer_example: string;
  salesperson_reply: string;
  strategy_summary: string;
  why_it_works: string;
  recommended_next_action: string | null;
  suggested_question: string | null;
  tone_tags: string[];
  risk_notes: string[];
  outcome: string;
  historical_success_rate: number | null;
  quality_score: number;
  admin_score: number | null;
  status: ChampionCardStatus;
  version: number;
  possible_duplicate: boolean;
  duplicate_of_card_id: string | null;
  duplicate_score: number | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  searchable_text: string;
  usage_count: number;
  adopted_count: number;
}

export interface ChampionSearchResult extends ChampionCard {
  strategy_key: string;
  semantic_score: number;
  industry_score: number;
  stage_score: number;
  success_score: number;
  admin_score_value: number;
  final_score: number;
}

export interface ChampionStats {
  source_count: number;
  conversation_count: number;
  candidate_card_count: number;
  review_count: number;
  approved_count: number;
  monthly_usage_count: number;
  adoption_rate: number;
}
