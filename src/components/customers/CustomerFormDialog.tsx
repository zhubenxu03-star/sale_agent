"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FormField, authInputClass } from "@/components/auth/AuthShell";
import { collectionToLines, customerFormSchema, linesToArray, type CustomerFormInput, type CustomerFormValues } from "@/schemas/customer";
import type { Customer, CustomerInput } from "@/types/api";

function defaults(customer?: Customer): CustomerFormValues {
  return {
    name: customer?.name || "", company_name: customer?.company_name || "", industry: customer?.industry || "", company_size: customer?.company_size || "", region: customer?.region || "", source: customer?.source || "", stage: customer?.stage || "",
    budget_min: customer?.budget_min === null || customer?.budget_min === undefined ? null : Number(customer.budget_min),
    budget_max: customer?.budget_max === null || customer?.budget_max === undefined ? null : Number(customer.budget_max),
    expected_amount: customer?.expected_amount === null || customer?.expected_amount === undefined ? null : Number(customer.expected_amount),
    expected_close_date: customer?.expected_close_date || "", deal_probability: customer?.deal_probability === null || customer?.deal_probability === undefined ? null : Number(customer.deal_probability),
    core_needs: collectionToLines(customer?.core_needs || null), pain_points: collectionToLines(customer?.pain_points || null), objections: collectionToLines(customer?.objections || null), notes: customer?.notes || "",
  };
}

export function CustomerFormDialog({ open, customer, pending, onClose, onSubmit }: { open: boolean; customer?: Customer; pending: boolean; onClose: () => void; onSubmit: (payload: CustomerInput) => Promise<void> }) {
  const form = useForm<CustomerFormInput, unknown, CustomerFormValues>({ resolver: zodResolver(customerFormSchema), defaultValues: defaults(customer) });
  useEffect(() => { if (open) form.reset(defaults(customer)); }, [open, customer, form]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name, company_name: values.company_name || null, industry: values.industry || null, company_size: values.company_size || null, region: values.region || null, source: values.source || null, stage: values.stage || null,
      budget_min: values.budget_min, budget_max: values.budget_max, expected_amount: values.expected_amount, expected_close_date: values.expected_close_date || null, deal_probability: values.deal_probability,
      core_needs: linesToArray(values.core_needs), pain_points: linesToArray(values.pain_points), objections: linesToArray(values.objections), notes: values.notes || null,
    });
  });
  const fields: Array<[keyof CustomerFormValues, string, string]> = [["name", "客户名称", "请输入客户名称"], ["company_name", "企业名称", "所在企业"], ["industry", "行业", "例如：企业服务"], ["company_size", "企业规模", "例如：100-300人"], ["region", "地区", "例如：浙江·杭州"], ["source", "客户来源", "例如：官网咨询"], ["stage", "销售阶段", "例如：方案评估"], ["expected_close_date", "预计成交日期", ""]];
  return <dialog open onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="customer-dialog-title" className="fixed inset-0 z-[80] m-auto w-[760px] max-w-[calc(100vw-48px)] rounded-2xl border border-[var(--border)] bg-white p-0 text-[var(--text)] shadow-2xl backdrop:bg-[rgba(10,24,40,0.42)]"><form onSubmit={submit} className="flex max-h-[86vh] flex-col"><div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4"><div><h2 id="customer-dialog-title" className="text-base font-semibold text-[var(--navy)]">{customer ? "编辑客户" : "新建客户"}</h2><p className="mt-1 text-[10px] text-[var(--text-muted)]">客户数据将自动归属当前企业</p></div><button type="button" onClick={onClose} aria-label="关闭客户表单" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">×</button></div><div className="chat-scroll grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto px-6 py-5">{fields.map(([name, label, placeholder]) => <FormField key={name} label={label} htmlFor={`customer-${name}`} error={form.formState.errors[name]?.message as string | undefined}><input id={`customer-${name}`} type={name === "expected_close_date" ? "date" : "text"} className={authInputClass} placeholder={placeholder} {...form.register(name)} /></FormField>)}
      {[["budget_min", "预算下限"], ["budget_max", "预算上限"], ["expected_amount", "预计成交金额"], ["deal_probability", "成交概率（0-100）"]].map(([name, label]) => <FormField key={name} label={label} htmlFor={`customer-${name}`} error={form.formState.errors[name as keyof CustomerFormValues]?.message as string | undefined}><input id={`customer-${name}`} type="number" step="0.01" className={authInputClass} {...form.register(name as "budget_min")} /></FormField>)}
      {[["core_needs", "核心需求"], ["pain_points", "当前痛点"], ["objections", "客户异议"]].map(([name, label]) => <div key={name} className="col-span-2"><FormField label={`${label}（每行一项）`} htmlFor={`customer-${name}`}><textarea id={`customer-${name}`} className="min-h-20 w-full resize-y rounded-xl border border-[var(--border-strong)] p-3 text-sm outline-none focus:border-[var(--champagne)]" {...form.register(name as "core_needs")} /></FormField></div>)}
      <div className="col-span-2"><FormField label="备注" htmlFor="customer-notes"><textarea id="customer-notes" className="min-h-20 w-full resize-y rounded-xl border border-[var(--border-strong)] p-3 text-sm outline-none focus:border-[var(--champagne)]" {...form.register("notes")} /></FormField></div></div><div className="flex justify-end gap-2 border-t border-[var(--border)] px-6 py-4"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs text-[var(--text-muted)]">取消</button><button type="submit" disabled={pending} className="h-9 rounded-lg bg-[var(--navy)] px-5 text-xs text-white disabled:opacity-50">{pending ? "保存中…" : "保存客户"}</button></div></form></dialog>;
}
