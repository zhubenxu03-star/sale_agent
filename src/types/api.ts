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
  created_at: string;
}
