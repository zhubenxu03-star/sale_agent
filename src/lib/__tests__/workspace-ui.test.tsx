// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/ChatPanel";
import type { Conversation, Customer, Generation, Message } from "@/types/api";

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  archive: vi.fn(),
  saveGeneration: vi.fn(),
  feedback: vi.fn(),
  streamGeneration: vi.fn(),
  toast: vi.fn(),
}));

const customer = {
  id: "customer-1",
  name: "陈经理",
  company_name: "星河科技",
  industry: "企业服务",
  stage: "quotation",
} as Customer;

const conversation = {
  id: "conversation-1",
  customer_id: customer.id,
  title: "价格与服务沟通",
  status: "active",
} as Conversation;

const customerMessage = {
  id: "message-1",
  conversation_id: conversation.id,
  sender_type: "customer",
  content: "价格有点贵，服务具体包含什么？",
  created_at: "2026-07-20T09:00:00Z",
} as Message;

const generation = {
  id: "generation-1",
  request_id: "request-1",
  status: "completed",
  agent_id: "agent-1",
  conversation_id: conversation.id,
  customer_id: customer.id,
  source_message_id: customerMessage.id,
  provider: "test",
  model_name: "deterministic-test-v1",
  embedding_mode: "test",
  prompt_version: "sales-agent-v1",
  config_version: 3,
  generation_type: "standard",
  reply_text: "理解您的价格顾虑。服务包含需求诊断与六周上线陪跑。[K1]",
  need_human: false,
  human_reason: null,
  confidence: 0.88,
  prompt_tokens: 10,
  completion_tokens: 20,
  total_tokens: 30,
  duration_ms: 15,
  error_code: null,
  error_message: null,
  sources: [{ citation_key: "K1", citation_label: "价格与服务说明", content_snapshot: "标准服务说明", retrieval_score: 0.91, used_in_reply: true, document_available: true }],
  champion_sources: [{ strategy_key: "S1", title_snapshot: "价格异议处理", card_type: "objection_handling", strategy_snapshot: "先共情再拆解价值", reply_snapshot: "价格顾虑很正常", retrieval_score: 0.87, used_in_strategy: true }],
  result: {
    reply_text: "理解您的价格顾虑。服务包含需求诊断与六周上线陪跑。[K1]",
    customer_intent: "了解服务价值",
    sales_stage: "quotation",
    customer_sentiment: "neutral",
    core_needs: ["确认服务范围"],
    objections: ["价格较高"],
    recommended_strategy: "先共情，再用服务事实拆解价值",
    next_action: "确认客户优先场景",
    suggested_question: "您更关注交付范围还是投入产出？",
    need_human: false,
    human_reason: null,
    risk_flags: [],
    confidence: 0.88,
    citations: [{ citation_key: "K1", claim: "服务范围" }],
    champion_methods_used: [{ strategy_key: "S1", purpose: "处理价格异议" }],
  },
  created_at: "2026-07-20T09:01:00Z",
  completed_at: "2026-07-20T09:01:01Z",
} as Generation;

vi.mock("@/hooks/useConversations", () => ({
  useMessages: () => ({ data: [customerMessage], isPending: false, isError: false }),
  useCreateMessage: () => ({ mutateAsync: mocks.createMessage, isPending: false }),
  useArchiveConversation: () => ({ mutateAsync: mocks.archive, isPending: false }),
}));

vi.mock("@/hooks/useAgent", () => ({
  useDefaultAgent: () => ({ data: { id: "agent-1" } }),
  useAgentStatus: () => ({ data: { available: true, test_mode: false } }),
  useLatestGeneration: () => ({ data: { items: [generation] } }),
  useSaveGeneration: () => ({ mutateAsync: mocks.saveGeneration, isPending: false }),
  useGenerationFeedback: () => ({ mutateAsync: mocks.feedback, isPending: false }),
  streamGeneration: mocks.streamGeneration,
}));

vi.mock("@/components/providers/AppProviders", () => ({
  useToast: () => ({ showToast: mocks.toast }),
}));

function renderPanel() {
  return render(
    <ChatPanel
      customer={customer}
      conversations={[conversation]}
      conversation={conversation}
      conversationsLoading={false}
      conversationsError={null}
      onRetryConversations={vi.fn()}
      onSelectConversation={vi.fn()}
      onNewConversation={vi.fn()}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  mocks.createMessage.mockResolvedValue({ ...customerMessage, id: "message-2" });
  mocks.saveGeneration.mockResolvedValue({});
});

afterEach(cleanup);

describe("sales workspace response interactions", () => {
  it("collapses, hides and restores the latest generation without deleting it", () => {
    renderPanel();
    expect(screen.getByLabelText("推荐回复正文")).toHaveTextContent("六周上线陪跑");

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.getByLabelText("已收起的推荐回复")).toHaveTextContent("K 引用 1");
    expect(screen.getByLabelText("已收起的推荐回复")).toHaveTextContent("S 策略 1");

    fireEvent.click(screen.getByRole("button", { name: "关闭推荐回复" }));
    expect(screen.getByText("最近一次生成结果已隐藏")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看最近生成" }));
    expect(screen.getByLabelText("推荐回复正文")).toBeInTheDocument();
  });

  it("saves on Enter and keeps Shift+Enter for a new line", async () => {
    renderPanel();
    const input = screen.getByLabelText("客户消息输入");
    fireEvent.change(input, { target: { value: "新的客户消息" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(mocks.createMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(mocks.createMessage).toHaveBeenCalledWith({ sender_type: "customer", content: "新的客户消息" }));
  });

  it("edits and saves the current recommendation", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "编辑回复" }));
    const editor = screen.getByLabelText("编辑推荐回复");
    fireEvent.change(editor, { target: { value: "人工调整后的回复" } });
    fireEvent.click(screen.getByRole("button", { name: "保存到会话" }));
    await waitFor(() => expect(mocks.saveGeneration).toHaveBeenCalledWith({
      id: generation.id,
      reply_text: "人工调整后的回复",
      confirmed_human_review: false,
    }));
  });
});
