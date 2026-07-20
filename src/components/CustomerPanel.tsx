"use client";

import { useState } from "react";
import type { Customer } from "@/types/api";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

const empty = "暂无";

function money(value: string | number | null): string {
  if (value === null || value === "") return empty;
  return `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

type Props = {
  customer?: Customer;
  loading: boolean;
  error?: Error | null;
  onRetry: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function CustomerPanel({ customer, loading, error, onRetry, onEdit, onDelete }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const header = (
    <PanelHeader
      title="客户资料"
      icon="customers"
      collapsed={collapsed}
      onToggle={() => setCollapsed((value) => !value)}
    />
  );

  if (collapsed) return <section className="panel-card shrink-0 overflow-hidden">{header}</section>;
  if (loading) return <section className="panel-card shrink-0 overflow-hidden">{header}<div className="space-y-3 p-4">{[1, 2, 3].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-[var(--surface-muted)]" />)}</div></section>;
  if (error) return <section className="panel-card shrink-0 overflow-hidden">{header}<div className="p-5 text-center"><p className="text-sm text-[#9A463D]">客户资料加载失败</p><button onClick={onRetry} className="mt-2 text-sm text-[var(--gold-deep)] hover:underline">重新加载</button></div></section>;
  if (!customer) return <section className="panel-card shrink-0 overflow-hidden">{header}<div className="flex flex-col items-center justify-center p-6 text-center"><Icon name="customers" className="h-7 w-7 text-[var(--champagne)]" /><p className="mt-2 text-sm font-medium text-[var(--navy)]">暂未选择客户</p><p className="mt-1 text-xs text-[var(--text-light)]">请选择或新建客户后查看资料</p></div></section>;

  const details = [
    ["行业", customer.industry || empty],
    ["规模", customer.company_size || empty],
    ["地区", customer.region || empty],
    ["阶段", customer.stage || empty],
    ["预计金额", money(customer.expected_amount)],
    ["来源", customer.source || empty],
  ];

  return (
    <section className="panel-card shrink-0 overflow-hidden">
      {header}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--navy)] text-base font-semibold text-white">{customer.name.slice(0, 1)}</div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-[var(--navy)]">{customer.name}</h3>
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{customer.company_name || empty}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button onClick={onEdit} aria-label="编辑客户" className="context-button">编辑</button>
            <button onClick={onDelete} aria-label="删除客户" className="context-button border-[#EAD8D4] text-[#9A554B] hover:bg-[#FFF7F6]">删除</button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--border)] pt-4">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] text-[var(--text-light)]">{label}</dt>
              <dd className="mt-1 truncate text-sm font-medium text-[var(--text)]" title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
