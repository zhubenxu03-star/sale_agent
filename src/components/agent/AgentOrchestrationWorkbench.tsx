"use client";

import { useState, type ReactNode } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { useToast } from "@/components/providers/AppProviders";
import { useChampionStats } from "@/hooks/use-champion";
import {
  useAgentConfig,
  useDefaultAgent,
  usePublishAgentConfig,
  useRestoreAgentConfig,
  useTestAgentGenerate,
  useUpdateAgentConfig,
} from "@/hooks/useAgent";
import { useCustomers } from "@/hooks/useCustomers";
import { useConversations } from "@/hooks/useConversations";
import { useKnowledgeBases, useKnowledgeConfig } from "@/hooks/use-knowledge";
import { useCurrentUser } from "@/hooks/useAuth";
import type { AgentConfig, AgentOutput, Generation } from "@/types/api";

const stages = [
  ["客户消息", "输入"],
  ["企业知识检索", "K"],
  ["销冠策略检索", "S"],
  ["大模型融合", "融合"],
  ["风险校验", "安全"],
  ["生成回复", "输出"],
];
const styleOptions: Array<[AgentConfig["reply_style"], string]> = [
  ["consultative", "顾问式"], ["professional", "专业克制"], ["friendly", "亲和自然"],
  ["concise", "简洁直接"], ["conversion", "成交导向"],
];
const lengthOptions: Array<[AgentConfig["reply_length"], string]> = [["short", "简短"], ["medium", "适中"], ["long", "详细"]];
const aggressivenessOptions: Array<[AgentConfig["sales_aggressiveness"], string]> = [["low", "稳健"], ["medium", "平衡"], ["high", "主动"]];
const strategyTypes = [
  ["opening", "开场破冰"], ["needs_discovery", "需求挖掘"], ["value_proposition", "价值塑造"],
  ["objection_handling", "价格异议"], ["competitor", "竞品异议"], ["negotiation", "商务谈判"],
  ["follow_up", "跟进催单"], ["appointment", "邀约演示"], ["closing", "促成成交"],
];
const defaultClaims = ["未经企业知识支持，不承诺价格、折扣、交付和效果", "不将销冠历史案例当作企业事实"];
const defaultHandoffs = ["投诉退款", "合同法律问题", "特殊价格审批", "客户要求人工", "安全合规承诺", "高价值商机", "没有可靠知识", "低置信度"];

type Draft = AgentConfig;

export function AgentOrchestrationWorkbench() {
  const [collapsed, setCollapsed] = useState(false);
  const identity = useCurrentUser();
  const agent = useDefaultAgent();
  const configQuery = useAgentConfig(agent.data?.id);
  const [draft, setDraft] = useState<Draft>();
  const update = useUpdateAgentConfig(agent.data?.id);
  const publish = usePublishAgentConfig(agent.data?.id);
  const restore = useRestoreAgentConfig(agent.data?.id);
  const testGenerate = useTestAgentGenerate();
  const { showToast } = useToast();
  const canEdit = identity.data?.user.role !== "sales";
  const isAdmin = identity.data?.user.role === "admin";

  const form = draft || configQuery.data;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const updateList = (key: "prohibited_claims" | "human_handoff_rules", value: string[]) => set(key, value as Draft[typeof key]);

  const bases = useKnowledgeBases(Boolean(identity.data));
  const knowledgeConfig = useKnowledgeConfig();
  const championStats = useChampionStats();
  const customers = useCustomers();
  const [customerId, setCustomerId] = useState("");
  const activeCustomerId = customerId || customers.data?.items[0]?.id || "";
  const conversations = useConversations(activeCustomerId || undefined);
  const [conversationId, setConversationId] = useState("");
  const [testMessage, setTestMessage] = useState("客户说：你们的方案价格比预算高，为什么值得投入？");
  const [testStage, setTestStage] = useState("quotation");
  const [testMode, setTestMode] = useState<"standard" | "shorter" | "colloquial" | "conversion">("standard");
  const [testK, setTestK] = useState(true);
  const [testS, setTestS] = useState(true);
  const [testResult, setTestResult] = useState<Generation>();

  const defaultBase = bases.data?.[0];
  const readyCount = defaultBase?.ready_document_count || 0;
  const chunkCount = defaultBase?.chunk_count || 0;
  const approvedCount = championStats.data?.approved_count || 0;
  const reviewCount = championStats.data?.review_count || 0;
  const activeConversationId = conversationId || conversations.data?.items[0]?.id || "";

  if (!identity.data) return null;
  if (!form || configQuery.isPending) {
    return <div className="min-h-screen bg-[var(--background)]"><Sidebar identity={identity.data} customers={[]} collapsed={collapsed} activeLabel="智能体配置" /><Header identity={identity.data} collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} title="销转智能体编排中心" subtitle="配置企业知识、销冠经验、回复风格与风险规则" /><main className={`mt-16 p-6 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}><div className="panel-card mx-auto max-w-[1440px] p-10 text-center text-sm text-[var(--text-muted)]">正在加载编排配置…</div></main></div>;
  }

  const saveDraft = async () => {
    if (!canEdit) return;
    try {
      const payload: Partial<AgentConfig> = { ...form };
      for (const key of ["id", "agent_id", "version", "updated_at", "draft_version", "published_version", "published_at", "published_by_user_id", "has_published_config"] as const) delete payload[key];
      const saved = await update.mutateAsync(payload);
      setDraft(saved);
      showToast("草稿已保存", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "保存失败", "error"); }
  };
  const publishDraft = async () => {
    try { const value = await publish.mutateAsync(); setDraft(value); showToast("配置已发布", "success"); } catch (error) { showToast(error instanceof Error ? error.message : "发布失败", "error"); }
  };
  const restorePublished = async () => {
    try { const value = await restore.mutateAsync(); setDraft(value); showToast("已恢复最近发布版本", "success"); } catch (error) { showToast(error instanceof Error ? error.message : "恢复失败", "error"); }
  };
  const runTest = async () => {
    if (!activeCustomerId || !activeConversationId) { showToast("请先选择测试客户和会话", "error"); return; }
    try {
      const value = await testGenerate.mutateAsync({ request_id: `ui-test-${Date.now()}`, agent_id: form.agent_id, customer_id: activeCustomerId, conversation_id: activeConversationId, customer_message: testMessage, sales_stage: testStage, mode: testMode, use_enterprise_knowledge: testK, use_champion_knowledge: testS });
      setTestResult(value);
      showToast("测试生成完成，未写入正式会话", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "测试生成失败", "error"); }
  };

  return <div className="min-h-screen bg-[var(--background)] text-[var(--navy)]">
    <Sidebar identity={identity.data} customers={customers.data?.items || []} collapsed={collapsed} activeLabel="智能体配置" />
    <Header identity={identity.data} collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} title="销转智能体编排中心" subtitle="配置企业知识、销冠经验、回复风格与风险规则" />
    <main className={`mt-16 min-h-[calc(100vh-64px)] px-4 py-5 transition-[margin] md:px-6 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}>
      <div className="mx-auto max-w-[1440px] space-y-5">
        <section className="panel-card overflow-hidden p-5 md:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-deep)]">Agent orchestration</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">销转智能体编排中心</h1><p className="mt-2 text-sm text-[var(--text-muted)]">配置企业知识、销冠经验、回复风格与风险规则</p></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">草稿 v{form.draft_version}</span><span className="rounded-full border border-[#D7B77D] bg-[var(--gold-soft)] px-3 py-2 text-[var(--gold-deep)]">{form.has_published_config ? `已发布 v${form.published_version}` : "尚未发布"}</span>{canEdit && <><button onClick={() => void saveDraft()} disabled={update.isPending} className="action-button h-10 disabled:opacity-50">{update.isPending ? "保存中…" : "保存草稿"}</button><button onClick={() => void publishDraft()} disabled={publish.isPending} className="action-button action-button-gold h-10 disabled:opacity-50">{publish.isPending ? "发布中…" : "发布配置"}</button>{form.has_published_config && <button onClick={() => void restorePublished()} disabled={restore.isPending} className="action-button h-10 disabled:opacity-50">恢复已发布</button>}</>}</div></div>
          <div className="mt-6 grid gap-2 md:grid-cols-6">{stages.map(([label, tag], index) => <div key={label} className="flex items-center gap-2"><div className={`flex min-h-[58px] flex-1 items-center gap-3 rounded-xl border px-3 py-3 ${index === 5 ? "border-[#D7B77D] bg-[var(--gold-soft)]" : "border-[var(--border)] bg-[var(--surface-muted)]"}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--navy)] text-[10px] font-semibold text-white">{tag}</span><span className="text-sm font-medium">{label}</span></div>{index < stages.length - 1 && <span className="hidden text-[var(--gold)] md:block">→</span>}</div>)}</div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">最后更新：{new Date(form.updated_at).toLocaleString("zh-CN")} · 配置发布后才影响正式生成</p>
        </section>

        <div className="space-y-5"><ConfigSection title="一、基础身份" eyebrow="Identity" description="让团队知道智能体是谁、如何与客户沟通。"><div className="grid gap-4 md:grid-cols-2"><Field label="智能体名称"><input value={agent.data?.name || ""} disabled className="form-input" /></Field><Field label="身份说明"><textarea value={form.identity_prompt} onChange={(event) => set("identity_prompt", event.target.value)} disabled={!canEdit || !isAdmin} className="form-input min-h-24 md:row-span-2" /></Field><Select label="回复风格" value={form.reply_style} options={styleOptions} onChange={(value) => set("reply_style", value)} disabled={!canEdit} /><Select label="回复长度" value={form.reply_length} options={lengthOptions} onChange={(value) => set("reply_length", value)} disabled={!canEdit} /><Select label="销售主动程度" value={form.sales_aggressiveness} options={aggressivenessOptions} onChange={(value) => set("sales_aggressiveness", value)} disabled={!canEdit} /><Toggle label="允许表情" checked={form.allow_emoji} onChange={(value) => set("allow_emoji", value)} disabled={!canEdit} /></div><Field label="自定义说明"><textarea value={form.custom_instructions || ""} onChange={(event) => set("custom_instructions", event.target.value)} disabled={!canEdit} placeholder="例如：面向制造业客户，优先使用 ROI 和实施节奏解释方案。" className="form-input min-h-24" /></Field></ConfigSection>

        <ConfigSection title="二、企业知识库" eyebrow="Enterprise knowledge · K" description="企业知识提供产品、价格、交付和案例事实；销冠经验不会覆盖企业事实。"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><StatusTile label="连接状态" value={readyCount > 0 ? "已连接 · 可检索" : "已连接 · 暂无 ready 文档"} tone={readyCount > 0 ? "green" : "gold"} /><StatusTile label="默认知识库" value={defaultBase?.name || "尚未创建"} /><StatusTile label="Ready 文档" value={`${readyCount} 份`} /><StatusTile label="知识片段" value={`${chunkCount} 条`} /><StatusTile label="Embedding 模式" value={knowledgeConfig.data?.embedding_mode === "production" ? "生产向量" : "测试向量"} /><StatusTile label="最近更新时间" value={defaultBase ? new Date(defaultBase.updated_at).toLocaleDateString("zh-CN") : "—"} /></div><div className="mt-4 grid gap-4 md:grid-cols-2"><Toggle label="启用企业知识" checked={form.enterprise_knowledge_enabled} onChange={(value) => set("enterprise_knowledge_enabled", value)} disabled={!canEdit} /><Toggle label="强制企业知识引用" checked={form.require_citations} onChange={(value) => set("require_citations", value)} disabled={!canEdit} /></div><div className="mt-4 flex flex-wrap gap-2"><a href="/knowledge" className="action-button h-10">进入企业知识库</a><button onClick={() => showToast("请在企业知识库页面输入客户问题进行检索测试", "info")} className="action-button h-10">测试企业知识检索</button></div><Advanced title="企业检索高级设置"><div className="grid gap-4 md:grid-cols-3"><NumberField label="默认检索数量 Top K" value={form.default_top_k} min={1} max={20} step={1} onChange={(value) => set("default_top_k", value)} disabled={!canEdit} /><NumberField label="最低相关度" value={form.default_min_score} min={0} max={1} step={0.05} onChange={(value) => set("default_min_score", value)} disabled={!canEdit} /><p className="rounded-xl bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--text-muted)]">知识字符限制由后端安全策略统一控制，避免企业事实被无界注入提示词。</p></div></Advanced></ConfigSection>

        <ConfigSection title="三、销冠知识库" eyebrow="Champion methods · S" description="销冠知识只提供内部销售方法，只有 approved 且 active 卡片参与正式生成。"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatusTile label="连接状态" value={form.champion_enabled ? "已启用 · 仅 approved" : "已停用"} tone={form.champion_enabled ? "green" : "muted"} /><StatusTile label="已批准经验" value={`${approvedCount} 条`} /><StatusTile label="待审核" value={`${reviewCount} 条`} /><StatusTile label="最近更新时间" value={championStats.data ? "实时统计" : "—"} /></div><div className="mt-4 grid gap-4 md:grid-cols-3"><Toggle label="启用销冠知识" checked={form.champion_enabled} onChange={(value) => set("champion_enabled", value)} disabled={!canEdit} /><NumberField label="默认检索数量" value={form.champion_top_k} min={1} max={10} step={1} onChange={(value) => set("champion_top_k", value)} disabled={!canEdit} /><NumberField label="最低匹配度" value={form.champion_min_score} min={0} max={1} step={0.05} onChange={(value) => set("champion_min_score", value)} disabled={!canEdit} /></div><div className="mt-4"><p className="mb-2 text-sm font-medium">优先经验类型</p><div className="flex flex-wrap gap-2">{strategyTypes.map(([key, label]) => <span key={key} className="rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)]">{label}</span>)}</div></div><Advanced title="高级匹配规则"><div className="grid gap-4 md:grid-cols-5"><Weight label="客户问题匹配程度" value={form.champion_semantic_weight} /><Weight label="行业匹配程度" value={form.champion_industry_weight} /><Weight label="销售阶段匹配程度" value={form.champion_stage_weight} /><Weight label="历史成交效果" value={form.champion_success_weight} /><Weight label="管理员推荐程度" value={form.champion_admin_score_weight} /></div><p className="mt-3 text-xs text-[var(--text-muted)]">当前权重合计：{(form.champion_semantic_weight + form.champion_industry_weight + form.champion_stage_weight + form.champion_success_weight + form.champion_admin_score_weight).toFixed(2)}，后端会校验总和接近 1。</p></Advanced></ConfigSection>

        <section className="panel-card p-5 md:p-6"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gold-deep)]">Guardrails</p><h2 className="mt-1 text-lg font-semibold">四、回复和安全规则</h2><p className="mt-1 text-sm text-[var(--text-muted)]">把“能说什么”和“什么时候交给人工”变成清晰的运营规则。</p></div><span className="rounded-full bg-[var(--navy-soft)] px-3 py-2 text-xs text-[var(--navy)]">管理员维护安全底线</span></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><RuleList title="回复规则" items={["先共情客户", "主动提出问题", "主动邀约", "使用企业案例", "使用销冠经验", "无销冠经验时允许生成", "强制企业知识引用", "允许表情"]} values={form} set={set} editable={canEdit} /><TagEditor title="禁止承诺" description="可新增、删除的业务承诺黑名单" items={form.prohibited_claims.length ? form.prohibited_claims : defaultClaims} onChange={(value) => updateList("prohibited_claims", value)} disabled={!isAdmin} /><HandoffEditor items={form.human_handoff_rules.length ? form.human_handoff_rules : defaultHandoffs} onChange={(value) => updateList("human_handoff_rules", value)} disabled={!isAdmin} /></div><Advanced title="模型与响应高级设置"><div className="grid gap-4 md:grid-cols-2"><NumberField label="生成温度" value={form.temperature} min={0} max={2} step={0.1} onChange={(value) => set("temperature", value)} disabled={!canEdit} /><NumberField label="最大输出长度" value={form.max_output_tokens} min={128} max={8000} step={128} onChange={(value) => set("max_output_tokens", value)} disabled={!canEdit} /></div></Advanced></section>

        <section className="panel-card p-5 md:p-6"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gold-deep)]">Sandbox</p><h2 className="mt-1 text-lg font-semibold">五、测试与发布</h2><p className="mt-1 text-sm text-[var(--text-muted)]">使用当前草稿配置测试真实 K/S 检索，不会写入正式客户会话。</p></div><span className="rounded-full border border-[var(--border)] px-3 py-2 text-xs">{testResult ? `测试生成 · 配置 v${testResult.config_version}` : "尚未运行测试"}</span></div><div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><div className="space-y-4"><Field label="测试客户消息"><textarea value={testMessage} onChange={(event) => setTestMessage(event.target.value)} className="form-input min-h-28" placeholder="输入客户真实问题，测试台不会保存这条消息。" /></Field><div className="grid gap-4 md:grid-cols-2"><Select label="测试客户" value={customerId} options={(customers.data?.items || []).map((item) => [item.id, `${item.name}${item.company_name ? ` · ${item.company_name}` : ""}`] as [string, string])} onChange={(value) => { setCustomerId(value); setConversationId(""); }} disabled={!customers.data?.items.length} /><Select label="测试会话" value={conversationId} options={(conversations.data?.items || []).map((item) => [item.id, item.title] as [string, string])} onChange={setConversationId} disabled={!customerId} /></div><div className="grid gap-4 md:grid-cols-2"><Select label="当前销售阶段" value={testStage} options={[["initial_contact", "初步接触"], ["needs_discovery", "需求挖掘"], ["quotation", "报价评估"], ["negotiation", "商务谈判"], ["closing", "促成成交"]]} onChange={setTestStage} disabled={false} /><Select label="回复模式" value={testMode} options={[["standard", "标准回复"], ["shorter", "更简短"], ["colloquial", "更口语"], ["conversion", "更主动促成"]]} onChange={(value) => setTestMode(value as typeof testMode)} disabled={false} /></div><div className="flex flex-wrap gap-4 rounded-xl bg-[var(--surface-muted)] p-4"><Toggle label="启用企业知识 K" checked={testK} onChange={setTestK} disabled={false} /><Toggle label="启用销冠知识 S" checked={testS} onChange={setTestS} disabled={false} /></div><button onClick={() => void runTest()} disabled={testGenerate.isPending || !customerId || !conversationId} className="action-button action-button-gold h-11 w-full disabled:cursor-not-allowed disabled:opacity-50">{testGenerate.isPending ? "正在检索并生成…" : "运行配置测试"}</button></div><TestResult result={testResult} /></div></section>
      </div></div>
    </main>
  </div>;
}

function ConfigSection({ title, eyebrow, description, children }: { title: string; eyebrow: string; description: string; children: ReactNode }) { return <section className="panel-card p-5 md:p-6"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--gold-deep)]">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p><div className="mt-5 space-y-4">{children}</div></section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-2 text-sm font-medium"><span>{label}</span>{children}</label>; }
function Select<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void; disabled: boolean }) { return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value as T)} disabled={disabled} className="form-input h-11 text-sm disabled:cursor-not-allowed disabled:bg-slate-50">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>; }
function NumberField({ label, value, min, max, step, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; disabled: boolean }) { return <Field label={label}><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} className="form-input h-11 text-sm disabled:cursor-not-allowed disabled:bg-slate-50" /></Field>; }
function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) { return <label className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 text-sm ${disabled ? "bg-slate-50 text-[var(--text-muted)]" : "bg-white"}`}><span>{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => !disabled && onChange(!checked)} disabled={disabled} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[var(--navy)]" : "bg-[#C9C3B9]"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} /></button></label>; }
function StatusTile({ label, value, tone = "muted" }: { label: string; value: string; tone?: "green" | "gold" | "muted" }) { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"><p className="text-xs text-[var(--text-muted)]">{label}</p><p className={`mt-2 text-sm font-semibold ${tone === "green" ? "text-emerald-700" : tone === "gold" ? "text-[var(--gold-deep)]" : "text-[var(--navy)]"}`}>{value}</p></div>; }
function Advanced({ title, children }: { title: string; children: ReactNode }) { return <details className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-4"><summary className="cursor-pointer text-sm font-medium">{title}<span className="ml-2 text-xs text-[var(--text-muted)]">技术参数默认收起</span></summary><div className="mt-4">{children}</div></details>; }
function Weight({ label, value }: { label: string; value: number }) { return <div><p className="text-xs text-[var(--text-muted)]">{label}</p><div className="mt-2 h-2 rounded-full bg-[#E9E4DB]"><div className="h-2 rounded-full bg-[var(--gold)]" style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} /></div><p className="mt-1 text-sm font-semibold">{Math.round(value * 100)}%</p></div>; }
function RuleList({ title, items, values, set, editable }: { title: string; items: string[]; values: Draft; set: <K extends keyof Draft>(key: K, value: Draft[K]) => void; editable: boolean }) { return <div className="rounded-xl border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">{title}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((item) => <label key={item} className="flex min-h-10 items-center gap-2 rounded-lg bg-[var(--surface-muted)] px-3 text-sm"><input type="checkbox" checked={item === "使用企业案例" ? values.require_citations : item === "使用销冠经验" ? values.champion_enabled : item === "无销冠经验时允许生成" ? values.champion_allow_general_generation : item === "强制企业知识引用" ? values.require_citations : item === "允许表情" ? values.allow_emoji : true} onChange={(event) => { if (item === "使用企业案例" || item === "强制企业知识引用") set("require_citations", event.target.checked); if (item === "使用销冠经验") set("champion_enabled", event.target.checked); if (item === "无销冠经验时允许生成") set("champion_allow_general_generation", event.target.checked); if (item === "允许表情") set("allow_emoji", event.target.checked); }} disabled={!editable} />{item}</label>)}</div></div>; }
function TagEditor({ title, description, items, onChange, disabled }: { title: string; description: string; items: string[]; onChange: (value: string[]) => void; disabled: boolean }) { const [value, setValue] = useState(""); const remove = (item: string) => onChange(items.filter((current) => current !== item)); return <div className="rounded-xl border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p><div className="mt-3 flex flex-wrap gap-2">{items.map((item) => <span key={item} className="inline-flex items-center gap-2 rounded-full bg-[var(--gold-soft)] px-3 py-1.5 text-xs text-[var(--gold-deep)]">{item}<button type="button" onClick={() => remove(item)} disabled={disabled} aria-label={`删除${item}`} className="font-semibold disabled:opacity-40">×</button></span>)}</div><div className="mt-3 flex gap-2"><input value={value} onChange={(event) => setValue(event.target.value)} disabled={disabled} placeholder="输入规则后回车添加" className="form-input h-10 text-sm" onKeyDown={(event) => { if (event.key === "Enter" && value.trim()) { event.preventDefault(); onChange([...items, value.trim()]); setValue(""); } }} /><button type="button" disabled={disabled || !value.trim()} onClick={() => { onChange([...items, value.trim()]); setValue(""); }} className="action-button h-10 disabled:opacity-40">添加</button></div></div>; }
function HandoffEditor({ items, onChange, disabled }: { items: string[]; onChange: (value: string[]) => void; disabled: boolean }) { return <div className="rounded-xl border border-[var(--border)] p-4 xl:col-span-2"><h3 className="text-sm font-semibold">人工接管规则</h3><p className="mt-1 text-xs text-[var(--text-muted)]">命中任一规则时，正式回复会标记为需人工确认，不自动替销售承诺。</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{items.map((item) => <label key={item} className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm"><input type="checkbox" checked onChange={() => onChange(items.filter((current) => current !== item))} disabled={disabled} />{item}</label>)}</div></div>; }
function TestResult({ result }: { result?: Generation }) { if (!result) return <div className="grid min-h-[360px] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-6 text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--navy)] text-white">AI</div><p className="mt-3 text-sm font-medium">测试结果将在这里分栏展示</p><p className="mt-1 text-xs text-[var(--text-muted)]">测试不会创建正式 assistant 消息</p></div></div>; const output = result.result as AgentOutput | null; return <div className="grid gap-3 md:grid-cols-2"><ResultCard title="企业知识 K 命中" tone="navy">{result.sources.length ? result.sources.map((source) => <div key={source.citation_key} className="border-b border-[var(--border)] py-2 last:border-0"><div className="flex justify-between text-xs font-semibold"><span>{source.citation_key} · {source.citation_label}</span><span>{Math.round(source.retrieval_score * 100)}%</span></div><p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{source.content_snapshot}</p></div>) : <EmptyResult text="未命中企业知识" />}</ResultCard><ResultCard title="销冠策略 S 命中" tone="gold">{result.champion_sources?.length ? result.champion_sources.map((source) => <div key={source.strategy_key} className="border-b border-[var(--border)] py-2 last:border-0"><div className="flex justify-between text-xs font-semibold"><span>{source.strategy_key} · {source.title_snapshot}</span><span>{Math.round(source.retrieval_score * 100)}%</span></div><p className="mt-1 text-xs text-[var(--text-muted)]">{source.strategy_snapshot}</p></div>) : <EmptyResult text="未命中已批准销冠策略" />}</ResultCard><ResultCard title="最终推荐回复" tone="navy"><p className="whitespace-pre-wrap text-sm leading-6">{result.reply_text || "—"}</p><p className="mt-3 text-xs text-[var(--text-muted)]">配置版本：草稿 v{result.config_version}</p></ResultCard><ResultCard title="客户分析和下一步建议" tone="navy"><p className="text-sm font-medium">{output?.customer_intent || "—"}</p><p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{output?.recommended_strategy || "—"}</p><p className="mt-2 text-xs">下一步：{output?.next_action || "—"}</p></ResultCard><ResultCard title="风险和人工接管结果" tone={result.need_human ? "risk" : "green"}><p className="text-sm font-semibold">{result.need_human ? "需要人工确认" : "可由智能体继续处理"}</p><p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{result.human_reason || (output?.risk_flags.length ? output.risk_flags.join("、") : "未发现需要升级的风险")}</p></ResultCard></div>; }
function ResultCard({ title, tone, children }: { title: string; tone: "navy" | "gold" | "risk" | "green"; children: ReactNode }) { return <article className={`rounded-xl border p-4 ${tone === "gold" ? "border-[#E4C99F] bg-[var(--gold-soft)]" : tone === "risk" ? "border-red-200 bg-red-50" : tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-[var(--border)] bg-white"}`}><h3 className="text-sm font-semibold">{title}</h3><div className="mt-3">{children}</div></article>; }
function EmptyResult({ text }: { text: string }) { return <p className="py-5 text-xs text-[var(--text-muted)]">{text}</p>; }
