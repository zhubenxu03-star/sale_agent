import type { IconName } from "@/types";
import { Icon } from "./Icon";

interface PanelHeaderProps {
  title: string;
  icon: IconName;
  action?: string;
  count?: number;
}

export function PanelHeader({ title, icon, action, count }: PanelHeaderProps) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="h-4 w-4 text-[var(--gold)]" />
        <h2 className="text-[13px] font-semibold text-[var(--navy)]">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">{count}</span>}
      </div>
      {action && <button className="text-[10px] text-[var(--text-muted)] transition hover:text-[var(--gold-deep)]">{action}</button>}
    </div>
  );
}
