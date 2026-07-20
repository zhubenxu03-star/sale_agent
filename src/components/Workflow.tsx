import { Icon } from "./Icon";
import type { IconName } from "@/types";

const steps: Array<{ label: string; icon: IconName }> = [
  { label: "客户消息", icon: "clipboard" },
  { label: "企业知识 K", icon: "building" },
  { label: "销冠策略 S", icon: "crown" },
  { label: "模型融合", icon: "brain" },
  { label: "风险校验", icon: "link" },
  { label: "人工确认", icon: "check" },
];

export function Workflow() {
  return (
    <section className="workspace-flow panel-card flex min-h-[54px] shrink-0 items-center overflow-hidden px-4 py-2" aria-label="回复生成流程">
      <div className="mr-4 hidden shrink-0 border-r border-[var(--border)] pr-4 2xl:block">
        <h2 className="text-xs font-semibold text-[var(--navy)]">流程状态</h2>
        <p className="mt-0.5 text-[10px] text-[var(--text-light)]">双知识增强</p>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-6 items-center">
        {steps.map((step, index) => (
          <div key={step.label} className="relative flex min-w-0 items-center justify-center gap-2 px-1">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${index === steps.length - 1 ? "bg-[var(--gold)] text-white" : "bg-[var(--navy-soft)] text-[var(--navy)]"}`}>
              <Icon name={step.icon} className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-[11px] font-medium text-[var(--text)]">{step.label}</span>
            {index < steps.length - 1 && <Icon name="chevron" className="absolute -right-1 h-3 w-3 text-[var(--champagne)]" />}
          </div>
        ))}
      </div>
    </section>
  );
}
