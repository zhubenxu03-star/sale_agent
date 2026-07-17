import type { Metric } from "@/types";

const toneStyle = {
  navy: "bg-[var(--navy)] text-white",
  gold: "bg-[var(--gold-soft)] text-[var(--gold-deep)]",
  neutral: "bg-[#F1EEE8] text-[var(--navy)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
};

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="metric-card panel-card group relative flex min-h-[104px] items-center justify-between overflow-hidden px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-muted)]">{metric.label}</span>
          <span className="h-1 w-1 rounded-full bg-[var(--champagne)]" />
        </div>
        <div className="mt-2.5 flex items-end gap-2">
          <p className="truncate text-[22px] font-semibold tracking-[-0.02em] text-[var(--navy)]">{metric.value}</p>
          {metric.label === "意向评分" && <span className="pb-1 text-[10px] text-[var(--text-muted)]">/ 100</span>}
        </div>
        <p className={`mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[10px] ${toneStyle[metric.tone]}`}>{metric.helper}</p>
      </div>
      {metric.progress !== undefined ? (
        <div className="relative grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--gold) ${metric.progress * 3.6}deg, #EEEAE3 0deg)` }}>
          <div className="grid h-[48px] w-[48px] place-items-center rounded-full bg-white text-[11px] font-semibold text-[var(--navy)]">{metric.progress}%</div>
        </div>
      ) : (
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneStyle[metric.tone]}`}>
          <span className="h-2 w-2 rounded-full bg-current opacity-70 shadow-[0_0_0_5px_currentColor] [box-shadow:0_0_0_5px_color-mix(in_srgb,currentColor_12%,transparent)]" />
        </div>
      )}
    </article>
  );
}
