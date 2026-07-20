"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useArchiveConversation, useCreateMessage, useMessages } from "@/hooks/useConversations";
import {
  streamGeneration,
  useAgentStatus,
  useDefaultAgent,
  useGenerationFeedback,
  useLatestGeneration,
  useSaveGeneration,
} from "@/hooks/useAgent";
import { useToast } from "@/components/providers/AppProviders";
import type { AgentOutput, Conversation, Customer, Generation, Message } from "@/types/api";

type GenerationMode = "standard" | "shorter" | "colloquial" | "conversion";
type ResultPanelState = "expanded" | "collapsed" | "hidden";

function time(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function MessageBubble({ message }: { message: Message }) {
  if (message.sender_type === "system") {
    return <div className="mx-auto w-fit rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--text-muted)]">{message.content}</div>;
  }
  const outgoing = message.sender_type === "sales" || message.sender_type === "assistant";
  const assistant = message.sender_type === "assistant";
  const names = { customer: "客户", sales: "我", assistant: "销转智能体", system: "系统" };
  return (
    <div className={`flex gap-3 ${outgoing ? "flex-row-reverse" : ""}`}>
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-medium ${assistant ? "bg-[var(--gold)] text-white" : outgoing ? "bg-[var(--champagne)] text-[var(--navy)]" : "bg-[var(--navy)] text-white"}`}>{assistant ? "智" : outgoing ? "我" : "客"}</div>
      <div className={`flex max-w-[82%] flex-col ${outgoing ? "items-end" : "items-start"}`}>
        <div className="mb-1 flex items-center gap-2 px-1 text-[11px] text-[var(--text-light)]"><span>{names[message.sender_type]}</span><span>{time(message.created_at)}</span></div>
        <div className={`rounded-[14px] px-4 py-3 text-sm leading-6 ${assistant ? "rounded-tr-[5px] border border-[var(--gold)]/25 bg-[var(--gold-soft)] text-[var(--text)]" : outgoing ? "rounded-tr-[5px] bg-[var(--navy)] text-white/95" : "rounded-tl-[5px] border border-[var(--border)] bg-white text-[var(--text)] shadow-[0_3px_10px_rgba(24,42,70,0.03)]"}`}>{message.content}</div>
        {assistant && <span className="mt-1 rounded bg-[var(--gold-soft)] px-2 py-0.5 text-[10px] text-[var(--gold-deep)]">{message.is_user_edited ? "AI 生成 · 人工已编辑" : "AI 生成 · 人工已确认"}</span>}
      </div>
    </div>
  );
}

type Props = {
  customer?: Customer;
  conversations: Conversation[];
  conversation?: Conversation;
  conversationsLoading: boolean;
  conversationsError: Error | null;
  onRetryConversations: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onGeneration?: (generation: Generation | null) => void;
  regenerationRequest?: { id: number; strategyTitle: string } | null;
};

const progressLabels: Record<string, string> = {
  analyzing: "正在分析客户需求",
  retrieving: "正在检索企业知识 K",
  sources: "已找到企业知识来源",
  champion_retrieval_started: "正在检索销冠策略 S",
  champion_retrieval_completed: "已完成销冠策略匹配",
  champion_sources: "已找到可参考的销冠策略",
  generating: "正在融合知识并生成回复",
  validating: "正在校验引用与风险",
};

export function ChatPanel({ customer, conversations, conversation, conversationsLoading, conversationsError, onRetryConversations, onSelectConversation, onNewConversation, onGeneration, regenerationRequest }: Props) {
  const [draft, setDraft] = useState("");
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [progress, setProgress] = useState("");
  const [generating, setGenerating] = useState(false);
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [resultPanelState, setResultPanelState] = useState<ResultPanelState>("expanded");
  const [isEditing, setIsEditing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const handledRegeneration = useRef<number | null>(null);
  const messagesQuery = useMessages(conversation?.id);
  const createMessage = useCreateMessage(conversation?.id);
  const archive = useArchiveConversation(customer?.id);
  const defaultAgent = useDefaultAgent();
  const status = useAgentStatus();
  const latestGeneration = useLatestGeneration(conversation?.id);
  const saveGeneration = useSaveGeneration(conversation?.id);
  const feedback = useGenerationFeedback();
  const { showToast } = useToast();
  const messages = useMemo(() => messagesQuery.data || [], [messagesQuery.data]);
  const lastCustomerMessage = [...messages].reverse().find((item) => item.sender_type === "customer");
  const currentGeneration = generation || latestGeneration.data?.items[0] || null;
  const replyValue = editedReply || currentGeneration?.reply_text || "";
  const result = currentGeneration?.result;
  const modelUnavailable = Boolean(status.data && !status.data.available);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages.length]);
  useEffect(() => {
    onGeneration?.(currentGeneration);
  }, [currentGeneration, onGeneration]);
  const saveCustomerMessage = useCallback(async (): Promise<Message | undefined> => {
    const content = draft.trim();
    if (!content || !conversation) return undefined;
    setDraft("");
    try {
      const saved = await createMessage.mutateAsync({ sender_type: "customer", content });
      showToast("客户消息已保存", "success");
      return saved;
    } catch (error) {
      setDraft((current) => current || content);
      showToast(error instanceof Error ? error.message : "消息保存失败", "error");
      return undefined;
    }
  }, [conversation, createMessage, draft, showToast]);

  const generate = useCallback(async (mode: GenerationMode = "standard", sourceMessageId?: string) => {
    const activeSourceId = sourceMessageId || lastCustomerMessage?.id;
    if (!customer || !conversation || !activeSourceId || !defaultAgent.data || generating) return;
    setGenerating(true);
    setProgress("正在分析客户需求");
    setHumanConfirmed(false);
    setResultPanelState("expanded");
    try {
      const generated = await streamGeneration({
        request_id: crypto.randomUUID(),
        agent_id: defaultAgent.data.id,
        customer_id: customer.id,
        conversation_id: conversation.id,
        source_message_id: activeSourceId,
        mode,
      }, (event, data) => {
        const record = data as { message?: string };
        if (progressLabels[event]) setProgress(record.message || progressLabels[event]);
      });
      setGeneration(generated);
      setEditedReply(generated.reply_text || "");
      setIsEditing(false);
      setProgress("");
      showToast("销转回复生成完成，请人工确认", "success");
    } catch (error) {
      setProgress("");
      showToast(error instanceof Error ? error.message : "生成失败", "error");
    } finally {
      setGenerating(false);
    }
  }, [customer, conversation, defaultAgent.data, generating, lastCustomerMessage?.id, showToast]);

  useEffect(() => {
    if (!regenerationRequest || generating || handledRegeneration.current === regenerationRequest.id) return;
    handledRegeneration.current = regenerationRequest.id;
    showToast(`将结合“${regenerationRequest.strategyTitle}”重新检索并生成`, "info");
    void generate("conversion");
  }, [generate, generating, regenerationRequest, showToast]);

  const generateFromComposer = async () => {
    let sourceMessageId = lastCustomerMessage?.id;
    if (draft.trim()) sourceMessageId = (await saveCustomerMessage())?.id;
    if (!sourceMessageId) {
      showToast("请先输入并保存一条客户消息", "info");
      return;
    }
    await generate("standard", sourceMessageId);
  };

  const saveReply = async () => {
    if (!currentGeneration || !replyValue.trim()) return;
    try {
      await saveGeneration.mutateAsync({ id: currentGeneration.id, reply_text: replyValue.trim(), confirmed_human_review: humanConfirmed });
      showToast("回复已保存到会话", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "回复保存失败", "error");
    }
  };

  const sendFeedback = async (rating: "helpful" | "not_helpful") => {
    if (!currentGeneration) return;
    try {
      await feedback.mutateAsync({ id: currentGeneration.id, rating, adopted: false, edited_before_save: replyValue.trim() !== currentGeneration.reply_text?.trim() });
      showToast("感谢反馈", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "反馈保存失败", "error");
    }
  };

  const paste = async () => {
    try { setDraft(await navigator.clipboard.readText()); }
    catch { showToast("无法读取剪贴板，请手动粘贴", "error"); }
  };

  const archiveCurrent = async () => {
    if (!conversation) return;
    try { await archive.mutateAsync(conversation.id); showToast("会话已归档", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "归档失败", "error"); }
  };

  const copyReply = async () => {
    try {
      const plain = replyValue.replace(/\[K(\d+)\]/g, "[资料$1]");
      await navigator.clipboard.writeText(plain);
      showToast("回复已复制", "success");
    } catch {
      showToast("复制失败，请手动选择回复内容", "error");
    }
  };

  return (
    <section className="panel-card relative flex min-h-0 flex-col overflow-hidden" aria-label="销售操作工作区">
      <div className="flex min-h-[50px] shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-sm font-semibold text-white">{customer?.name.slice(0, 1) || "—"}</div>
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[var(--navy)]">{customer?.name || "暂无客户"}</h2><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{customer?.company_name || "请先选择客户"}</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <select aria-label="选择会话" value={conversation?.id || ""} onChange={(event) => onSelectConversation(event.target.value)} disabled={!conversations.length} className="workspace-control max-w-[240px]"><option value="">{conversations.length ? "选择历史会话" : "暂无会话"}</option>{conversations.map((item) => <option key={item.id} value={item.id}>{item.status === "archived" ? "[已归档] " : ""}{item.title}</option>)}</select>
          <button type="button" aria-label="新建会话" onClick={onNewConversation} disabled={!customer} className="workspace-button border border-[var(--border)] bg-white text-[var(--navy)] disabled:opacity-40">+ 新建</button>
          <button type="button" aria-label="归档当前会话" onClick={archiveCurrent} disabled={!conversation || conversation.status === "archived"} className="workspace-button text-[var(--text-muted)] disabled:opacity-40">归档</button>
        </div>
      </div>

      {(status.data?.test_mode || modelUnavailable) && <div className={`shrink-0 border-b px-4 py-1 text-xs ${modelUnavailable ? "border-[#E7C8C4] bg-[#FFF7F6] text-[#9A463D]" : "border-[var(--gold)]/20 bg-[var(--gold-soft)] text-[var(--gold-deep)]"}`}>{modelUnavailable ? "大模型服务尚未配置" : "测试模型模式：用于流程验证，不代表真实模型回复质量"}</div>}

      <div className="chat-scroll min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F9F7F3] p-4">
        <section className="rounded-2xl border border-[var(--border)] bg-white" aria-label="会话消息">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><h3 className="text-sm font-semibold text-[var(--navy)]">会话与客户消息</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">连续查看客户原话与已确认回复</p></div><span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">{messages.length} 条消息</span></div>
          <div className="min-h-[220px] p-4">
            {conversationsLoading ? <div className="animate-pulse text-sm text-[var(--text-muted)]">正在加载会话…</div> : conversationsError ? <div className="text-center text-sm text-[#9A463D]">{conversationsError.message}<button onClick={onRetryConversations} className="ml-2 underline">重试</button></div> : !conversation ? <div className="grid min-h-[180px] place-items-center text-sm text-[var(--text-muted)]">{customer ? "请新建或选择会话" : "请先选择客户"}</div> : messagesQuery.isPending ? <div className="animate-pulse text-sm text-[var(--text-muted)]">正在加载消息…</div> : messagesQuery.isError ? <div className="text-center text-sm text-[#9A463D]">消息加载失败，请刷新重试</div> : !messages.length ? <div className="grid min-h-[180px] place-items-center text-sm text-[var(--text-muted)]">请在底部输入台保存第一条客户消息</div> : <div className="space-y-4">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={endRef} /></div>}
          </div>
        </section>

        {generating && <div className="flex items-center gap-3 rounded-2xl border border-[var(--gold)]/20 bg-[var(--gold-soft)] p-4 text-sm text-[var(--gold-deep)]"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--gold)]" /><div><p className="font-semibold">正在生成推荐回复</p><p className="mt-0.5 text-xs">{progress}</p></div></div>}

        {!generating && currentGeneration && resultPanelState === "hidden" && (
          <button type="button" onClick={() => setResultPanelState("expanded")} className="flex w-full items-center justify-between rounded-2xl border border-dashed border-[var(--gold)]/35 bg-white px-4 py-3 text-left"><div><p className="text-sm font-semibold text-[var(--navy)]">最近一次生成结果已隐藏</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">生成记录仍保留，可随时重新打开</p></div><span className="text-sm font-medium text-[var(--gold-deep)]">查看结果 →</span></button>
        )}

        {!generating && currentGeneration && result && resultPanelState !== "hidden" && (
          <GenerationResult
            generation={currentGeneration}
            result={result}
            replyValue={replyValue}
            panelState={resultPanelState}
            isEditing={isEditing}
            humanConfirmed={humanConfirmed}
            saving={saveGeneration.isPending}
            onReplyChange={setEditedReply}
            onToggleEditing={() => setIsEditing((value) => !value)}
            onHumanConfirmed={setHumanConfirmed}
            onCollapse={() => setResultPanelState("collapsed")}
            onExpand={() => setResultPanelState("expanded")}
            onClose={() => setResultPanelState("hidden")}
            onRegenerate={() => void generate()}
            onCopy={() => void copyReply()}
            onSave={() => void saveReply()}
            onFeedback={(rating) => void sendFeedback(rating)}
          />
        )}

        {!generating && result && currentGeneration && resultPanelState === "expanded" && <AnalysisSummary result={result} />}
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-white p-1.5">
        <div className="relative rounded-2xl border border-[var(--border-strong)] bg-[#FDFCFB] p-2 focus-within:border-[var(--gold)]/55 focus-within:shadow-[0_0_0_3px_rgba(185,138,82,0.08)]">
          <div className="pointer-events-none absolute left-3 right-3 top-2 z-10 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-[11px] text-[var(--text-muted)]"><strong className="font-semibold text-[var(--navy)]">{customer?.name || "未选择客户"}</strong><span className="mx-1.5 text-[var(--champagne)]">/</span>{conversation?.title || "未选择会话"}</p>
            <button type="button" onClick={() => setResultPanelState("expanded")} disabled={!currentGeneration} className="pointer-events-auto shrink-0 text-xs font-medium text-[var(--gold-deep)] disabled:cursor-not-allowed disabled:opacity-40">查看最近生成</button>
          </div>
          <textarea
            aria-label="客户消息输入"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveCustomerMessage(); } }}
            disabled={!conversation || conversation.status === "archived"}
            placeholder={conversation?.status === "archived" ? "该会话已归档" : "粘贴或输入客户原话。Enter 保存客户消息，Shift+Enter 换行…"}
            className="h-[120px] min-h-[120px] max-h-[190px] w-full resize-y bg-transparent px-1 pt-7 text-sm leading-6 outline-none disabled:cursor-not-allowed disabled:text-[var(--text-muted)]"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2">
            <div className="flex flex-wrap gap-2"><button type="button" onClick={paste} disabled={!conversation} className="workspace-button text-[var(--text-muted)] disabled:opacity-40"><Icon name="clipboard" className="h-4 w-4" />粘贴消息</button><button type="button" onClick={() => setDraft("")} disabled={!draft} className="workspace-button text-[var(--text-muted)] disabled:opacity-40">清空</button></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void saveCustomerMessage()} disabled={!draft.trim() || !conversation || createMessage.isPending} className="workspace-button border border-[var(--border)] bg-white text-[var(--navy)] disabled:opacity-40"><Icon name="send" className="h-4 w-4" />{createMessage.isPending ? "保存中…" : "保存客户消息"}</button><button type="button" onClick={() => void generateFromComposer()} disabled={!customer || !conversation || (!draft.trim() && !lastCustomerMessage) || generating || modelUnavailable} className="workspace-button bg-[var(--navy)] px-4 text-white shadow-[0_4px_12px_rgba(22,42,70,0.16)] disabled:opacity-40"><Icon name="wand" className="h-4 w-4" />{generating ? "生成中…" : "生成回复"}</button></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GenerationResult({ generation, result, replyValue, panelState, isEditing, humanConfirmed, saving, onReplyChange, onToggleEditing, onHumanConfirmed, onCollapse, onExpand, onClose, onRegenerate, onCopy, onSave, onFeedback }: { generation: Generation; result: AgentOutput; replyValue: string; panelState: ResultPanelState; isEditing: boolean; humanConfirmed: boolean; saving: boolean; onReplyChange: (value: string) => void; onToggleEditing: () => void; onHumanConfirmed: (value: boolean) => void; onCollapse: () => void; onExpand: () => void; onClose: () => void; onRegenerate: () => void; onCopy: () => void; onSave: () => void; onFeedback: (rating: "helpful" | "not_helpful") => void }) {
  const knowledgeCount = generation.sources.filter((item) => item.used_in_reply).length;
  const strategyCount = generation.champion_sources?.filter((item) => item.used_in_strategy).length || 0;
  const riskLabel = result.need_human ? "需人工确认" : result.risk_flags.length ? "存在风险提示" : "风险校验通过";

  if (panelState === "collapsed") {
    return (
      <section className="rounded-2xl border border-[var(--gold)]/25 bg-white" aria-label="已收起的推荐回复">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs"><strong className="text-sm text-[var(--navy)]">推荐回复</strong><SummaryBadge value={riskLabel} tone={result.need_human ? "risk" : "success"} /><SummaryBadge value={`置信度 ${Math.round(result.confidence * 100)}%`} /><SummaryBadge value={`K 引用 ${knowledgeCount}`} /><SummaryBadge value={`S 策略 ${strategyCount}`} /></div>
          <div className="flex items-center gap-2"><button type="button" onClick={onExpand} className="context-button">展开</button><button type="button" onClick={onClose} aria-label="关闭推荐回复" className="context-button">关闭</button></div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--gold)]/25 bg-white" aria-label="AI 生成结果">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--gold-soft)] text-[var(--gold-deep)]"><Icon name="sparkles" className="h-4 w-4" /></span><h3 className="text-base font-semibold text-[var(--navy)]">AI 推荐回复</h3></div><p className="mt-1 text-[11px] text-[var(--text-muted)]">配置 v{generation.config_version} · 生成置信度 {Math.round(result.confidence * 100)}%</p></div>
        <div className="flex items-center gap-2"><button type="button" onClick={onCollapse} className="context-button">收起</button><button type="button" onClick={onClose} aria-label="关闭推荐回复" className="context-button">关闭</button></div>
      </div>

      <div className="p-4">
        {result.need_human ? (
          <div className="mb-3 rounded-xl border border-[#D8A39C] bg-[#FFF7F6] px-4 py-3 text-sm leading-6 text-[#8C3D35]"><strong>需要人工确认：</strong>{result.human_reason}</div>
        ) : result.risk_flags.length ? (
          <div className="mb-3 rounded-xl border border-[#E7D4B8] bg-[#FFF9F0] px-4 py-3 text-sm text-[#8A633A]">风险校验提示：{result.risk_flags.join("、")}</div>
        ) : (
          <div className="mb-3 rounded-xl border border-[#CFE0D4] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">风险校验通过，保存前仍建议人工快速确认。</div>
        )}

        {isEditing ? (
          <textarea aria-label="编辑推荐回复" value={replyValue} onChange={(event) => onReplyChange(event.target.value)} className="min-h-[220px] w-full resize-y rounded-xl border border-[var(--border-strong)] bg-[#FDFCFB] p-4 text-sm leading-7 outline-none focus:border-[var(--gold)]" />
        ) : (
          <div aria-label="推荐回复正文" className="min-h-[220px] whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[#FDFCFB] p-4 text-sm leading-7 text-[var(--text)]">{replyValue}</div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2"><SummaryBadge value={`K 引用 ${knowledgeCount}`} /><SummaryBadge value={`S 策略 ${strategyCount}`} /><button type="button" onClick={() => onFeedback("helpful")} className="context-button">有帮助</button><button type="button" onClick={() => onFeedback("not_helpful")} className="context-button">需改进</button></div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onRegenerate} className="workspace-button text-[var(--text-muted)]">重新生成</button><button type="button" onClick={onCopy} className="workspace-button border border-[var(--border)] bg-white text-[var(--navy)]"><Icon name="copy" className="h-4 w-4" />复制回复</button><button type="button" onClick={onToggleEditing} className="workspace-button border border-[var(--border)] bg-white text-[var(--navy)]">{isEditing ? "完成编辑" : "编辑回复"}</button><button type="button" onClick={onSave} disabled={saving || (result.need_human && !humanConfirmed)} className="workspace-button bg-[var(--gold)] px-4 text-white disabled:opacity-40">{saving ? "保存中…" : "保存到会话"}</button></div>
        </div>
        {result.need_human && <label className="mt-3 flex min-h-10 items-center gap-2 rounded-lg bg-[#FFF7F6] px-3 text-sm text-[#8C3D35]"><input type="checkbox" checked={humanConfirmed} onChange={(event) => onHumanConfirmed(event.target.checked)} />我已完成必要的人工审核</label>}
      </div>
    </section>
  );
}

function AnalysisSummary({ result }: { result: AgentOutput }) {
  const needs = result.core_needs.length ? result.core_needs.join("、") : "暂无明确核心需求";
  const objections = result.objections.length ? result.objections.join("、") : "暂无明确异议";
  const items = [
    ["客户意图", result.customer_intent],
    ["客户情绪", result.customer_sentiment],
    ["核心需求", needs],
    ["当前异议", objections],
    ["推荐策略", result.recommended_strategy],
    ["下一步动作", result.next_action],
    ["建议追问", result.suggested_question || "暂无建议追问"],
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white" aria-label="分析摘要">
      <div className="border-b border-[var(--border)] px-4 py-3"><h3 className="text-base font-semibold text-[var(--navy)]">分析摘要</h3><p className="mt-0.5 text-[11px] text-[var(--text-muted)]">把客户判断与下一步动作集中在同一区域</p></div>
      <div className="grid sm:grid-cols-2">
        {items.map(([label, value], index) => <div key={label} className={`min-w-0 p-4 ${index < items.length - 2 ? "border-b border-[var(--border)]" : ""} ${index % 2 === 0 ? "sm:border-r sm:border-[var(--border)]" : ""}`}><p className="text-[11px] font-medium tracking-[0.04em] text-[var(--text-light)]">{label}</p><p className="mt-1.5 text-sm leading-6 text-[var(--text)]">{value}</p></div>)}
      </div>
    </section>
  );
}

function SummaryBadge({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "risk" | "success" }) {
  const style = tone === "risk" ? "bg-[#FFF1EF] text-[#8C3D35]" : tone === "success" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-muted)] text-[var(--text-muted)]";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] ${style}`}>{value}</span>;
}
