"use client";

import { useState } from "react";
import { messages, suggestedReply } from "@/data/mockData";
import { Icon } from "./Icon";

export function ChatPanel() {
  const [draft, setDraft] = useState("");
  const [insight, setInsight] = useState("客户正在索要同类案例，核心顾虑是投入回报与决策风险。");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const pasteMessage = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setDraft(text || "客户希望先看同行业案例，再安排老板一起评估投入产出。 ");
      showToast("已粘贴剪贴板内容");
    } catch {
      setDraft("客户希望先看同行业案例，再安排老板一起评估投入产出。");
      showToast("已填入演示消息");
    }
  };

  const analyzeCustomer = () => {
    setInsight("高意向信号：认可实施周期并主动询问案例；当前阻力集中在 ROI 证明，建议以同规模案例推动决策人会议。");
    showToast("客户意向分析已更新");
  };

  const generateReply = () => {
    setDraft(suggestedReply);
    setCopied(false);
    showToast("已生成建议回复");
  };

  const copyReply = async () => {
    const content = draft || suggestedReply;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    showToast("回复已复制");
  };

  return (
    <section className="panel-card relative flex min-h-0 flex-col overflow-hidden">
      {toast && <div className="absolute left-1/2 top-14 z-20 -translate-x-1/2 rounded-full bg-[var(--navy)] px-3 py-1.5 text-[10px] text-white shadow-lg">{toast}</div>}
      <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
        <div className="flex items-center gap-3">
          <div className="relative grid h-9 w-9 place-items-center rounded-full bg-[var(--navy)] text-xs font-semibold text-white">
            周
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#74A486]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--navy)]">周明远</h2>
              <span className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">云启科技</span>
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">当前会话 · 方案评估</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" aria-label="搜索会话"><Icon name="search" className="h-4 w-4" /></button>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]" aria-label="更多"><Icon name="more" className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto bg-[#FCFBF9] px-5 py-4">
        <div className="mb-4 flex items-center gap-3 text-[9px] text-[var(--text-light)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          今天 10:24
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-2.5 ${message.role === "agent" ? "flex-row-reverse" : ""}`}>
              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-medium ${message.role === "agent" ? "bg-[var(--champagne)] text-[var(--navy)]" : "bg-[var(--navy)] text-white"}`}>
                {message.role === "agent" ? "李" : "周"}
              </div>
              <div className={`max-w-[76%] ${message.role === "agent" ? "items-end" : "items-start"} flex flex-col`}>
                <div className="mb-1 flex items-center gap-2 px-1 text-[9px] text-[var(--text-light)]">
                  <span>{message.sender}</span><span>{message.time}</span>
                </div>
                <div className={`rounded-[13px] px-3.5 py-2.5 text-[12px] leading-[1.65] ${message.role === "agent" ? "rounded-tr-[4px] bg-[var(--navy)] text-white/90" : "rounded-tl-[4px] border border-[var(--border)] bg-white text-[var(--text)] shadow-[0_3px_10px_rgba(24,42,70,0.03)]"}`}>
                  {message.content}
                </div>
                {message.tags && (
                  <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                    {message.tags.map((tag) => <span key={tag} className="flex items-center gap-1 rounded-md bg-[var(--gold-soft)] px-2 py-1 text-[9px] text-[var(--gold-deep)]"><Icon name="link" className="h-2.5 w-2.5" />{tag}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2 rounded-xl border border-[var(--gold)]/30 bg-[var(--gold-soft)]/60 px-3 py-2.5">
          <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gold)]" />
          <div>
            <p className="text-[10px] font-semibold text-[var(--gold-deep)]">AI 实时洞察</p>
            <p className="mt-1 text-[10px] leading-4 text-[var(--text-muted)]">{insight}</p>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] bg-white p-3.5">
        <div className="rounded-xl border border-[var(--border-strong)] bg-[#FDFCFB] p-2.5 transition focus-within:border-[var(--champagne)] focus-within:shadow-[0_0_0_3px_rgba(216,208,193,0.18)]">
          <textarea
            aria-label="客户消息或建议回复"
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setCopied(false); }}
            placeholder="粘贴客户消息，或让 AI 生成建议回复…"
            className="h-[46px] w-full resize-none bg-transparent px-1 text-[11px] leading-[1.55] text-[var(--text)] outline-none placeholder:text-[var(--text-light)]"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button onClick={pasteMessage} className="action-button action-button-ghost"><Icon name="clipboard" />粘贴消息</button>
            <div className="flex items-center gap-1.5">
              <button onClick={analyzeCustomer} className="action-button action-button-light"><Icon name="brain" />分析客户</button>
              <button onClick={generateReply} className="action-button action-button-gold"><Icon name="wand" />生成回复</button>
              <button onClick={copyReply} className="action-button action-button-navy"><Icon name={copied ? "check" : "copy"} />{copied ? "已复制" : "一键复制"}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
