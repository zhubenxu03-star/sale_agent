"use client";

import { StatusBadge, stageLabels } from "@/components/knowledge/StatusBadge";
import type { UserRole } from "@/types/api";
import type { KnowledgeDocument } from "@/types/knowledge";

function size(value: number) {
  return value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentTable({
  documents,
  loading,
  role,
  onDetail,
  onChunks,
  onAction,
  onDelete,
}: {
  documents: KnowledgeDocument[];
  loading: boolean;
  role: UserRole;
  onDetail: (item: KnowledgeDocument) => void;
  onChunks: (item: KnowledgeDocument) => void;
  onAction: (
    item: KnowledgeDocument,
    action: "reprocess" | "disable" | "enable",
  ) => void;
  onDelete: (item: KnowledgeDocument) => void;
}) {
  if (loading)
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-12 animate-pulse rounded-lg bg-[var(--surface-muted)]"
          />
        ))}
      </div>
    );
  if (!documents.length)
    return (
      <div className="grid min-h-44 place-items-center text-center">
        <div>
          <p className="text-xs font-medium text-[var(--navy)]">
            当前知识库还没有文件
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            上传企业资料后，系统将异步解析并建立向量索引
          </p>
        </div>
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[840px] border-collapse text-left text-[10px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)]/60 text-[var(--text-muted)]">
            <th className="px-3 py-2.5 font-medium">文件名称</th>
            <th className="px-3 py-2.5 font-medium">类型 / 大小</th>
            <th className="px-3 py-2.5 font-medium">状态</th>
            <th className="px-3 py-2.5 font-medium">阶段 / 进度</th>
            <th className="px-3 py-2.5 font-medium">知识片段</th>
            <th className="px-3 py-2.5 font-medium">上传人 / 时间</th>
            <th className="px-3 py-2.5 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((item) => (
            <tr
              key={item.id}
              className="border-b border-[var(--border)] last:border-0"
            >
              <td className="max-w-[220px] px-3 py-3">
                <p
                  className="truncate font-medium text-[var(--navy)]"
                  title={item.original_filename}
                >
                  {item.display_name}
                </p>
                <p className="mt-1 truncate text-[9px] text-[var(--text-light)]">
                  {item.original_filename}
                </p>
              </td>
              <td className="px-3 py-3">
                <span className="uppercase text-[var(--navy)]">
                  {item.file_extension}
                </span>
                <p className="mt-1 text-[9px] text-[var(--text-light)]">
                  {size(item.size_bytes)}
                </p>
              </td>
              <td className="px-3 py-3">
                <StatusBadge
                  status={item.status}
                  stage={item.processing_stage}
                />
              </td>
              <td className="w-[150px] px-3 py-3">
                <p className="text-[9px] text-[var(--text-muted)]">
                  {stageLabels[item.processing_stage]} · {item.progress}%
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--gold)]"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.error_message && (
                  <p
                    className="mt-1 max-w-[150px] truncate text-[9px] text-[#9A463D]"
                    title={item.error_message}
                  >
                    {item.error_message}
                  </p>
                )}
              </td>
              <td className="px-3 py-3 text-[var(--text)]">
                {item.chunk_count}
              </td>
              <td className="px-3 py-3">
                <p>{item.uploaded_by_name || "暂无"}</p>
                <p className="mt-1 text-[9px] text-[var(--text-light)]">
                  {new Date(item.created_at).toLocaleString("zh-CN")}
                </p>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => onDetail(item)}
                    className="rounded border border-[var(--border)] px-2 py-1"
                  >
                    详情
                  </button>
                  {role !== "sales" && (
                    <button
                      onClick={() => onChunks(item)}
                      disabled={!item.chunk_count}
                      className="rounded border border-[var(--border)] px-2 py-1 disabled:opacity-35"
                    >
                      切片
                    </button>
                  )}
                  <a
                    href={`/api/knowledge/documents/${item.id}/download`}
                    className="rounded border border-[var(--border)] px-2 py-1"
                  >
                    下载
                  </a>
                  {role !== "sales" && (
                    <button
                      onClick={() => onAction(item, "reprocess")}
                      className="rounded border border-[var(--border)] px-2 py-1"
                    >
                      重处理
                    </button>
                  )}
                  {role === "admin" && (
                    <button
                      onClick={() =>
                        onAction(
                          item,
                          item.status === "disabled" ? "enable" : "disable",
                        )
                      }
                      className="rounded border border-[var(--border)] px-2 py-1"
                    >
                      {item.status === "disabled" ? "启用" : "停用"}
                    </button>
                  )}
                  {role === "admin" && (
                    <button
                      onClick={() => onDelete(item)}
                      className="rounded border border-[#E7C8C4] px-2 py-1 text-[#9A463D]"
                    >
                      删除
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
