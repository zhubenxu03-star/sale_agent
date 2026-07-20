import type { IconName } from "@/types";
import { Icon } from "./Icon";

interface PanelHeaderProps {
  title: string;
  icon: IconName;
  action?: string;
  count?: number;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function PanelHeader({ title, icon, action, count, collapsed, onToggle }: PanelHeaderProps) {
  return (
    <div className={`flex h-12 shrink-0 items-center justify-between px-4 ${collapsed ? "" : "border-b border-[var(--border)]"}`}>
      <div className="flex items-center gap-2">
        <Icon name={icon} className="h-4 w-4 text-[var(--gold)]" />
        <h2 className="text-sm font-semibold text-[var(--navy)]">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{count}</span>}
      </div>
      <div className="flex items-center gap-2">
        {action && <span className="text-xs text-[var(--text-muted)]">{action}</span>}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? `展开${title}` : `收起${title}`}
            aria-expanded={!collapsed}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy)]"
          >
            <Icon name="chevron" className={`h-4 w-4 transition-transform ${collapsed ? "rotate-90" : "-rotate-90"}`} />
          </button>
        )}
      </div>
    </div>
  );
}
