import { championTips } from "@/data/mockData";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

export function ChampionPanel() {
  return (
    <section className="panel-card min-h-0 overflow-hidden">
      <PanelHeader title="销冠知识库" icon="crown" action="换一批" count={championTips.length} />
      <div className="space-y-2 p-3">
        {championTips.map((tip, index) => (
          <article key={tip.title} className="rounded-[10px] border border-[var(--border)] bg-[#FDFCFB] p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-[var(--gold-soft)] text-[var(--gold-deep)]"><Icon name={index === 0 ? "crown" : "arrow"} className="h-3 w-3" /></span>
              <h3 className="min-w-0 flex-1 truncate text-[10px] font-semibold text-[var(--navy)]">{tip.title}</h3>
              <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[8px] text-[var(--text-muted)]">{tip.tag}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[9px] leading-[1.55] text-[var(--text-muted)]">{tip.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
