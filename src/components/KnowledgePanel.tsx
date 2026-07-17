"use client";

import Link from "next/link";
import {
  useKnowledgeBases,
  useKnowledgeDocuments,
  useKnowledgeSearch,
} from "@/hooks/use-knowledge";
import { Icon } from "./Icon";
import { PanelHeader } from "./PanelHeader";

export function KnowledgePanel({
  latestCustomerMessage,
}: {
  latestCustomerMessage?: string;
}) {
  const bases = useKnowledgeBases();
  const documents = useKnowledgeDocuments(undefined);
  const search = useKnowledgeSearch();
  const readyDocuments =
    documents.data?.items.filter((item) => item.status === "ready") || [];
  const recent = documents.data?.items[0];
  const runSearch = () => {
    if (!latestCustomerMessage) return;
    search.mutate({ query: latestCustomerMessage, top_k: 3, min_score: 0.2 });
  };
  return (
    <section className="panel-card min-h-0 overflow-hidden">
      <PanelHeader title="企业知识库" icon="building" />
      <div className="chat-scroll h-[calc(100%-48px)] min-h-[92px] overflow-y-auto px-3.5 py-3">
        {bases.isPending || documents.isPending ? (
          <div className="h-16 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
        ) : bases.isError || documents.isError ? (
          <div className="text-center">
            <p className="text-[9px] text-[#9A463D]">知识库状态加载失败</p>
            <button
              onClick={() => {
                void bases.refetch();
                void documents.refetch();
              }}
              className="mt-1 text-[9px] text-[var(--gold-deep)] underline"
            >
              重试
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--navy-soft)] text-[var(--navy)]">
                  <Icon name="knowledge" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[10px] font-medium text-[var(--navy)]">
                    {bases.data?.length || 0} 个企业知识库
                  </p>
                  <p className="mt-0.5 text-[9px] text-[var(--text-muted)]">
                    {readyDocuments.length} 个文件可检索
                  </p>
                </div>
              </div>
              <Link
                href="/knowledge"
                className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-[9px] text-[var(--gold-deep)]"
              >
                进入知识库
              </Link>
            </div>
            {recent && (
              <p className="mt-2 truncate rounded-lg bg-[var(--surface-muted)] px-2 py-1.5 text-[9px] text-[var(--text-muted)]">
                最近：{recent.original_filename}
              </p>
            )}
            <button
              onClick={runSearch}
              disabled={
                !latestCustomerMessage ||
                search.isPending ||
                !readyDocuments.length
              }
              title={
                !latestCustomerMessage
                  ? "当前会话还没有客户消息"
                  : !readyDocuments.length
                    ? "暂无已完成的企业知识文件"
                    : undefined
              }
              className="mt-2 w-full rounded-lg bg-[var(--gold-soft)] py-2 text-[9px] font-medium text-[var(--gold-deep)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {search.isPending ? "正在检索企业知识…" : "根据最新客户消息检索"}
            </button>
            {search.isError && (
              <p className="mt-2 text-[9px] text-[#9A463D]">
                {search.error.message}
              </p>
            )}
            {search.data && (
              <div className="mt-2 border-t border-[var(--border)] pt-2">
                <p className="text-[9px] font-semibold text-[var(--navy)]">
                  企业知识检索结果
                </p>
                {!search.data.results.length ? (
                  <p className="mt-1 text-[9px] text-[var(--text-muted)]">
                    没有达到相关度要求的企业资料
                  </p>
                ) : (
                  search.data.results.map((item) => (
                    <article
                      key={item.chunk_id}
                      className="mt-2 rounded-lg border border-[var(--border)] p-2"
                    >
                      <div className="flex justify-between text-[8px]">
                        <span className="truncate text-[var(--gold-deep)]">
                          {item.citation_label}
                        </span>
                        <span className="text-[var(--success)]">
                          {(item.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-[9px] leading-4 text-[var(--text)]">
                        {item.content}
                      </p>
                    </article>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
