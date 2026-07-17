"use client";

import { useEffect } from "react";

export function ConfirmDialog({ open, title, description, pending, onClose, onConfirm }: { open: boolean; title: string; description: string; pending?: boolean; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  return <dialog open onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="confirm-title" className="fixed inset-0 z-[90] m-auto w-[420px] rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl backdrop:bg-[rgba(10,24,40,0.42)]"><h2 id="confirm-title" className="text-base font-semibold text-[var(--navy)]">{title}</h2><p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{description}</p><div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs">取消</button><button onClick={onConfirm} disabled={pending} className="h-9 rounded-lg bg-[#8E4D44] px-4 text-xs text-white disabled:opacity-50">{pending ? "处理中…" : "确认删除"}</button></div></dialog>;
}
