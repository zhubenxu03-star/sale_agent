"use client";

import { useEffect, useState } from "react";
import type { KnowledgeBase } from "@/types/knowledge";

export function KnowledgeBaseDialog({
  open,
  item,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item?: KnowledgeBase;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <dialog
      open
      aria-labelledby="knowledge-base-dialog-title"
      className="fixed inset-0 z-[90] m-auto w-[480px] rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl backdrop:bg-[rgba(10,24,40,.4)]"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await onSubmit({
            name: name.trim(),
            description: description.trim() || undefined,
          });
        }}
      >
        <h2
          id="knowledge-base-dialog-title"
          className="text-base font-semibold text-[var(--navy)]"
        >
          {item ? "编辑知识库" : "新建知识库"}
        </h2>
        <label
          htmlFor="knowledge-base-name"
          className="mb-2 mt-5 block text-xs font-medium text-[var(--navy)]"
        >
          知识库名称
        </label>
        <input
          id="knowledge-base-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10 w-full rounded-xl border border-[var(--border-strong)] px-3 text-xs outline-none focus:border-[var(--champagne)]"
        />
        <label
          htmlFor="knowledge-base-description"
          className="mb-2 mt-4 block text-xs font-medium text-[var(--navy)]"
        >
          说明
        </label>
        <textarea
          id="knowledge-base-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-24 w-full resize-y rounded-xl border border-[var(--border-strong)] p-3 text-xs outline-none focus:border-[var(--champagne)]"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="h-9 rounded-lg bg-[var(--navy)] px-4 text-xs text-white disabled:opacity-40"
          >
            {pending ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
