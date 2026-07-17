"use client";

import { useKnowledgeChunks } from "@/hooks/use-knowledge";
import type { KnowledgeDocument } from "@/types/knowledge";
import { StatusBadge, stageLabels } from "./StatusBadge";

export function DocumentDetailDrawer({
  document,
  onClose,
}: {
  document?: KnowledgeDocument;
  onClose: () => void;
}) {
  if (!document) return null;
  const fields = [
    ["原文件名", document.original_filename],
    ["文件类型", document.file_extension.toUpperCase()],
    ["大小", `${(document.size_bytes / 1024).toFixed(1)} KB`],
    ["SHA-256", document.sha256],
    ["处理阶段", stageLabels[document.processing_stage]],
    ["进度", `${document.progress}%`],
    ["知识片段", `${document.chunk_count}`],
    ["上传人", document.uploaded_by_name || "暂无"],
    ["上传时间", new Date(document.created_at).toLocaleString("zh-CN")],
    [
      "完成时间",
      document.processed_at
        ? new Date(document.processed_at).toLocaleString("zh-CN")
        : "暂无",
    ],
  ];
  return (
    <div
      className="fixed inset-0 z-[80] bg-[rgba(10,24,40,.35)]"
      onClick={onClose}
    >
      <aside
        aria-label="文件详情"
        className="ml-auto h-full w-[480px] overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--navy)]">
              文件详情
            </h2>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              仅展示安全业务信息，不展示内部存储路径
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭文件详情"
            className="text-xl text-[var(--text-muted)]"
          >
            ×
          </button>
        </div>
        <div className="mt-5">
          <StatusBadge
            status={document.status}
            stage={document.processing_stage}
          />
        </div>
        <dl className="mt-5 space-y-3">
          {fields.map(([label, value]) => (
            <div key={label} className="border-b border-[var(--border)] pb-3">
              <dt className="text-[9px] text-[var(--text-light)]">{label}</dt>
              <dd className="mt-1 break-all text-xs text-[var(--text)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {document.error_message && (
          <div className="mt-4 rounded-xl border border-[#E7C8C4] bg-[#FFF7F6] p-3">
            <p className="text-[9px] font-medium text-[#9A463D]">
              {document.error_code}
            </p>
            <p className="mt-1 text-[10px] text-[#9A463D]">
              {document.error_message}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

export function ChunkDrawer({
  document,
  page,
  onPage,
  onClose,
}: {
  document?: KnowledgeDocument;
  page: number;
  onPage: (page: number) => void;
  onClose: () => void;
}) {
  const chunks = useKnowledgeChunks(document?.id, page);
  if (!document) return null;
  return (
    <div
      className="fixed inset-0 z-[80] bg-[rgba(10,24,40,.35)]"
      onClick={onClose}
    >
      <aside
        aria-label="切片查看器"
        className="ml-auto h-full w-[680px] overflow-y-auto bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--navy)]">
              切片查看器
            </h2>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              {document.original_filename}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭切片查看器"
            className="text-xl text-[var(--text-muted)]"
          >
            ×
          </button>
        </div>
        {chunks.isPending ? (
          <div className="mt-6 h-40 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
        ) : chunks.isError ? (
          <div className="mt-6 rounded-xl border border-[#E7C8C4] bg-[#FFF7F6] p-4 text-xs text-[#9A463D]">
            {chunks.error.message}
            <button onClick={() => chunks.refetch()} className="ml-2 underline">
              重试
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {chunks.data?.items.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-[var(--border)] p-4"
              >
                <div className="flex flex-wrap gap-2 text-[9px] text-[var(--text-muted)]">
                  <span>#{item.chunk_index + 1}</span>
                  <span>{item.token_count} Token</span>
                  {item.page_number && <span>第{item.page_number}页</span>}
                  {item.sheet_name && <span>工作表：{item.sheet_name}</span>}
                  {item.row_start && (
                    <span>
                      第{item.row_start}
                      {item.row_end && item.row_end !== item.row_start
                        ? `-${item.row_end}`
                        : ""}
                      行
                    </span>
                  )}
                  {item.section_title && (
                    <span>章节：{item.section_title}</span>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-[var(--text)]">
                  {item.content}
                </p>
              </article>
            ))}
            <div className="flex items-center justify-between pt-2 text-[10px]">
              <button
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
                className="rounded border border-[var(--border)] px-3 py-1.5 disabled:opacity-35"
              >
                上一页
              </button>
              <span>
                第 {page} / {chunks.data?.total_pages || 1} 页
              </span>
              <button
                disabled={page >= (chunks.data?.total_pages || 1)}
                onClick={() => onPage(page + 1)}
                className="rounded border border-[var(--border)] px-3 py-1.5 disabled:opacity-35"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
