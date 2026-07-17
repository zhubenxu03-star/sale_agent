import { navItems, recentCustomers } from "@/data/mockData";
import { Icon } from "./Icon";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col bg-[var(--navy)] text-white shadow-[8px_0_28px_rgba(12,30,52,0.08)]">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-[var(--gold)] text-white shadow-[0_6px_18px_rgba(185,138,82,0.25)]">
          <Icon name="sparkles" className="h-[19px] w-[19px]" />
        </div>
        <div>
          <p className="text-[15px] font-semibold tracking-[0.08em]">智销 AI</p>
          <p className="mt-0.5 text-[10px] tracking-[0.18em] text-white/45">SALES COPILOT</p>
        </div>
      </div>

      <nav className="px-3 pt-5" aria-label="主导航">
        <p className="mb-2 px-3 text-[10px] font-medium tracking-[0.18em] text-white/35">工作空间</p>
        <div className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] transition ${
                item.active
                  ? "bg-white/[0.11] font-medium text-white shadow-[inset_2px_0_0_var(--gold)]"
                  : "text-white/62 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon name={item.icon} className={`h-[18px] w-[18px] ${item.active ? "text-[var(--champagne)]" : "text-white/45"}`} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-5 my-5 h-px bg-white/8" />

      <div className="min-h-0 flex-1 px-3">
        <div className="mb-2 flex items-center justify-between px-3">
          <p className="text-[10px] font-medium tracking-[0.18em] text-white/35">最近会话</p>
          <span className="text-lg leading-none text-white/35">+</span>
        </div>
        <div className="space-y-1">
          {recentCustomers.map((customer) => (
            <button
              key={customer.name}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.06] ${customer.active ? "bg-white/[0.05]" : ""}`}
            >
              <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--champagne)]/15 text-[11px] font-medium text-[var(--champagne)]">
                {customer.name.slice(0, 1)}
                {customer.active && <i className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-[var(--navy)] bg-[#74A486]" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] text-white/78">{customer.name}</span>
                <span className="block truncate text-[10px] text-white/35">{customer.company}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="m-3 flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.045] p-3">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#D8D0C1] to-[#9B8D7B] text-xs font-semibold text-[var(--navy)]">李</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">李想</p>
          <p className="mt-0.5 truncate text-[10px] text-white/38">企业销售顾问</p>
        </div>
        <Icon name="more" className="h-4 w-4 text-white/35" />
      </div>
    </aside>
  );
}
