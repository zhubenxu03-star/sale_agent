"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { AuthGate } from "@/components/auth/AuthGate";
import { useCurrentUser } from "@/hooks/useAuth";
import { processChampionSource, setChampionMapping, uploadChampionFile, useChampionAction, useChampionCards, useChampionPreview, useChampionSearch, useChampionSources, useChampionStats } from "@/hooks/use-champion";
import type { ChampionSearchResult } from "@/types/champion";

const tabs = ["数据概览", "数据源", "待审核", "已批准话术", "检索测试", "使用效果"];

export function ChampionDashboard() {
  const identity = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState("数据概览");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedSource, setSelectedSource] = useState<string>();
  const [query, setQuery] = useState("");
  const [searchIndustry, setSearchIndustry] = useState("");
  const [searchStage, setSearchStage] = useState("");
  const [searchResults, setSearchResults] = useState<ChampionSearchResult[]>([]);
  const sourcesQuery = useChampionSources();
  const statsQuery = useChampionStats();
  const reviewQuery = useChampionCards("review");
  const approvedQuery = useChampionCards("approved");
  const previewQuery = useChampionPreview(selectedSource);
  const action = useChampionAction();
  const search = useChampionSearch();
  const sourceList = useMemo(() => sourcesQuery.data || [], [sourcesQuery.data]);
  const stats = statsQuery.data;
  const role = identity.data?.user.role;
  if (!identity.data) return null;

  const handleUpload = async (file: File) => {
    setUploading(true); setUploadProgress(0);
    try {
      const source = await uploadChampionFile(file, { source_type: "chat_export", retain_original: false }, setUploadProgress);
      setSelectedSource(source.id);
      await sourcesQuery.refetch();
    } finally { setUploading(false); }
  };
  const handleProcess = async () => {
    if (!selectedSource) return;
    await setChampionMapping(selectedSource, { mapping: { conversation_id: "conversation_id", sender_role: "sender_role", sender_name: "sender_name", content: "content", timestamp: "timestamp", industry: "industry", sales_stage: "sales_stage", outcome: "outcome", deal_amount: "deal_amount" }, role_mapping: { customer_values: ["customer", "客户"], salesperson_values: ["salesperson", "sales", "销售"], system_values: ["system", "系统"] }, redaction_rules: { custom_words: [] } });
    await processChampionSource(selectedSource);
    await sourcesQuery.refetch();
  };
  const runSearch = async () => { if (!query.trim()) return; const result = await search.mutateAsync({ query, industry: searchIndustry || undefined, sales_stage: searchStage || undefined, top_k: 4, min_score: 0.35 }); setSearchResults(result); };
  const cardList = tab === "已批准话术" ? approvedQuery.data || [] : reviewQuery.data || [];
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar identity={identity.data} customers={[]} collapsed={collapsed} activeLabel="销冠知识库" />
      <Header identity={identity.data} collapsed={collapsed} onToggleSidebar={() => setCollapsed((v) => !v)} title="销冠知识库" subtitle="脱敏导入、结构化提取与人工审核" />
      <main className={`mt-16 min-h-[calc(100vh-64px)] p-[18px] transition-[margin] 2xl:p-6 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}>
        <div className="mx-auto max-w-[1800px] space-y-4">
          <div className="flex items-start justify-between">
            <div><h1 className="text-xl font-semibold text-[var(--navy)]">销冠知识库</h1><p className="mt-1 text-[11px] text-[var(--text-muted)]">企业事实与销冠销售方法逻辑隔离，只有审核通过的脱敏经验参与检索。</p></div>
            {role === "sales" ? <span className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[10px] text-[var(--text-muted)]">销售角色只读已批准经验</span> : <label className="cursor-pointer rounded-lg bg-[var(--gold)] px-4 py-2 text-xs font-medium text-white shadow-sm">{uploading ? `上传中 ${uploadProgress}%` : "上传聊天记录"}<input className="hidden" type="file" accept=".txt,.md,.csv,.xlsx,.json,.docx" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleUpload(file); }} /></label>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{[["数据源", stats?.source_count || 0], ["导入会话", stats?.conversation_count || 0], ["候选经验", stats?.candidate_card_count || 0], ["待审核", stats?.review_count || 0], ["已批准", stats?.approved_count || 0], ["本月调用", stats?.monthly_usage_count || 0], ["平均采纳率", `${Math.round((stats?.adoption_rate || 0) * 100)}%`]].map(([label, value]) => <div key={String(label)} className="panel-card p-4"><p className="text-[9px] text-[var(--text-muted)]">{label}</p><p className="mt-2 text-xl font-semibold text-[var(--navy)]">{value}</p></div>)}</div>
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-1">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-[11px] ${tab === item ? "bg-[var(--navy)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"}`}>{item}</button>)}</div>
          {tab === "数据源" || tab === "数据概览" ? <section className="panel-card overflow-hidden"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><h2 className="text-sm font-semibold text-[var(--navy)]">数据源与处理任务</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">支持 TXT、MD、CSV、XLSX、JSON、DOCX；上传后先预览，再映射和处理。</p></div>{selectedSource && previewQuery.data && <button onClick={() => void handleProcess()} className="rounded-lg bg-[var(--gold-soft)] px-3 py-2 text-[10px] text-[var(--gold-deep)]">确认映射并开始处理</button>}</div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-[10px]"><thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]"><tr>{["数据源名称", "格式", "会话", "脱敏命中", "候选卡片", "处理状态", "进度", "操作"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{sourceList.map((source) => <tr key={source.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-medium text-[var(--navy)]">{source.name}</td><td className="px-4 py-3 uppercase text-[var(--text-muted)]">{source.file_extension}</td><td className="px-4 py-3">{source.conversation_count}</td><td className="px-4 py-3">{source.redaction_count}</td><td className="px-4 py-3">{source.candidate_card_count}</td><td className="px-4 py-3"><span className="rounded-full bg-[var(--navy-soft)] px-2 py-1 text-[9px] text-[var(--navy)]">{source.status}</span></td><td className="px-4 py-3">{source.progress}%</td><td className="px-4 py-3"><button onClick={() => setSelectedSource(source.id)} className="mr-2 text-[var(--gold-deep)]">预览</button>{(source.status === "failed" || source.status === "review_required") && role !== "sales" && <button onClick={() => void processChampionSource(source.id)} className="text-[var(--navy)]">重试</button>}</td></tr>)}</tbody></table></div>{selectedSource && previewQuery.data && <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] p-4"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-[var(--navy)]">脱敏预览 · 命中 {previewQuery.data.redaction_count} 项</p><button onClick={() => setSelectedSource(undefined)} className="text-[10px] text-[var(--text-muted)]">关闭</button></div><div className="mt-3 max-h-48 overflow-auto rounded-lg bg-white p-3 text-[10px] text-[var(--text-muted)]">{previewQuery.data.redacted_records.slice(0, 8).map((record, index) => <p key={index} className="border-b border-[var(--border)] py-1">{String(record.content || "")}<span className="ml-2 text-[9px] text-[var(--gold-deep)]">{String(record.sender_role || "unknown")}</span></p>)}</div></div>}</section> : null}
          {tab === "待审核" || tab === "已批准话术" ? <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]"><div className="panel-card overflow-hidden"><div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold text-[var(--navy)]">{tab}</h2></div><div className="divide-y divide-[var(--border)]">{cardList.map((card) => <button key={card.id} onClick={() => setSelectedSource(card.source_id || undefined)} className="block w-full p-4 text-left hover:bg-[var(--surface-muted)]"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[var(--navy)]">{card.title}</span><span className="text-[10px] text-[var(--gold-deep)]">质量 {card.quality_score}</span></div><p className="mt-2 line-clamp-2 text-[10px] text-[var(--text-muted)]">{card.strategy_summary}</p><div className="mt-2 flex gap-2 text-[9px] text-[var(--text-light)]"><span>{card.card_type}</span><span>{card.status}</span></div></button>)}{!cardList.length && <div className="p-8 text-center text-[10px] text-[var(--text-muted)]">暂无数据</div>}</div></div><div className="panel-card p-4"><h3 className="text-xs font-semibold text-[var(--navy)]">审核规则</h3><p className="mt-2 text-[10px] leading-6 text-[var(--text-muted)]">只有 approved 且 active 的卡片参与检索。每次编辑、审核和重新提取都会保留版本快照；销冠经验不能成为企业价格、案例或效果事实。</p>{role !== "sales" && cardList[0] && <div className="mt-4 flex gap-2"><button onClick={() => void action.mutateAsync({ id: cardList[0].id, action: "approve" })} className="rounded-lg bg-[var(--navy)] px-3 py-2 text-[10px] text-white">批准当前首条</button><button onClick={() => void action.mutateAsync({ id: cardList[0].id, action: "reject" })} className="rounded-lg border border-[var(--border)] px-3 py-2 text-[10px] text-[var(--text-muted)]">拒绝</button></div>}</div></section> : null}
          {tab === "检索测试" ? <section className="panel-card p-5"><h2 className="text-sm font-semibold text-[var(--navy)]">销冠经验检索测试</h2><div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px_180px_auto]"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入客户消息，例如：你们价格太高了" className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none" /><input value={searchIndustry} onChange={(e) => setSearchIndustry(e.target.value)} placeholder="行业" className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none" /><input value={searchStage} onChange={(e) => setSearchStage(e.target.value)} placeholder="销售阶段" className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs outline-none" /><button onClick={() => void runSearch()} className="rounded-lg bg-[var(--navy)] px-4 py-2 text-xs text-white">检索</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{searchResults.map((item) => <article key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"><div className="flex justify-between"><h3 className="text-xs font-semibold text-[var(--navy)]">{item.strategy_key} · {item.title}</h3><span className="text-[10px] text-[var(--gold-deep)]">{Math.round(item.final_score * 100)}%</span></div><p className="mt-2 text-[10px] text-[var(--text-muted)]">{item.strategy_summary}</p><p className="mt-2 text-[10px] text-[var(--navy)]">参考表达：{item.salesperson_reply}</p></article>)}</div></section> : null}
          {tab === "使用效果" ? <section className="panel-card p-8 text-center text-[11px] text-[var(--text-muted)]">使用效果只提供人工决策依据，不会自动修改销冠经验内容。当前反馈采纳率为 {Math.round((stats?.adoption_rate || 0) * 100)}%。</section> : null}
        </div>
      </main>
    </div>
  );
}

export function ChampionPage() { return <AuthGate><ChampionDashboard /></AuthGate>; }
