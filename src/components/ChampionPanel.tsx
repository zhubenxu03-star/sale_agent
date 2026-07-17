import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

export function ChampionPanel() {
  return <section className="panel-card overflow-hidden"><PanelHeader title="销冠知识库" icon="crown" /><div className="flex h-[calc(100%-48px)] min-h-[92px] flex-col items-center justify-center px-5 text-center"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--gold-soft)] text-[var(--gold-deep)]"><Icon name="crown" className="h-4 w-4" /></span><p className="mt-2 text-[10px] font-medium text-[var(--navy)]">销冠知识库尚未配置</p><p className="mt-1 text-[9px] leading-4 text-[var(--text-light)]">将在下一阶段开放聊天记录和话术导入</p></div></section>;
}
