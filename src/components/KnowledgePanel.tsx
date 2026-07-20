"use client";

import Link from "next/link";
import { useState } from "react";
import { useKnowledgeDocuments, useKnowledgeSearch } from "@/hooks/use-knowledge";
import type { Generation } from "@/types/api";
import { PanelHeader } from "./PanelHeader";

type Props = {
  latestCustomerMessage?: string;
  generation?: Generation | null;
};

export function KnowledgePanel({ latestCustomerMessage, generation }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const documents = useKnowledgeDocuments(undefined);
  const search = useKnowledgeSearch();
  const generationSources = generation?.sources || [];
  const searchSources = search.data?.results || [];
  const sourceCount = generationSources.length || searchSources.length;

  const runSearch = () => {
    if (!latestCustomerMessage) return;
    search.mutate({ query: latestCustomerMessage, top_k: 4, min_score: 0.2 });
  };

  return (
    <section className="panel-card shrink-0 overflow-hidden">
      <PanelHeader
        title="企业知识命中"
        icon="building"
        count={sourceCount}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      {!collapsed && (
        <div className="p-4">
          {documents.isPending ? (
            <div className="h-20 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
          ) : documents.isError ? (
            <div className="text-center">
              <p className="text-sm text-[#9A463D]">知识库状态加载失败</p>
              <button onClick={() => void documents.refetch()} className="mt-2 text-sm text-[var(--gold-deep)] underline">重试</button>
            </div>
          ) : generationSources.length ? (
            <div className="space-y-3">
              {generationSources.map((item) => (
                <article key={item.citation_key} className="rounded-xl border border-[var(--border)] bg-[#FDFCFB] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--navy)]" title={item.citation_label}>{item.citation_label}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">引用位置：{item.citation_key}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--success-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--success)]">{Math.round(item.retrieval_score * 100)}%</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-muted)]">{item.content_snapshot}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2">
                    <span className="text-[11px] text-[var(--text-light)]">{item.used_in_reply ? "已用于当前回复" : "检索命中，未直接引用"}</span>
                    <Link href="/knowledge" className="text-xs font-medium text-[var(--gold-deep)]">查看详情 →</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : searchSources.length ? (
            <div className="space-y-3">
              {searchSources.map((item) => (
                <article key={item.chunk_id} className="rounded-xl border border-[var(--border)] bg-[#FDFCFB] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--navy)]">{item.document_name}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">引用位置：{item.citation_label}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--success-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--success)]">{Math.round(item.score * 100)}%</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--text-muted)]">{item.content}</p>
                  <div className="mt-3 text-right"><Link href="/knowledge" className="text-xs font-medium text-[var(--gold-deep)]">查看详情 →</Link></div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-4 text-center">
              <p className="text-sm font-medium text-[var(--navy)]">暂无当前回复的企业知识命中</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">可按最新客户消息先检索，生成回复后这里会展示实际 K 来源。</p>
            </div>
          )}
          {!generationSources.length && (
            <button
              type="button"
              onClick={runSearch}
              disabled={!latestCustomerMessage || search.isPending || !(documents.data?.items.some((item) => item.status === "ready"))}
              title={!latestCustomerMessage ? "当前会话还没有客户消息" : !(documents.data?.items.some((item) => item.status === "ready")) ? "暂无已完成的企业知识文件" : undefined}
              className="workspace-button mt-3 w-full border border-[var(--gold)]/20 bg-[var(--gold-soft)] text-[var(--gold-deep)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {search.isPending ? "正在检索企业知识…" : "按最新客户消息检索"}
            </button>
          )}
          {search.isError && <p className="mt-2 text-sm text-[#9A463D]">{search.error.message}</p>}
        </div>
      )}
    </section>
  );
}
