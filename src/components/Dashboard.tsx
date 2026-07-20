"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChampionPanel } from "@/components/ChampionPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { ConversationDialog } from "@/components/conversations/ConversationDialog";
import { ConfirmDialog } from "@/components/customers/ConfirmDialog";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { CustomerToolbar } from "@/components/customers/CustomerToolbar";
import { CustomerPanel } from "@/components/CustomerPanel";
import { Header } from "@/components/Header";
import { KnowledgePanel } from "@/components/KnowledgePanel";
import { MetricCard } from "@/components/MetricCard";
import { useToast } from "@/components/providers/AppProviders";
import { Sidebar } from "@/components/Sidebar";
import { Workflow } from "@/components/Workflow";
import { useCurrentUser } from "@/hooks/useAuth";
import { useConversations, useCreateConversation, useMessages } from "@/hooks/useConversations";
import {
  useCreateCustomer,
  useCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from "@/hooks/useCustomers";
import { ApiError } from "@/lib/api/client";
import type { Metric } from "@/types";
import type { Customer, CustomerInput, Generation } from "@/types/api";

function customerMetrics(customer?: Customer, generation?: Generation | null): Metric[] {
  const generated = generation?.result;
  const probability = customer?.deal_probability == null ? undefined : Number(customer.deal_probability);
  return [
    {
      label: "客户阶段",
      value: customer?.stage || "暂无",
      helper: customer ? "来自客户真实资料" : "请选择客户",
      tone: "navy",
    },
    {
      label: "生成置信度",
      value: generated ? `${Math.round(generated.confidence * 100)}%` : "暂无",
      helper: generated ? "模型输出可信程度，不代表客户意向分" : "等待生成回复",
      tone: "success",
      progress: generated ? Math.round(generated.confidence * 100) : undefined,
    },
    {
      label: "推荐策略",
      value: generated?.recommended_strategy || "暂无",
      helper: generated ? "来自最新生成结果" : "等待智能体分析",
      tone: "gold",
    },
    {
      label: "成交概率",
      value: probability === undefined ? "暂无" : `${probability}%`,
      helper: probability === undefined ? "尚未填写" : "业务人员录入，AI 不自动覆盖",
      tone: "neutral",
      progress: probability,
    },
  ];
}

export function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [customerDialog, setCustomerDialog] = useState<"create" | "edit" | null>(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [conversationDialog, setConversationDialog] = useState(false);
  const [latestGeneration, setLatestGeneration] = useState<Generation | null>(null);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [regenerationRequest, setRegenerationRequest] = useState<{ id: number; strategyTitle: string } | null>(null);
  const { showToast } = useToast();
  const identity = useCurrentUser();
  const customersQuery = useCustomers(search);
  const customers = useMemo(() => customersQuery.data?.items || [], [customersQuery.data]);
  const requestedCustomerId = searchParams.get("customer") || undefined;
  const selectedCustomerId = requestedCustomerId || customers[0]?.id;
  const customerQuery = useCustomer(selectedCustomerId);
  const conversationsQuery = useConversations(customerQuery.data?.id);
  const conversations = useMemo(
    () => conversationsQuery.data?.items || [],
    [conversationsQuery.data],
  );
  const requestedConversationId = searchParams.get("conversation") || undefined;
  const conversation =
    conversations.find((item) => item.id === requestedConversationId) || conversations[0];
  const dashboardMessages = useMessages(conversation?.id);
  const latestCustomerMessage = [...(dashboardMessages.data || [])]
    .reverse()
    .find((item) => item.sender_type === "customer")?.content;
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer(customerQuery.data?.id);
  const deleteCustomer = useDeleteCustomer();
  const createConversation = useCreateConversation(customerQuery.data?.id);

  const setSelection = (customerId?: string, conversationId?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (customerId) params.set("customer", customerId);
    else params.delete("customer");
    if (conversationId) params.set("conversation", conversationId);
    else params.delete("conversation");
    router.replace(`/?${params.toString()}`);
  };

  useEffect(() => {
    if (!requestedCustomerId && customers[0]) setSelection(customers[0].id);
    // URL is the source of truth; only missing selections are normalized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCustomerId, customers]);
  useEffect(() => {
    if (customerQuery.error instanceof ApiError && customerQuery.error.status === 404) {
      setSelection(customers[0]?.id);
      showToast("所选客户不存在，已恢复为有效客户", "info");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQuery.error]);
  useEffect(() => {
    if (conversation && conversation.id !== requestedConversationId) {
      setSelection(selectedCustomerId, conversation.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, requestedConversationId]);

  if (!identity.data) return null;
  const metrics = customerMetrics(customerQuery.data, latestGeneration);
  const handleCustomerSubmit = async (payload: CustomerInput) => {
    try {
      const saved =
        customerDialog === "edit"
          ? await updateCustomer.mutateAsync(payload)
          : await createCustomer.mutateAsync(payload);
      setCustomerDialog(null);
      setRegenerationRequest(null);
      setSelection(saved.id);
      showToast(customerDialog === "edit" ? "客户资料已更新" : "客户创建成功", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "客户保存失败", "error");
    }
  };
  const handleDelete = async () => {
    if (!customerQuery.data) return;
    try {
      await deleteCustomer.mutateAsync(customerQuery.data.id);
      setDeleteDialog(false);
      setRegenerationRequest(null);
      setSelection();
      showToast("客户及关联会话已删除", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "客户删除失败", "error");
    }
  };
  const handleCreateConversation = async (title: string) => {
    try {
      const created = await createConversation.mutateAsync(title);
      setConversationDialog(false);
      setRegenerationRequest(null);
      setSelection(selectedCustomerId, created.id);
      showToast("会话创建成功", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "会话创建失败", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar
        identity={identity.data}
        customers={customers}
        selectedCustomerId={selectedCustomerId}
        collapsed={collapsed}
      />
      <Header
        identity={identity.data}
        collapsed={collapsed}
        onToggleSidebar={() => setCollapsed((value) => !value)}
      />
      <main
        className={`mt-16 h-[calc(100vh-64px)] min-h-[620px] overflow-hidden p-3 transition-[margin] xl:p-4 2xl:p-5 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}
      >
        <div className="workspace-shell mx-auto flex h-full min-w-0 max-w-[1800px] flex-col gap-3 2xl:gap-4">
          <CustomerToolbar
            customers={customers}
            selectedId={selectedCustomerId}
            search={search}
            loading={customersQuery.isPending}
            onSearch={setSearch}
            onSelect={(id) => { setRegenerationRequest(null); setSelection(id); }}
            onCreate={() => setCustomerDialog("create")}
          />
          {customersQuery.isError && (
            <div className="rounded-xl border border-[#E7C8C4] bg-[#FFF7F6] px-4 py-2 text-[10px] text-[#9A463D]">
              {customersQuery.error instanceof Error ? customersQuery.error.message : "客户列表加载失败。"}
              <button onClick={() => customersQuery.refetch()} className="ml-2 underline">
                重试
              </button>
            </div>
          )}
          <section className="grid shrink-0 grid-cols-4 gap-3 2xl:gap-4" aria-label="客户关键指标">
            {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>
          <div className={`grid min-h-0 flex-1 gap-3 2xl:gap-4 ${contextCollapsed ? "grid-cols-[minmax(0,1fr)_48px]" : "grid-cols-[minmax(0,7fr)_minmax(288px,3fr)]"}`}>
            <ChatPanel
              key={conversation?.id || "no-conversation"}
              customer={customerQuery.data}
              conversations={conversations}
              conversation={conversation}
              conversationsLoading={conversationsQuery.isPending && Boolean(customerQuery.data)}
              conversationsError={conversationsQuery.error instanceof Error ? conversationsQuery.error : null}
              onRetryConversations={() => { void conversationsQuery.refetch(); }}
              onSelectConversation={(id) => { setRegenerationRequest(null); setSelection(selectedCustomerId, id); }}
              onNewConversation={() => setConversationDialog(true)}
              onGeneration={setLatestGeneration}
              regenerationRequest={regenerationRequest}
            />
            <aside className="relative min-h-0 overflow-hidden rounded-[16px] border border-[var(--border)] bg-[#F4F1EB]" aria-label="客户与知识上下文">
              <div className={`flex h-12 items-center border-b border-[var(--border)] bg-white/95 px-2 ${contextCollapsed ? "justify-center" : "justify-between"}`}>
                {!contextCollapsed && <div><p className="text-sm font-semibold text-[var(--navy)]">上下文侧栏</p><p className="text-[10px] text-[var(--text-muted)]">客户 · 企业知识 K · 销冠策略 S</p></div>}
                <button type="button" onClick={() => setContextCollapsed((value) => !value)} aria-label={contextCollapsed ? "展开上下文侧栏" : "收起上下文侧栏"} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--navy)]"><span className={`text-base transition-transform ${contextCollapsed ? "rotate-180" : ""}`}>›</span></button>
              </div>
              {!contextCollapsed && <div className="chat-scroll h-[calc(100%-48px)] space-y-3 overflow-y-auto p-3 2xl:space-y-4 2xl:p-4">
                <CustomerPanel
                  customer={customerQuery.data}
                  loading={customerQuery.isPending && Boolean(selectedCustomerId)}
                  error={customerQuery.error}
                  onRetry={() => customerQuery.refetch()}
                  onEdit={() => setCustomerDialog("edit")}
                  onDelete={() => setDeleteDialog(true)}
                />
                <KnowledgePanel latestCustomerMessage={latestCustomerMessage} generation={latestGeneration} />
                <ChampionPanel latestCustomerMessage={latestCustomerMessage} customer={customerQuery.data} generation={latestGeneration} onRegenerate={(strategyTitle) => setRegenerationRequest({ id: Date.now(), strategyTitle })} />
              </div>}
            </aside>
          </div>
          <Workflow />
        </div>
      </main>
      <CustomerFormDialog
        open={Boolean(customerDialog)}
        customer={customerDialog === "edit" ? customerQuery.data : undefined}
        pending={createCustomer.isPending || updateCustomer.isPending}
        onClose={() => setCustomerDialog(null)}
        onSubmit={handleCustomerSubmit}
      />
      <ConfirmDialog
        open={deleteDialog}
        title="确认删除客户？"
        description="该操作将物理删除客户及其关联的会话和消息，且无法撤销。"
        pending={deleteCustomer.isPending}
        onClose={() => setDeleteDialog(false)}
        onConfirm={handleDelete}
      />
      {conversationDialog && (
        <ConversationDialog
          open
          pending={createConversation.isPending}
          onClose={() => setConversationDialog(false)}
          onSubmit={handleCreateConversation}
        />
      )}
    </div>
  );
}
