"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useChampionSearch } from "@/hooks/use-champion";
import type { Customer, Generation } from "@/types/api";
import { PanelHeader } from "./PanelHeader";

const typeLabels: Record<string, string> = {
  opening: "开场破冰",
  discovery: "需求挖掘",
  value_proposition: "价值塑造",
  objection_handling: "异议处理",
  follow_up: "跟进催单",
  demo_invitation: "邀约演示",
  negotiation: "商务谈判",
  closing: "促成成交",
};

type Props = {
  latestCustomerMessage?: string;
  customer?: Customer;
  generation?: Generation | null;
  onRegenerate: (strategyTitle: string) => void;
};

export function ChampionPanel({ latestCustomerMessage, customer, generation, onRegenerate }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const search = useChampionSearch();

  useEffect(() => {
    if (latestCustomerMessage?.trim() && !generation?.champion_sources?.length) {
      search.mutate({
        query: latestCustomerMessage,
        industry: customer?.industry || undefined,
        sales_stage: customer?.stage || undefined,
        top_k: 3,
        min_score: 0.35,
      });
    }
    // Search is refreshed when the active customer message changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestCustomerMessage, customer?.industry, customer?.stage, generation?.id]);

  const generationSources = generation?.champion_sources || [];
  const results = search.data || [];
  const count = generationSources.length || results.length;

  return (
    <section className="panel-card shrink-0 overflow-hidden">
      <PanelHeader
        title="销冠策略命中"
        icon="crown"
        count={count}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      {!collapsed && (
        <div className="p-4">
          {search.isPending && !generationSources.length ? (
            <div className="h-20 animate-pulse rounded-xl bg-[var(--gold-soft)]" />
          ) : generationSources.length ? (
            <div className="space-y-3">
              {generationSources.map((item) => (
                <StrategyCard
                  key={item.strategy_key}
                  title={item.title_snapshot}
                  type={item.card_type}
                  summary={item.strategy_snapshot}
                  risk="仅作为销售表达与推进方法，不作为企业事实或承诺依据。"
                  score={item.retrieval_score}
                  used={item.used_in_strategy}
                  onRegenerate={() => onRegenerate(item.title_snapshot)}
                />
              ))}
            </div>
          ) : results.length ? (
            <div className="space-y-3">
              {results.map((item) => (
                <StrategyCard
                  key={item.id}
                  title={item.title}
                  type={item.card_type}
                  summary={item.strategy_summary}
                  risk={item.risk_notes.join("；") || "仅作为销售策略，不作为企业事实依据。"}
                  score={item.final_score}
                  onRegenerate={() => onRegenerate(item.title)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--gold-soft)]/45 p-4 text-center">
              <p className="text-sm font-medium text-[var(--navy)]">暂无匹配的已批准销冠策略</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">生成回复时只会检索 approved 状态的策略卡片。</p>
            </div>
          )}
          {search.isError && <p className="mt-2 text-sm text-[#9A463D]">{search.error.message}</p>}
          <Link href="/champion" className="mt-3 inline-flex text-xs font-medium text-[var(--gold-deep)]">进入销冠知识库 →</Link>
        </div>
      )}
    </section>
  );
}

function StrategyCard({ title, type, summary, risk, score, used, onRegenerate }: { title: string; type: string; summary: string; risk: string; score: number; used?: boolean; onRegenerate: () => void }) {
  return (
    <article className="rounded-xl border border-[var(--gold)]/20 bg-[var(--gold-soft)]/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-5 text-[var(--navy)]">{title}</p>
          <span className="mt-1 inline-flex rounded-full border border-[var(--gold)]/20 bg-white px-2 py-0.5 text-[10px] text-[var(--gold-deep)]">{typeLabels[type] || type}</span>
        </div>
        <span className="shrink-0 text-xs font-semibold text-[var(--gold-deep)]">匹配 {Math.round(score * 100)}%</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--text)]">{summary}</p>
      <div className="mt-2 rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-5 text-[var(--text-muted)]"><strong className="font-medium text-[#8C5A4B]">风险提示：</strong>{risk}</div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--gold)]/15 pt-2">
        <span className="text-[11px] text-[var(--text-light)]">{used ? "已用于当前策略" : "已批准策略"}</span>
        <div className="flex items-center gap-3">
          <Link href="/champion" className="text-xs text-[var(--gold-deep)]">查看详情</Link>
          <button type="button" onClick={onRegenerate} className="text-xs font-semibold text-[var(--navy)] hover:text-[var(--gold-deep)]">使用该策略重新生成</button>
        </div>
      </div>
    </article>
  );
}
