import Link from "next/link";
import { navItems } from "@/data/mockData";
import type { AuthIdentity, Customer } from "@/types/api";
import { Icon } from "./Icon";

export function Sidebar({
  identity,
  customers,
  selectedCustomerId,
  collapsed,
  activeLabel = "销转工作台",
}: {
  identity: AuthIdentity;
  customers: Customer[];
  selectedCustomerId?: string;
  collapsed: boolean;
  activeLabel?: string;
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-[var(--navy)] text-white shadow-[8px_0_28px_rgba(12,30,52,0.08)] transition-[width] ${collapsed ? "w-[72px]" : "w-[220px]"}`}
    >
      <div
        className={`flex h-16 items-center border-b border-white/10 ${collapsed ? "justify-center" : "gap-3 px-5"}`}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--gold)] text-white">
          <Icon name="sparkles" className="h-[19px] w-[19px]" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-[15px] font-semibold tracking-[0.08em]">
              智销 AI
            </p>
            <p className="mt-0.5 text-[10px] tracking-[0.18em] text-white/45">
              SALES COPILOT
            </p>
          </div>
        )}
      </div>
      <nav className="px-3 pt-5" aria-label="主导航">
        {!collapsed && (
          <p className="mb-2 px-3 text-[10px] font-medium tracking-[0.18em] text-white/35">
            工作空间
          </p>
        )}
        <div className="space-y-1">
          {navItems.map((item) => {
            const active = item.label === activeLabel;
            const content = (
              <>
                <Icon
                  name={item.icon}
                  className={`h-[18px] w-[18px] ${active ? "text-[var(--champagne)]" : "text-white/45"}`}
                />
                {!collapsed && <span>{item.label}</span>}
              </>
            );
            const className = `flex h-11 w-full items-center rounded-xl text-[13px] transition ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${active ? "bg-white/[0.11] font-medium text-white shadow-[inset_2px_0_0_var(--gold)]" : "text-white/62 hover:bg-white/[0.06] hover:text-white"}`;
            const href =
              item.label === "销转工作台"
                ? "/"
                : item.label === "知识库管理"
                  ? "/knowledge"
                  : null;
            return href ? (
              <Link
                key={item.label}
                href={href}
                title={collapsed ? item.label : undefined}
                className={className}
              >
                {content}
              </Link>
            ) : (
              <button
                key={item.label}
                title={collapsed ? item.label : undefined}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </div>
      </nav>
      {!collapsed && (
        <>
          <div className="mx-5 my-5 h-px bg-white/8" />
          <div className="min-h-0 flex-1 px-3">
            <p className="mb-2 px-3 text-[10px] tracking-[0.18em] text-white/35">
              当前客户
            </p>
            <div className="space-y-1">
              {customers.slice(0, 5).map((customer) => (
                <div
                  key={customer.id}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${customer.id === selectedCustomerId ? "bg-white/[0.08]" : ""}`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--champagne)]/15 text-[11px] text-[var(--champagne)]">
                    {customer.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-white/78">
                      {customer.name}
                    </span>
                    <span className="block truncate text-[10px] text-white/35">
                      {customer.company_name || "暂无企业"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div
        className={`m-3 flex items-center rounded-xl border border-white/8 bg-white/[0.045] p-3 ${collapsed ? "justify-center" : "gap-3"}`}
      >
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#D8D0C1] to-[#9B8D7B] text-xs font-semibold text-[var(--navy)]">
          {identity.user.name.slice(0, 1)}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{identity.user.name}</p>
            <p className="mt-0.5 truncate text-[10px] text-white/38">
              {identity.user.email}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
