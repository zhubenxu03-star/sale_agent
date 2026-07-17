import type { Customer } from "@/types/api";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

const empty = "暂无";
function displayCollection(value: Customer["core_needs"]): string {
  if (Array.isArray(value)) return value.length ? value.join("、") : empty;
  if (value && typeof value === "object") return Object.values(value).join("、") || empty;
  return empty;
}
function money(value: string | number | null): string {
  if (value === null || value === "") return empty;
  return `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

export function CustomerPanel({ customer, loading, error, onRetry, onEdit, onDelete }: { customer?: Customer; loading: boolean; error?: Error | null; onRetry: () => void; onEdit: () => void; onDelete: () => void }) {
  if (loading) return <section className="panel-card overflow-hidden"><PanelHeader title="客户资料" icon="customers" /><div className="space-y-3 p-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-8 animate-pulse rounded-lg bg-[var(--surface-muted)]" />)}</div></section>;
  if (error) return <section className="panel-card overflow-hidden"><PanelHeader title="客户资料" icon="customers" /><div className="flex h-[calc(100%-48px)] flex-col items-center justify-center p-5 text-center"><p className="text-[10px] text-[#9A463D]">客户资料加载失败</p><button onClick={onRetry} className="mt-2 text-[10px] text-[var(--gold-deep)] hover:underline">重新加载</button></div></section>;
  if (!customer) return <section className="panel-card overflow-hidden"><PanelHeader title="客户资料" icon="customers" /><div className="flex h-[calc(100%-48px)] flex-col items-center justify-center p-5 text-center"><Icon name="customers" className="h-7 w-7 text-[var(--champagne)]" /><p className="mt-2 text-[10px] font-medium text-[var(--navy)]">暂未选择客户</p><p className="mt-1 text-[9px] text-[var(--text-light)]">请选择或新建客户后查看资料</p></div></section>;

  const details = [
    ["行业", customer.industry || empty], ["企业规模", customer.company_size || empty],
    ["地区", customer.region || empty], ["客户来源", customer.source || empty],
    ["销售阶段", customer.stage || empty], ["预计金额", money(customer.expected_amount)],
    ["预计成交", customer.expected_close_date || empty], ["成交概率", customer.deal_probability === null ? empty : `${customer.deal_probability}%`],
  ];
  return <section className="panel-card flex min-h-0 flex-col overflow-hidden"><PanelHeader title="客户资料" icon="customers" /><div className="chat-scroll min-h-0 flex-1 overflow-y-auto p-3.5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--navy)] text-[13px] font-semibold text-white">{customer.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h3 className="text-[13px] font-semibold text-[var(--navy)]">{customer.name}</h3><p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{customer.company_name || empty}</p></div><div className="flex gap-1"><button onClick={onEdit} aria-label="编辑客户" className="rounded-md border border-[var(--border)] px-2 py-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--navy)]">编辑</button><button onClick={onDelete} aria-label="删除客户" className="rounded-md border border-[#EAD8D4] px-2 py-1 text-[9px] text-[#9A554B] hover:bg-[#FFF7F6]">删除</button></div></div></div></div>
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-[var(--border)] py-3">{details.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[8px] text-[var(--text-light)]">{label}</dt><dd className="mt-0.5 truncate text-[9px] font-medium text-[var(--text)]">{value}</dd></div>)}</dl>
    <div className="mt-3 space-y-2">{[["预算区间", `${money(customer.budget_min)} – ${money(customer.budget_max)}`], ["核心需求", displayCollection(customer.core_needs)], ["当前痛点", displayCollection(customer.pain_points)], ["客户异议", displayCollection(customer.objections)], ["备注", customer.notes || empty]].map(([label, value]) => <div key={label} className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-2"><p className="text-[8px] text-[var(--text-light)]">{label}</p><p className="mt-1 text-[9px] leading-4 text-[var(--text)]">{value}</p></div>)}</div>
  </div></section>;
}
