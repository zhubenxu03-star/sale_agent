"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useArchiveConversation, useCreateMessage, useMessages } from "@/hooks/useConversations";
import { buildLocalMockReply } from "@/lib/mockReply";
import { useToast } from "@/components/providers/AppProviders";
import type { Conversation, Customer, Message } from "@/types/api";

function time(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function MessageBubble({ message }: { message: Message }) {
  if (message.sender_type === "system") return <div className="mx-auto w-fit rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[9px] text-[var(--text-muted)]">{message.content}</div>;
  const outgoing = message.sender_type === "sales" || message.sender_type === "assistant";
  const assistant = message.sender_type === "assistant";
  const names = { customer: "客户", sales: "我", assistant: "本地模拟助手", system: "系统" };
  return <div className={`flex gap-2.5 ${outgoing ? "flex-row-reverse" : ""}`}><div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-medium ${assistant ? "bg-[var(--gold)] text-white" : outgoing ? "bg-[var(--champagne)] text-[var(--navy)]" : "bg-[var(--navy)] text-white"}`}>{assistant ? "拟" : outgoing ? "我" : "客"}</div><div className={`flex max-w-[78%] flex-col ${outgoing ? "items-end" : "items-start"}`}><div className="mb-1 flex items-center gap-2 px-1 text-[9px] text-[var(--text-light)]"><span>{names[message.sender_type]}</span><span>{time(message.created_at)}</span></div><div className={`rounded-[13px] px-3.5 py-2.5 text-[12px] leading-[1.65] ${assistant ? "rounded-tr-[4px] border border-[var(--gold)]/25 bg-[var(--gold-soft)] text-[var(--text)]" : outgoing ? "rounded-tr-[4px] bg-[var(--navy)] text-white/90" : "rounded-tl-[4px] border border-[var(--border)] bg-white text-[var(--text)] shadow-[0_3px_10px_rgba(24,42,70,0.03)]"}`}>{message.content}</div>{assistant && <span className="mt-1 rounded bg-[var(--gold-soft)] px-2 py-0.5 text-[8px] text-[var(--gold-deep)]">模拟生成</span>}</div></div>;
}

export function ChatPanel({ customer, conversations, conversation, conversationsLoading, conversationsError, onRetryConversations, onSelectConversation, onNewConversation }: { customer?: Customer; conversations: Conversation[]; conversation?: Conversation; conversationsLoading: boolean; conversationsError: Error | null; onRetryConversations: () => void; onSelectConversation: (id: string) => void; onNewConversation: () => void }) {
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const messagesQuery = useMessages(conversation?.id);
  const createMessage = useCreateMessage(conversation?.id);
  const archive = useArchiveConversation(customer?.id);
  const { showToast } = useToast();
  const messages = useMemo(() => messagesQuery.data || [], [messagesQuery.data]);
  const lastCustomerMessage = [...messages].reverse().find((item) => item.sender_type === "customer")?.content || "";

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  const saveCustomerMessage = async () => {
    if (!draft.trim() || !conversation) return;
    try {
      await createMessage.mutateAsync({ sender_type: "customer", content: draft.trim() });
      setDraft(""); showToast("客户消息已保存", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "消息保存失败", "error"); }
  };
  const generate = () => {
    if (!customer || !conversation || !(draft.trim() || lastCustomerMessage)) return;
    setPreview(buildLocalMockReply(customer, draft.trim() || lastCustomerMessage));
  };
  const savePreview = async () => {
    if (!preview || !conversation) return;
    try { await createMessage.mutateAsync({ sender_type: "assistant", content: preview }); setPreview(""); showToast("模拟回复已保存到会话", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "回复保存失败", "error"); }
  };
  const paste = async () => {
    try { setDraft(await navigator.clipboard.readText()); } catch { showToast("无法读取剪贴板，请手动粘贴", "error"); }
  };
  const archiveCurrent = async () => {
    if (!conversation) return;
    try { await archive.mutateAsync(conversation.id); showToast("会话已归档", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "归档失败", "error"); }
  };

  return <section className="panel-card relative flex min-h-0 flex-col overflow-hidden"><div className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4"><div className="flex min-w-0 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--navy)] text-xs font-semibold text-white">{customer?.name.slice(0, 1) || "—"}</div><div className="min-w-0"><h2 className="truncate text-[13px] font-semibold text-[var(--navy)]">{customer?.name || "暂无客户"}</h2><p className="mt-0.5 truncate text-[9px] text-[var(--text-muted)]">{customer?.company_name || "请先选择客户"}</p></div></div><div className="flex min-w-0 items-center gap-1.5"><select aria-label="选择会话" value={conversation?.id || ""} onChange={(event) => onSelectConversation(event.target.value)} disabled={!conversations.length} className="h-8 max-w-[220px] rounded-lg border border-[var(--border)] bg-white px-2 text-[9px] text-[var(--text)] disabled:text-[var(--text-light)]"><option value="">{conversations.length ? "选择历史会话" : "暂无会话"}</option>{conversations.map((item) => <option key={item.id} value={item.id}>{item.status === "archived" ? "[已归档] " : ""}{item.title}</option>)}</select><button onClick={onNewConversation} disabled={!customer} className="action-button action-button-light h-8" aria-label="新建会话">+ 新建</button><button onClick={archiveCurrent} disabled={!conversation || conversation.status === "archived" || archive.isPending} className="action-button action-button-ghost h-8 disabled:opacity-40" aria-label="归档当前会话">归档</button></div></div>
    <div className="chat-scroll min-h-0 flex-1 overflow-y-auto bg-[#FCFBF9] px-5 py-4">{conversationsLoading ? <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className={`h-14 w-2/3 animate-pulse rounded-xl bg-[var(--surface-muted)] ${item === 2 ? "ml-auto" : ""}`} />)}</div> : conversationsError ? <div className="grid h-full place-items-center text-center"><div><p className="text-xs text-[#9A463D]">{conversationsError.message || "会话列表加载失败"}</p><button onClick={onRetryConversations} className="mt-2 text-[10px] text-[var(--gold-deep)] hover:underline">重新加载</button></div></div> : !conversation ? <div className="grid h-full place-items-center text-center"><div><Icon name="clipboard" className="mx-auto h-8 w-8 text-[var(--champagne)]" /><p className="mt-3 text-xs font-medium text-[var(--navy)]">{customer ? "还没有会话" : "请先选择客户"}</p><p className="mt-1 text-[10px] text-[var(--text-light)]">{customer ? "新建会话后即可保存真实沟通记录" : "客户数据将从企业空间安全加载"}</p></div></div> : messagesQuery.isPending ? <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className={`h-14 w-2/3 animate-pulse rounded-xl bg-[var(--surface-muted)] ${item === 2 ? "ml-auto" : ""}`} />)}</div> : messagesQuery.isError ? <div className="grid h-full place-items-center text-center"><div><p className="text-xs text-[#9A463D]">{messagesQuery.error instanceof Error ? messagesQuery.error.message : "历史消息加载失败"}</p><button onClick={() => messagesQuery.refetch()} className="mt-2 text-[10px] text-[var(--gold-deep)] hover:underline">重新加载</button></div></div> : !messages.length ? <div className="grid h-full place-items-center text-center"><div><p className="text-xs font-medium text-[var(--navy)]">暂无历史消息</p><p className="mt-1 text-[10px] text-[var(--text-light)]">粘贴客户原话并保存，开始沉淀沟通记录</p></div></div> : <div className="space-y-4">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={endRef} /></div>}</div>
    {preview && <div className="mx-3 mt-3 rounded-xl border border-[var(--gold)]/30 bg-[var(--gold-soft)]/60 p-3"><div className="flex items-center justify-between"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--gold-deep)]"><Icon name="wand" className="h-3.5 w-3.5" />本地模拟回复，尚未接入大模型</p><span className="rounded bg-white/60 px-2 py-0.5 text-[8px] text-[var(--gold-deep)]">模拟生成</span></div><p className="mt-2 text-[10px] leading-4 text-[var(--text)]">{preview}</p><div className="mt-2 flex justify-end gap-1.5"><button onClick={() => navigator.clipboard.writeText(preview)} className="action-button action-button-ghost">复制</button><button onClick={savePreview} disabled={createMessage.isPending} className="action-button action-button-gold">{createMessage.isPending ? "保存中…" : "保存到会话"}</button></div></div>}
    <div className="shrink-0 border-t border-[var(--border)] bg-white p-3.5"><div className="rounded-xl border border-[var(--border-strong)] bg-[#FDFCFB] p-2.5 focus-within:border-[var(--champagne)]"><label htmlFor="customer-message" className="sr-only">客户消息</label><textarea id="customer-message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void saveCustomerMessage(); } }} disabled={!conversation || conversation.status === "archived"} placeholder={conversation?.status === "archived" ? "该会话已归档" : "粘贴客户原话，Enter 保存，Shift+Enter 换行…"} className="h-[46px] w-full resize-none bg-transparent px-1 text-[11px] leading-[1.55] outline-none disabled:cursor-not-allowed" /><div className="mt-2 flex items-center justify-between gap-2"><button onClick={paste} disabled={!conversation} className="action-button action-button-ghost"><Icon name="clipboard" />粘贴消息</button><div className="flex items-center gap-1.5"><button disabled title="AI 功能尚未启用" className="action-button action-button-light opacity-50"><Icon name="brain" />AI分析未启用</button><button onClick={saveCustomerMessage} disabled={!draft.trim() || !conversation || conversation.status === "archived" || createMessage.isPending} className="action-button action-button-navy disabled:opacity-40"><Icon name="send" />{createMessage.isPending ? "保存中…" : "保存客户消息"}</button><button onClick={generate} disabled={!customer || !conversation || !(draft.trim() || lastCustomerMessage)} title={!conversation ? "请先创建会话" : !(draft.trim() || lastCustomerMessage) ? "需要一条客户消息" : undefined} className="action-button action-button-gold disabled:opacity-40"><Icon name="wand" />生成模拟回复</button></div></div></div></div>
  </section>;
}
