import { Icon } from "./Icon";
import type { IconName } from "@/types";

const steps: Array<{ label: string; icon: IconName }> = [
  { label: "客户消息输入", icon: "clipboard" },
  { label: "安全 BFF 转发", icon: "link" },
  { label: "保存真实会话", icon: "building" },
  { label: "本地模拟回复", icon: "wand" },
  { label: "持续沉淀记录", icon: "check" },
];

export function Workflow() {
  return <section className="panel-card flex min-h-[72px] items-center overflow-hidden px-5 py-3"><div className="mr-5 shrink-0 border-r border-[var(--border)] pr-5"><div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" /><h2 className="text-[11px] font-semibold text-[var(--navy)]">当前工作流程</h2></div><p className="mt-1 text-[9px] text-[var(--text-light)]">真实数据 · 本地模拟</p></div><div className="flex min-w-0 flex-1 items-center justify-between">{steps.map((step, index) => <div key={step.label} className="contents"><div className="flex min-w-0 items-center gap-2.5"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${index === steps.length - 1 ? "bg-[var(--gold)] text-white" : "bg-[var(--navy-soft)] text-[var(--navy)]"}`}><Icon name={step.icon} className="h-3.5 w-3.5" /></span><span className="whitespace-nowrap text-[10px] font-medium text-[var(--text)]">{step.label}</span></div>{index < steps.length - 1 && <div className="mx-2 flex min-w-4 flex-1 items-center"><span className="h-px flex-1 bg-[var(--border-strong)]" /><Icon name="chevron" className="-ml-1 h-3 w-3 text-[var(--champagne)]" /></div>}</div>)}</div></section>;
}
