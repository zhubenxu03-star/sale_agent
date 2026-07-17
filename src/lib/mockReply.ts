import type { Customer } from "@/types/api";

export function buildLocalMockReply(customer: Customer, customerMessage: string): string {
  const company = customer.company_name || customer.name;
  const need = Array.isArray(customer.core_needs) && customer.core_needs.length
    ? `结合您关注的${customer.core_needs.slice(0, 2).join("和")}`
    : "结合您刚才提到的情况";
  const context = customerMessage.trim() ? "，我已经记录您刚才的重点" : "";
  return `${customer.name}您好${context}。${need}，我们建议先安排一次 30 分钟的方案梳理，明确现状、实施边界和预期指标，再为 ${company} 提供可核验的推进计划。您看本周哪天方便？`;
}
