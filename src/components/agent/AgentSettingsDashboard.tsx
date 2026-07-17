"use client";

import { FormEvent, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { useToast } from "@/components/providers/AppProviders";
import { useCurrentUser } from "@/hooks/useAuth";
import { useAgentConfig, useDefaultAgent, useUpdateAgentConfig } from "@/hooks/useAgent";
import type { AgentConfig } from "@/types/api";

export function AgentSettingsDashboard() {
  const [collapsed, setCollapsed] = useState(false);
  const identity = useCurrentUser();
  const agent = useDefaultAgent();
  const config = useAgentConfig(agent.data?.id);
  const update = useUpdateAgentConfig(agent.data?.id);
  const [formState, setForm] = useState<AgentConfig>();
  const { showToast } = useToast();
  const form = formState || config.data;
  if (!identity.data) return null;
  const canEdit = identity.data.user.role !== "sales";
  const set = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form || !canEdit) return;
    try {
      const payload: Partial<AgentConfig> = { ...form };
      for (const key of ["id", "agent_id", "version", "updated_at"] as const) delete payload[key];
      setForm(await update.mutateAsync(payload));
      showToast("智能体配置已保存", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "配置保存失败", "error"); }
  };
  return <div className="min-h-screen bg-[var(--background)]">
    <Sidebar identity={identity.data} customers={[]} collapsed={collapsed} activeLabel="智能体配置" />
    <Header identity={identity.data} collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} title="销转智能体配置" subtitle="统一控制企业后续生成的回复风格、安全规则与知识检索参数" />
    <main className={`mt-16 min-h-[calc(100vh-64px)] p-[18px] transition-[margin] 2xl:p-6 ${collapsed ? "ml-[72px]" : "ml-[220px]"}`}><div className="mx-auto min-w-[1000px] max-w-[1500px] space-y-4">
      <div className="rounded-xl border border-[#E4C99F] bg-[var(--gold-soft)] px-4 py-3 text-[10px] text-[var(--gold-deep)]">配置变更将影响企业内后续生成的所有销转回复。历史生成记录不受影响。</div>
      {!form || agent.isPending ? <div className="panel-card p-8 text-center text-xs text-[var(--text-muted)]">正在加载智能体配置…</div> : <form onSubmit={submit} className="panel-card grid grid-cols-2 gap-5 p-6">
        <Field label="智能体名称"><input value={agent.data?.name || ""} disabled className="form-input" /></Field>
        <Field label="身份说明"><textarea value={form.identity_prompt} onChange={(e) => set("identity_prompt", e.target.value)} disabled={!canEdit} className="form-input min-h-20" /></Field>
        <Select label="回复风格" value={form.reply_style} onChange={(value) => set("reply_style", value as AgentConfig["reply_style"])} options={["consultative", "professional", "friendly", "concise", "conversion"]} disabled={!canEdit} />
        <Select label="回复长度" value={form.reply_length} onChange={(value) => set("reply_length", value as AgentConfig["reply_length"])} options={["short", "medium", "long"]} disabled={!canEdit} />
        <Select label="销售主动程度" value={form.sales_aggressiveness} onChange={(value) => set("sales_aggressiveness", value as AgentConfig["sales_aggressiveness"])} options={["low", "medium", "high"]} disabled={!canEdit} />
        <NumberField label="默认知识检索数量" value={form.default_top_k} min={1} max={20} step={1} onChange={(value) => set("default_top_k", value)} disabled={!canEdit} />
        <NumberField label="最低相关度" value={form.default_min_score} min={0} max={1} step={0.05} onChange={(value) => set("default_min_score", value)} disabled={!canEdit} />
        <NumberField label="温度" value={form.temperature} min={0} max={2} step={0.1} onChange={(value) => set("temperature", value)} disabled={!canEdit} />
        <NumberField label="最大输出长度" value={form.max_output_tokens} min={128} max={8000} step={128} onChange={(value) => set("max_output_tokens", value)} disabled={!canEdit} />
        <Field label="禁止承诺（每行一条）"><textarea value={form.prohibited_claims.join("\n")} onChange={(e) => set("prohibited_claims", e.target.value.split("\n").filter(Boolean))} disabled={identity.data.user.role !== "admin"} className="form-input min-h-24" /></Field>
        <Field label="人工接管规则（每行一条）"><textarea value={form.human_handoff_rules.join("\n")} onChange={(e) => set("human_handoff_rules", e.target.value.split("\n").filter(Boolean))} disabled={identity.data.user.role !== "admin"} className="form-input min-h-24" /></Field>
        <Field label="自定义说明"><textarea value={form.custom_instructions || ""} onChange={(e) => set("custom_instructions", e.target.value)} disabled={!canEdit} className="form-input min-h-24" /></Field>
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-[10px]"><label className="flex items-center gap-2"><input type="checkbox" checked={form.allow_emoji} onChange={(e) => set("allow_emoji", e.target.checked)} disabled={!canEdit} />允许表情</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.require_citations} onChange={(e) => set("require_citations", e.target.checked)} disabled={!canEdit} />强制知识引用</label><p className="text-[var(--text-muted)]">当前配置版本：v{form.version}</p></div>
        <div className="col-span-2 flex justify-end"><button type="submit" disabled={!canEdit || update.isPending} className="action-button action-button-gold h-9 disabled:opacity-40">{update.isPending ? "保存中…" : canEdit ? "保存配置" : "销售角色仅可查看"}</button></div>
      </form>}
    </div></main>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-2 text-[10px] font-medium text-[var(--navy)]"><span>{label}</span>{children}</label>; }
function Select({ label, value, options, onChange, disabled }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled: boolean }) { return <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="form-input">{options.map((option) => <option key={option}>{option}</option>)}</select></Field>; }
function NumberField({ label, value, min, max, step, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; disabled: boolean }) { return <Field label={label}><input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} className="form-input" /></Field>; }
