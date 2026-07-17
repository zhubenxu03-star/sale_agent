"use client";

import { useState } from "react";
import { useKnowledgeSearch } from "@/hooks/use-knowledge";
import type { KnowledgeBase } from "@/types/knowledge";

export function KnowledgeSearchPanel({ bases }: { bases: KnowledgeBase[] }) {
  const [query, setQuery] = useState("");
  const [baseId, setBaseId] = useState("");
  const [topK, setTopK] = useState(5);
  const [minScore, setMinScore] = useState(0.35);
  const search = useKnowledgeSearch();
  const submit = () =>
    search.mutate({
      query: query.trim(),
      knowledge_base_id: baseId || undefined,
      top_k: topK,
      min_score: minScore,
    });
  return (
    <section className="panel-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--navy)]">检索测试</h2>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
            验证企业资料的向量检索结果和引用位置，不生成客户回复。
          </p>
        </div>
        {search.data?.embedding_mode === "test" && (
          <span className="rounded-lg border border-[#E4C99F] bg-[var(--gold-soft)] px-3 py-2 text-[9px] text-[var(--gold-deep)]">
            测试向量模式，仅验证流程，不代表正式语义检索质量
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-[minmax(300px,1fr)_190px_100px_140px_auto] gap-2">
        <input
          aria-label="测试问题"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) submit();
          }}
          placeholder="例如：系统支持与用友U8 Cloud对接吗？"
          className="h-10 rounded-xl border border-[var(--border-strong)] px-3 text-xs outline-none focus:border-[var(--champagne)]"
        />
        <select
          aria-label="检索知识库"
          value={baseId}
          onChange={(event) => setBaseId(event.target.value)}
          className="rounded-xl border border-[var(--border)] px-3 text-[10px]"
        >
          <option value="">全部知识库</option>
          {bases
            .filter((item) => item.status === "active")
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <select
          aria-label="返回数量"
          value={topK}
          onChange={(event) => setTopK(Number(event.target.value))}
          className="rounded-xl border border-[var(--border)] px-2 text-[10px]"
        >
          {[3, 5, 10, 20].map((value) => (
            <option key={value} value={value}>
              Top {value}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-[9px] text-[var(--text-muted)]">
          最低相关度
          <input
            aria-label="最低相关度"
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={minScore}
            onChange={(event) => setMinScore(Number(event.target.value))}
            className="w-12 bg-transparent text-[var(--navy)] outline-none"
          />
        </label>
        <button
          onClick={submit}
          disabled={!query.trim() || search.isPending}
          className="rounded-xl bg-[var(--navy)] px-5 text-xs text-white disabled:opacity-40"
        >
          {search.isPending ? "检索中…" : "开始检索"}
        </button>
      </div>
      {search.isError && (
        <div className="mt-3 rounded-lg border border-[#E7C8C4] bg-[#FFF7F6] px-3 py-2 text-[10px] text-[#9A463D]">
          {search.error.message}
        </div>
      )}
      {search.data && (
        <div className="mt-4">
          <div className="mb-2 flex justify-between text-[9px] text-[var(--text-muted)]">
            <span>检索结果 · {search.data.results.length} 条</span>
            <span>
              耗时 {search.data.duration_ms} ms ·{" "}
              {search.data.embedding_mode === "test" ? "测试向量" : "生产向量"}
            </span>
          </div>
          {!search.data.results.length ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-8 text-center text-xs text-[var(--text-muted)]">
              没有检索到达到当前相关度要求的企业资料。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {search.data.results.map((result) => (
                <article
                  key={result.chunk_id}
                  className="rounded-xl border border-[var(--border)] bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-[var(--success-soft)] px-2 py-1 text-[9px] text-[var(--success)]">
                      相关度 {(result.score * 100).toFixed(1)}%
                    </span>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          `${result.citation_label}\n${result.content}`,
                        )
                      }
                      className="text-[9px] text-[var(--gold-deep)]"
                    >
                      复制引用
                    </button>
                  </div>
                  <h3 className="mt-3 text-xs font-semibold text-[var(--navy)]">
                    {result.document_name}
                  </h3>
                  <p className="mt-1 text-[9px] text-[var(--gold-deep)]">
                    {result.citation_label}
                  </p>
                  {result.section_title && (
                    <p className="mt-1 text-[9px] text-[var(--text-muted)]">
                      章节：{result.section_title}
                    </p>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[10px] text-[var(--text)]">
                      {result.content.slice(0, 150)}
                      {result.content.length > 150 ? "…" : ""}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-[var(--text)]">
                      {result.content}
                    </p>
                  </details>
                  <a
                    href={`/api/knowledge/documents/${result.document_id}/download`}
                    className="mt-3 inline-block text-[9px] text-[var(--gold-deep)]"
                  >
                    查看原文件
                  </a>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
