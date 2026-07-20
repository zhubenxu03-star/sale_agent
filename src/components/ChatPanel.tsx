"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { Conversation, Customer, Generation, Message } from "@/types/api";

function time(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function MessageBubble({ message }: { message: Message }) {
  if (message.sender_type === "system") return <div className="mx-auto w-fit rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[9px] text-[var(--text-muted)]">{message.content}</div>;
  const outgoing = message.sender_type === "sales" || message.sender_type === "assistant";
  const assistant = message.sender_type === "assistant";
  const names = { customer: "客户", sales: "我", assistant: "销转智能体", system: "系统" };
  return <div className={`flex gap-2.5 ${outgoing ? "flex-row-reverse" : ""}`}>
    <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-medium ${assistant ? "bg-[var(--gold)] text-white" : outgoing ? "bg-[var(--champagne)] text-[var(--navy)]" : "bg-[var(--navy)] text-white"}`}>{assistant ? "智" : outgoing ? "我" : "客"}</div>
    <div className={`flex max-w-[78%] flex-col ${outgoing ? "items-end" : "items-start"}`}>
      <div className="mb-1 flex items-center gap-2 px-1 text-[9px] text-[var(--text-light)]"><span>{names[message.sender_type]}</span><span>{time(message.created_at)}</span></div>
      <div className={`rounded-[13px] px-3.5 py-2.5 text-[12px] leading-[1.65] ${assistant ? "rounded-tr-[4px] border border-[var(--gold)]/25 bg-[var(--gold-soft)] text-[var(--text)]" : outgoing ? "rounded-tr-[4px] bg-[var(--navy)] text-white/90" : "rounded-tl-[4px] border border-[var(--border)] bg-white text-[var(--text)] shadow-[0_3px_10px_rgba(24,42,70,0.03)]"}`}>{message.content}</div>
      {assistant && <span className="mt-1 rounded bg-[var(--gold-soft)] px-2 py-0.5 text-[8px] text-[var(--gold-deep)]">{message.is_user_edited ? "AI 生成 · 人工已编辑" : "AI 生成 · 人工已确认"}</span>}
    </div>
  </div>;
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
};

const progressLabels: Record<string, string> = {
  analyzing: "正在分析客户需求",
  retrieving: "正在检索企业知识",
  sources: "已找到相关资料",
  champion_retrieval_started: "正在检索销冠经验",
  champion_retrieval_completed: "已完成销冠经验匹配",
  champion_sources: "已找到可参考的销冠策略",
  generating: "正在生成回复",
  validating: "正在校验引用与风险",
};

export function ChatPanel({ customer, conversations, conversation, conversationsLoading, conversationsError, onRetryConversations, onSelectConversation, onNewConversation, onGeneration }: Props) {
  const [draft, setDraft] = useState("");
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [progress, setProgress] = useState("");
  const [generating, setGenerating] = useState(false);
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  const currentGeneration = generation || latestGeneration.data?.items[0] || null;
  const replyValue = editedReply || currentGeneration?.reply_text || "";

  const saveCustomerMessage = async () => {
    if (!draft.trim() || !conversation) return;
    try {
      await createMessage.mutateAsync({ sender_type: "customer", content: draft.trim() });
      setDraft("");
      showToast("客户消息已保存", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "消息保存失败", "error"); }
  };

  const generate = async (mode: "standard" | "shorter" | "colloquial" | "conversion" = "standard") => {
    if (!customer || !conversation || !lastCustomerMessage || !defaultAgent.data || generating) return;
    setGenerating(true);
    setProgress("正在分析客户需求");
    setHumanConfirmed(false);
    try {
      const result = await streamGeneration({
        request_id: crypto.randomUUID(),
        agent_id: defaultAgent.data.id,
        customer_id: customer.id,
        conversation_id: conversation.id,
        source_message_id: lastCustomerMessage.id,
        mode,
      }, (event, data) => {
        const record = data as { message?: string };
        if (progressLabels[event]) setProgress(record.message || progressLabels[event]);
      });
      setGeneration(result);
      setEditedReply(result.reply_text || "");
      onGeneration?.(result);
      setProgress("");
      showToast("销转回复生成完成，请人工确认", "success");
    } catch (error) {
      setProgress("");
      showToast(error instanceof Error ? error.message : "生成失败", "error");
    } finally { setGenerating(false); }
  };

  const saveReply = async () => {
    if (!currentGeneration || !replyValue.trim()) return;
    try {
      await saveGeneration.mutateAsync({ id: currentGeneration.id, reply_text: replyValue.trim(), confirmed_human_review: humanConfirmed });
      showToast("回复已保存到会话", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "回复保存失败", "error"); }
  };

  const sendFeedback = async (rating: "helpful" | "not_helpful") => {
    if (!currentGeneration) return;
    try {
      await feedback.mutateAsync({ id: currentGeneration.id, rating, adopted: false, edited_before_save: replyValue.trim() !== currentGeneration.reply_text?.trim() });
      showToast("感谢反馈", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "反馈保存失败", "error"); }
  };

  const paste = async () => {
    try { setDraft(await navigator.clipboard.readText()); } catch { showToast("无法读取剪贴板，请手动粘贴", "error"); }
  };
  const archiveCurrent = async () => {
    if (!conversation) return;
    try { await archive.mutateAsync(conversation.id); showToast("会话已归档", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "归档失败", "error"); }
  };
  const copyReply = async () => {
    const plain = replyValue.replace(/\[K(\d+)\]/g, "[资料$1]");
    await navigator.clipboard.writeText(plain);
    showToast("回复已复制", "success");
  };

  const result = currentGeneration?.result;
  const modelUnavailable = status.data && !status.data.available;
  return <section className="panel-card relative flex min-h-0 flex-col overflow-hidden">
    <div className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4">
      <div className="flex min-w-0 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-xs font-semibold text-white">{customer?.name.slice(0, 1) || "—"}</div><div className="min-w-0"><h2 className="truncate text-[13px] font-semibold text-[var(--navy)]">{customer?.name || "暂无客户"}</h2><p className="mt-0.5 truncate text-[9px] text-[var(--text-muted)]">{customer?.company_name || "请先选择客户"}</p></div></div>
      <div className="flex min-w-0 items-center gap-1.5"><select aria-label="选择会话" value={conversation?.id || ""} onChange={(event) => onSelectConversation(event.target.value)} disabled={!conversations.length} className="h-8 max-w-[220px] rounded-lg border border-[var(--border)] bg-white px-2 text-[9px]"><option value="">{conversations.length ? "选择历史会话" : "暂无会话"}</option>{conversations.map((item) => <option key={item.id} value={item.id}>{item.status === "archived" ? "[已归档] " : ""}{item.title}</option>)}</select><button aria-label="新建会话" onClick={onNewConversation} disabled={!customer} className="action-button action-button-light h-8">+ 新建</button><button aria-label="归档当前会话" onClick={archiveCurrent} disabled={!conversation || conversation.status === "archived"} className="action-button action-button-ghost h-8 disabled:opacity-40">归档</button></div>
    </div>
    {(status.data?.test_mode || modelUnavailable) && <div className={`border-b px-4 py-1.5 text-[9px] ${modelUnavailable ? "border-[#E7C8C4] bg-[#FFF7F6] text-[#9A463D]" : "border-[var(--gold)]/20 bg-[var(--gold-soft)] text-[var(--gold-deep)]"}`}>{modelUnavailable ? "大模型服务尚未配置" : "测试模型模式：用于流程验证，不代表真实模型回复质量"}</div>}
    <div className="chat-scroll min-h-0 flex-1 overflow-y-auto bg-[#FCFBF9] px-5 py-4">
      {conversationsLoading ? <div className="animate-pulse text-xs text-[var(--text-muted)]">正在加载会话…</div> : conversationsError ? <div className="text-center text-xs text-[#9A463D]">{conversationsError.message}<button onClick={onRetryConversations} className="ml-2 underline">重试</button></div> : !conversation ? <div className="grid h-full place-items-center text-xs text-[var(--text-muted)]">{customer ? "请新建或选择会话" : "请先选择客户"}</div> : messagesQuery.isPending ? <div className="animate-pulse text-xs text-[var(--text-muted)]">正在加载消息…</div> : !messages.length ? <div className="grid h-full place-items-center text-xs text-[var(--text-muted)]">请先保存一条客户消息</div> : <div className="space-y-4">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={endRef} /></div>}
    </div>
    {(generating || currentGeneration) && <div className="chat-scroll max-h-[310px] shrink-0 overflow-y-auto border-t border-[var(--border)] bg-white p-3.5">
      {generating ? <div className="flex items-center gap-2 rounded-xl bg-[var(--gold-soft)] p-3 text-[10px] text-[var(--gold-deep)]"><span className="h-2 w-2 animate-pulse rounded-full bg-[var(--gold)]" />{progress}</div> : result && currentGeneration ? <div className="rounded-xl border border-[var(--gold)]/25 bg-[var(--gold-soft)]/45 p-3">
        <div className="flex items-center justify-between"><p className="text-[10px] font-semibold text-[var(--gold-deep)]">推荐回复 · 生成置信度 {Math.round(result.confidence * 100)}%</p><span className="text-[8px] text-[var(--text-light)]">配置 v{currentGeneration.config_version}</span></div>
        {result.need_human && <div className="mt-2 rounded-lg border border-[#D8A39C] bg-[#FFF7F6] px-3 py-2 text-[10px] text-[#8C3D35]"><strong>建议人工确认</strong>：{result.human_reason}</div>}
        <textarea aria-label="编辑推荐回复" value={replyValue} onChange={(event) => setEditedReply(event.target.value)} className="mt-2 min-h-[82px] w-full resize-y rounded-lg border border-[var(--border)] bg-white p-2.5 text-[11px] leading-[1.65] outline-none focus:border-[var(--gold)]" />
        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]"><Info label="客户意图" value={result.customer_intent} /><Info label="客户情绪" value={result.customer_sentiment} /><Info label="推荐策略" value={result.recommended_strategy} /><Info label="下一步动作" value={result.next_action} /></div>
        {!!result.risk_flags.length && <div className="mt-2 flex flex-wrap gap-1">{result.risk_flags.map((flag) => <span key={flag} className="rounded-full border border-[#E7C8C4] bg-white px-2 py-0.5 text-[8px] text-[#8C3D35]">{flag}</span>)}</div>}
        {!!currentGeneration.sources.length && <details className="mt-2 rounded-lg border border-[var(--border)] bg-white p-2"><summary className="cursor-pointer text-[9px] font-medium text-[var(--navy)]">引用资料（{currentGeneration.sources.filter((item) => item.used_in_reply).length}）</summary><div className="mt-2 space-y-2">{currentGeneration.sources.filter((item) => item.used_in_reply).map((source) => <div key={source.citation_key} className="rounded bg-[var(--surface-muted)] p-2 text-[8px] leading-4"><p className="font-medium text-[var(--gold-deep)]">[{source.citation_key}] {source.citation_label} · 相关度 {Math.round(source.retrieval_score * 100)}%</p><p className="mt-1 text-[var(--text-muted)]">{source.content_snapshot}</p></div>)}</div></details>}
        {!!currentGeneration.champion_sources?.length && <details className="mt-2 rounded-lg border border-[var(--gold)]/25 bg-white p-2"><summary className="cursor-pointer text-[9px] font-medium text-[var(--navy)]">参考销冠经验（{currentGeneration.champion_sources.length}）</summary><div className="mt-2 space-y-2">{currentGeneration.champion_sources.map((source) => <div key={source.strategy_key} className="rounded bg-[var(--gold-soft)]/50 p-2 text-[8px] leading-4"><p className="font-medium text-[var(--gold-deep)]">{source.strategy_key} · {source.title_snapshot} · 匹配 {Math.round(source.retrieval_score * 100)}%</p><p className="mt-1 text-[var(--text-muted)]">推荐策略：{source.strategy_snapshot}</p><p className="mt-1 text-[var(--text-light)]">仅供内部销售参考，不作为企业事实引用。</p><div className="mt-1 flex gap-2"><button onClick={() => void sendFeedback("helpful")} className="text-[8px] text-[var(--gold-deep)]">有帮助</button><button onClick={() => void sendFeedback("not_helpful")} className="text-[8px] text-[var(--text-muted)]">没有帮助</button></div></div>)}</div></details>}
        {result.need_human && <label className="mt-2 flex items-center gap-2 text-[9px] text-[#8C3D35]"><input type="checkbox" checked={humanConfirmed} onChange={(event) => setHumanConfirmed(event.target.checked)} />我已完成必要的人工审核</label>}
        <div className="mt-2 flex flex-wrap justify-end gap-1.5"><button onClick={() => void sendFeedback("helpful")} className="action-button action-button-ghost">赞</button><button onClick={() => void sendFeedback("not_helpful")} className="action-button action-button-ghost">踩</button><button onClick={() => void generate("shorter")} className="action-button action-button-ghost">缩短</button><button onClick={() => void generate("colloquial")} className="action-button action-button-ghost">更口语</button><button onClick={() => void generate("conversion")} className="action-button action-button-ghost">增强销转</button><button onClick={() => void copyReply()} className="action-button action-button-light">复制</button><button onClick={() => void saveReply()} disabled={saveGeneration.isPending || (result.need_human && !humanConfirmed)} className="action-button action-button-gold disabled:opacity-40">{saveGeneration.isPending ? "保存中…" : "保存到会话"}</button></div>
      </div> : null}
    </div>}
    <div className="shrink-0 border-t border-[var(--border)] bg-white p-3.5"><div className="rounded-xl border border-[var(--border-strong)] bg-[#FDFCFB] p-2.5 focus-within:border-[var(--champagne)]"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveCustomerMessage(); } }} disabled={!conversation || conversation.status === "archived"} placeholder={conversation?.status === "archived" ? "该会话已归档" : "粘贴客户原话，Enter 保存，Shift+Enter 换行…"} className="h-[46px] w-full resize-none bg-transparent px-1 text-[11px] leading-[1.55] outline-none" /><div className="mt-2 flex items-center justify-between gap-2"><button onClick={paste} disabled={!conversation} className="action-button action-button-ghost"><Icon name="clipboard" />粘贴消息</button><div className="flex items-center gap-1.5"><button onClick={saveCustomerMessage} disabled={!draft.trim() || !conversation || createMessage.isPending} className="action-button action-button-navy disabled:opacity-40"><Icon name="send" />保存客户消息</button><button onClick={() => void generate()} disabled={!customer || !conversation || !lastCustomerMessage || generating || modelUnavailable} title={!customer ? "请先选择客户" : !conversation ? "请先创建或选择会话" : !lastCustomerMessage ? "请先保存一条客户消息" : undefined} className="action-button action-button-gold disabled:opacity-40"><Icon name="wand" />{generating ? "生成中…" : "生成回复"}</button></div></div></div></div>
  </section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-white p-2"><p className="text-[8px] text-[var(--text-light)]">{label}</p><p className="mt-1 leading-4 text-[var(--text)]">{value}</p></div>;
}
