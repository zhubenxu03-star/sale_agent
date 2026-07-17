import type { DocumentStatus, ProcessingStage } from "@/types/knowledge";

const statusLabels: Record<DocumentStatus, string> = {
  uploaded: "等待处理",
  processing: "处理中",
  ready: "已完成",
  failed: "处理失败",
  disabled: "已停用",
};

const stageLabels: Record<ProcessingStage, string> = {
  waiting: "等待处理",
  parsing: "正在解析",
  chunking: "正在切片",
  embedding: "正在生成向量",
  saving: "正在保存",
  completed: "处理完成",
  failed: "处理失败",
};

export function StatusBadge({
  status,
  stage,
}: {
  status: DocumentStatus;
  stage?: ProcessingStage;
}) {
  const tone =
    status === "ready"
      ? "border-[#CFE0D4] bg-[var(--success-soft)] text-[var(--success)]"
      : status === "failed"
        ? "border-[#E7C8C4] bg-[#FFF7F6] text-[#9A463D]"
        : status === "disabled"
          ? "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)]"
          : "border-[#E8D6BF] bg-[var(--gold-soft)] text-[var(--gold-deep)]";
  const icon =
    status === "ready"
      ? "✓"
      : status === "failed"
        ? "!"
        : status === "disabled"
          ? "—"
          : "↻";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] ${tone}`}
    >
      <span aria-hidden>{icon}</span>
      {status === "processing" && stage
        ? stageLabels[stage]
        : statusLabels[status]}
    </span>
  );
}

export { stageLabels, statusLabels };
