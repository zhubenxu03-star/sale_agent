export type IconName =
  | "dashboard"
  | "customers"
  | "knowledge"
  | "chart"
  | "settings"
  | "sparkles"
  | "bell"
  | "chevron"
  | "search"
  | "more"
  | "clipboard"
  | "brain"
  | "wand"
  | "copy"
  | "send"
  | "building"
  | "crown"
  | "link"
  | "phone"
  | "location"
  | "clock"
  | "arrow"
  | "check";

export interface NavItem {
  label: string;
  icon: IconName;
  active?: boolean;
  badge?: string;
}

export interface RecentCustomer {
  name: string;
  company: string;
  active?: boolean;
}

export interface Metric {
  label: string;
  value: string;
  helper: string;
  tone: "navy" | "gold" | "neutral" | "success";
  progress?: number;
}

export interface ChatMessage {
  id: number;
  role: "customer" | "agent";
  sender: string;
  time: string;
  content: string;
  tags?: string[];
}

export interface CustomerProfile {
  name: string;
  title: string;
  company: string;
  phone: string;
  location: string;
  source: string;
  demand: string;
  budget: string;
  decisionRole: string;
}

export interface KnowledgeItem {
  title: string;
  meta: string;
  match: number;
}

export interface ChampionTip {
  title: string;
  content: string;
  tag: string;
}

export interface WorkflowStep {
  label: string;
  icon: IconName;
}
