"use client";

import { useEffect, useState } from "react";
import { authInputClass } from "@/components/auth/AuthShell";

export function ConversationDialog({ open, pending, onClose, onSubmit }: { open: boolean; pending: boolean; onClose: () => void; onSubmit: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const close = () => { setTitle(""); onClose(); };
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  return <dialog open onCancel={(event) => { event.preventDefault(); close(); }} aria-labelledby="conversation-dialog-title" className="fixed inset-0 z-[85] m-auto w-[440px] rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl backdrop:bg-[rgba(10,24,40,0.42)]"><form onSubmit={async (event) => { event.preventDefault(); if (title.trim()) { await onSubmit(title.trim()); setTitle(""); } }}><h2 id="conversation-dialog-title" className="text-base font-semibold text-[var(--navy)]">新建会话</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">会话将关联当前选中的客户</p><label htmlFor="conversation-title" className="mb-2 mt-5 block text-xs font-medium text-[var(--navy)]">会话标题</label><input id="conversation-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className={authInputClass} placeholder="例如：首次需求沟通" /><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={close} className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs">取消</button><button type="submit" disabled={pending || !title.trim()} className="h-9 rounded-lg bg-[var(--navy)] px-4 text-xs text-white disabled:opacity-50">{pending ? "创建中…" : "创建会话"}</button></div></form></dialog>;
}
