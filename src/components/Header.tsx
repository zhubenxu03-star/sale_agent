import { Icon } from "./Icon";

export function Header() {
  return (
    <header className="fixed left-[220px] right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-[var(--navy-deep)] px-6 text-white">
      <div className="flex items-center gap-3">
        <h1 className="text-[16px] font-semibold tracking-[0.04em]">销转智能工作台</h1>
        <span className="h-4 w-px bg-white/15" />
        <span className="text-[11px] text-white/38">AI 辅助判断与沟通</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="hidden h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-[11px] text-white/60 transition hover:bg-white/10 xl:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#77A787]" />
          模型服务正常
        </button>
        <button aria-label="搜索" className="grid h-9 w-9 place-items-center rounded-lg text-white/48 transition hover:bg-white/8 hover:text-white">
          <Icon name="search" className="h-[18px] w-[18px]" />
        </button>
        <button aria-label="通知" className="relative grid h-9 w-9 place-items-center rounded-lg text-white/48 transition hover:bg-white/8 hover:text-white">
          <Icon name="bell" className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
        </button>
        <button aria-label="设置" className="grid h-9 w-9 place-items-center rounded-lg text-white/48 transition hover:bg-white/8 hover:text-white">
          <Icon name="settings" className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
