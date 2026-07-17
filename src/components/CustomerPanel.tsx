import { customerProfile } from "@/data/mockData";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

export function CustomerPanel() {
  const details = [
    ["预算范围", customerProfile.budget],
    ["决策角色", customerProfile.decisionRole],
    ["客户来源", customerProfile.source],
  ];

  return (
    <section className="panel-card overflow-hidden">
      <PanelHeader title="客户资料" icon="customers" action="查看详情" />
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--navy)] text-[13px] font-semibold text-white">周</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div><h3 className="text-[13px] font-semibold text-[var(--navy)]">{customerProfile.name}</h3><p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{customerProfile.title}</p></div>
              <span className="rounded-md bg-[var(--success-soft)] px-2 py-1 text-[9px] font-medium text-[var(--success)]">高意向</span>
            </div>
            <p className="mt-2 truncate text-[10px] text-[var(--text)]">{customerProfile.company}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-3 border-y border-[var(--border)] py-2 text-[9px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1"><Icon name="phone" className="h-3 w-3" />{customerProfile.phone}</span>
          <span className="flex items-center gap-1"><Icon name="location" className="h-3 w-3" />{customerProfile.location}</span>
        </div>
        <dl className="mt-2.5 grid grid-cols-3 gap-2">
          {details.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[9px] text-[var(--text-light)]">{label}</dt><dd className="mt-1 truncate text-[10px] font-medium text-[var(--text)]">{value}</dd></div>)}
        </dl>
        <div className="mt-2.5 rounded-lg bg-[var(--surface-muted)] px-2.5 py-2">
          <p className="text-[9px] text-[var(--text-light)]">核心需求</p>
          <p className="mt-1 truncate text-[10px] text-[var(--text)]">{customerProfile.demand}</p>
        </div>
      </div>
    </section>
  );
}
