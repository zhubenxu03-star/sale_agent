import type { Metric } from "@/types";

const toneStyle = {
  navy: "border-[var(--navy)]/15 bg-[var(--navy-soft)] text-[var(--navy)]",
  gold: "border-[var(--gold)]/20 bg-[var(--gold-soft)] text-[var(--gold-deep)]",
  neutral: "border-[var(--champagne)]/40 bg-[#F3F0EA] text-[var(--navy)]",
  success: "border-[var(--success)]/15 bg-[var(--success-soft)] text-[var(--success)]",
};

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="metric-card panel-card relative min-h-[78px] overflow-hidden px-4 py-3">
      <p className="text-[11px] font-medium tracking-[0.06em] text-[var(--text-muted)]">{metric.label}</p>
      <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-lg font-semibold tracking-[-0.01em] text-[var(--navy)]" title={metric.value}>{metric.value}</p>
        {metric.progress !== undefined && (
          <span className="shrink-0 text-xs font-semibold text-[var(--gold-deep)]">{metric.progress}%</span>
        )}
      </div>
      <p className={`mt-1 inline-flex max-w-full truncate rounded-md border px-2 py-0.5 text-[10px] ${toneStyle[metric.tone]}`} title={metric.helper}>{metric.helper}</p>
    </article>
  );
}
