import { enterpriseKnowledge } from "@/data/mockData";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

export function KnowledgePanel() {
  return (
    <section className="panel-card min-h-0 overflow-hidden">
      <PanelHeader title="企业知识库" icon="building" action="管理知识库" count={enterpriseKnowledge.length} />
      <div className="space-y-2 p-3">
        {enterpriseKnowledge.map((item) => (
          <button key={item.title} className="group flex w-full items-center gap-2.5 rounded-[10px] border border-transparent p-1.5 text-left transition hover:border-[var(--border)] hover:bg-[var(--surface-muted)]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--navy-soft)] text-[var(--navy)]"><Icon name="knowledge" className="h-3.5 w-3.5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-medium text-[var(--text)]">{item.title}</span><span className="mt-1 block text-[9px] text-[var(--text-light)]">{item.meta}</span></span>
            <span className="text-right"><span className="block text-[10px] font-semibold text-[var(--success)]">{item.match}%</span><span className="block text-[8px] text-[var(--text-light)]">匹配</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}
