"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useChampionSearch } from "@/hooks/use-champion";
import type { Customer } from "@/types/api";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

export function ChampionPanel({ latestCustomerMessage, customer }: { latestCustomerMessage?: string; customer?: Customer }) {
  const search = useChampionSearch();
  useEffect(() => {
    if (latestCustomerMessage?.trim()) void search.mutateAsync({ query: latestCustomerMessage, industry: customer?.industry || undefined, sales_stage: customer?.stage || undefined, top_k: 3, min_score: 0.35 });
    // Search only when the latest customer message changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestCustomerMessage]);
  const results = search.data || [];
  return <section className="panel-card overflow-hidden"><PanelHeader title="销冠知识库" icon="crown" /><div className="min-h-[92px] px-4 py-3">{search.isPending ? <p className="text-[9px] text-[var(--text-muted)]">正在匹配已批准销冠经验…</p> : results.length ? <div className="space-y-2">{results.slice(0, 2).map((item) => <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2"><div className="flex items-center justify-between"><p className="truncate text-[9px] font-semibold text-[var(--navy)]">{item.strategy_key} · {item.title}</p><span className="text-[8px] text-[var(--gold-deep)]">{Math.round(item.final_score * 100)}%</span></div><p className="mt-1 line-clamp-2 text-[8px] leading-4 text-[var(--text-muted)]">{item.strategy_summary}</p></div>)}<Link href="/champion" className="mt-1 inline-block text-[9px] text-[var(--gold-deep)]">查看销冠知识库 →</Link></div> : <div className="flex flex-col items-center justify-center text-center"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--gold-soft)] text-[var(--gold-deep)]"><Icon name="crown" className="h-4 w-4" /></span><p className="mt-1.5 text-[9px] font-medium text-[var(--navy)]">暂无已批准销冠经验</p><Link href="/champion" className="mt-1 text-[8px] text-[var(--gold-deep)]">配置知识库 →</Link></div>}</div></section>;
}
