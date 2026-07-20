export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  data: null;
  message: string;
  error_code: string;
}

export type UserRole = "admin" | "manager" | "sales";
export type EntityStatus = "active" | "disabled";

export interface Tenant {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: UserRole;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface AuthIdentity {
  user: User;
  tenant: Tenant;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  company_name: string | null;
  industry: string | null;
  company_size: string | null;
  region: string | null;
  source: string | null;
  stage: string | null;
  budget_min: string | number | null;
  budget_max: string | number | null;
  expected_amount: string | number | null;
  expected_close_date: string | null;
  deal_probability: string | number | null;
  core_needs: string[] | Record<string, unknown> | null;
  pain_points: string[] | Record<string, unknown> | null;
  objections: string[] | Record<string, unknown> | null;
  notes: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerInput = Omit<
  Customer,
  "id" | "tenant_id" | "owner_user_id" | "created_at" | "updated_at"
>;

export interface PageData<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export type ConversationStatus = "active" | "archived";

export interface Conversation {
  id: string;
  tenant_id: string;
  customer_id: string;
  owner_user_id: string | null;
  title: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export type SenderType = "customer" | "sales" | "assistant" | "system";

export interface Message {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_type: SenderType;
  content: string;
  metadata_json: Record<string, unknown> | null;
  generation_id: string | null;
  is_ai_generated: boolean;
  is_user_edited: boolean;
  created_at: string;
}

export type AgentRiskFlag =
  | "PRICE_UNVERIFIED"
  | "DISCOUNT_APPROVAL_REQUIRED"
  | "DELIVERY_COMMITMENT"
  | "LEGAL_OR_CONTRACT"
  | "REFUND_OR_COMPLAINT"
  | "SECURITY_COMMITMENT"
  | "NO_RELIABLE_KNOWLEDGE"
  | "CUSTOMER_REQUESTED_HUMAN"
  | "HIGH_VALUE_OPPORTUNITY"
  | "LOW_CONFIDENCE"
  | "MODEL_OUTPUT_INVALID"
  | "PROMPT_INJECTION_DETECTED";

export interface SalesAgent {
  id: string;
  name: string;
  description: string | null;
  status: EntityStatus;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentCitation {
  citation_key: string;
  claim: string;
}

export interface AgentOutput {
  reply_text: string;
  customer_intent: string;
  sales_stage: string;
  customer_sentiment: string;
  core_needs: string[];
  objections: string[];
  recommended_strategy: string;
  next_action: string;
  suggested_question: string | null;
  need_human: boolean;
  human_reason: string | null;
  risk_flags: AgentRiskFlag[];
  confidence: number;
  citations: AgentCitation[];
  champion_methods_used?: { strategy_key: string; purpose: string }[];
}

export interface GenerationSource {
  citation_key: string;
  citation_label: string;
  content_snapshot: string;
  retrieval_score: number;
  used_in_reply: boolean;
  document_available: boolean;
}

export interface Generation {
  id: string;
  request_id: string;
  status: "queued" | "retrieving" | "generating" | "completed" | "failed" | "cancelled";
  agent_id: string;
  customer_id: string;
  conversation_id: string;
  source_message_id: string | null;
  provider: string;
  model_name: string;
  embedding_mode: string;
  prompt_version: string;
  config_version: number;
  generation_type?: "standard" | "test";
  result: AgentOutput | null;
  reply_text: string | null;
  need_human: boolean;
  human_reason: string | null;
  confidence: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  sources: GenerationSource[];
  champion_sources?: GenerationChampionSource[];
  created_at: string;
  completed_at: string | null;
}

export interface GenerationChampionSource {
  strategy_key: string;
  title_snapshot: string;
  card_type: string;
  strategy_snapshot: string;
  reply_snapshot: string;
  retrieval_score: number;
  used_in_strategy: boolean;
}

export interface AgentServiceStatus {
  available: boolean;
  provider: string;
  model_name: string;
  test_mode: boolean;
  stream_enabled: boolean;
  knowledge_ready_documents: number;
}

export interface AgentConfig {
  id: string;
  agent_id: string;
  identity_prompt: string;
  reply_style: "consultative" | "professional" | "friendly" | "concise" | "conversion";
  reply_length: "short" | "medium" | "long";
  sales_aggressiveness: "low" | "medium" | "high";
  allow_emoji: boolean;
  default_top_k: number;
  default_min_score: number;
  temperature: number;
  max_output_tokens: number;
  require_citations: boolean;
  enterprise_knowledge_enabled: boolean;
  prohibited_claims: string[];
  human_handoff_rules: string[];
  custom_instructions: string | null;
  version: number;
  updated_at: string;
  champion_enabled: boolean;
  champion_top_k: number;
  champion_min_score: number;
  champion_industry_weight: number;
  champion_stage_weight: number;
  champion_success_weight: number;
  champion_admin_score_weight: number;
  champion_semantic_weight: number;
  champion_prefer_tenant: boolean;
  champion_allow_general_generation: boolean;
  draft_version: number;
  published_version: number | null;
  published_at: string | null;
  published_by_user_id: string | null;
  has_published_config: boolean;
}
