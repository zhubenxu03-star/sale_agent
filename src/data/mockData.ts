import type {
  ChampionTip,
  ChatMessage,
  CustomerProfile,
  KnowledgeItem,
  Metric,
  NavItem,
  RecentCustomer,
  WorkflowStep,
} from "@/types";

export const navItems: NavItem[] = [
  { label: "销转工作台", icon: "dashboard", active: true },
  { label: "客户管理", icon: "customers", badge: "12" },
  { label: "知识库管理", icon: "knowledge" },
  { label: "转化分析", icon: "chart" },
];

navItems.splice(3, 0, { label: "智能体配置", icon: "brain" });

export const recentCustomers: RecentCustomer[] = [
  { name: "周明远", company: "云启科技", active: true },
  { name: "林舒雅", company: "拓维零售" },
  { name: "陈昊", company: "领辰咨询" },
];

export const metrics: Metric[] = [
  {
    label: "客户阶段",
    value: "方案评估期",
    helper: "已完成需求确认",
    tone: "navy",
  },
  {
    label: "意向评分",
    value: "82",
    helper: "较上次沟通 +6",
    tone: "success",
    progress: 82,
  },
  {
    label: "推荐策略",
    value: "价值锚定",
    helper: "聚焦 ROI 与落地周期",
    tone: "gold",
  },
  {
    label: "成交概率",
    value: "68%",
    helper: "预计 14 天内推进",
    tone: "neutral",
    progress: 68,
  },
];

export const messages: ChatMessage[] = [
  {
    id: 1,
    role: "customer",
    sender: "周明远",
    time: "10:24",
    content: "我们内部看过方案了，整体方向认可，但目前比较关注实际落地周期，以及能不能和现有 CRM 打通。",
  },
  {
    id: 2,
    role: "agent",
    sender: "我",
    time: "10:27",
    content: "理解，这两个点也是项目成功的关键。基于贵司目前的系统情况，我们可以先从核心销售流程切入，标准实施周期约 3–4 周，同时支持通过 API 与现有 CRM 对接。",
    tags: ["企业知识库", "实施方案 V3.2"],
  },
  {
    id: 3,
    role: "customer",
    sender: "周明远",
    time: "10:31",
    content: "3–4 周可以接受。你们之前有同体量、同类型客户的案例吗？老板会更关心投入后多久看到效果。",
  },
];

export const customerProfile: CustomerProfile = {
  name: "周明远",
  title: "销售运营总监",
  company: "杭州云启科技有限公司",
  phone: "138 **** 6721",
  location: "浙江 · 杭州",
  source: "官网咨询",
  demand: "销售流程提效、CRM 数据联动",
  budget: "20–30 万",
  decisionRole: "方案评估人",
};

export const enterpriseKnowledge: KnowledgeItem[] = [
  { title: "SaaS 企业客户成功案例集", meta: "案例库 · 2026 Q2", match: 96 },
  { title: "CRM 标准集成实施手册", meta: "产品文档 · V3.2", match: 92 },
];

export const championTips: ChampionTip[] = [
  {
    title: "用同规模案例降低决策风险",
    content: "先回应行业与体量相似性，再给出首月可量化指标，避免只谈长期价值。",
    tag: "案例引导",
  },
  {
    title: "推进下一步承诺",
    content: "建议顺势邀请决策人参与 30 分钟案例拆解会。",
    tag: "临门一脚",
  },
];

export const suggestedReply =
  "有的。我们去年服务过一家约 300 人规模的企业服务公司，业务模式和贵司很接近。项目第 3 周完成 CRM 对接并上线试点，首月销售跟进效率提升约 31%。我可以把完整案例和指标拆解发您，也建议约 30 分钟邀请您老板一起过一遍，重点只看投入、周期和回报，您看本周四下午方便吗？";

export const workflowSteps: WorkflowStep[] = [
  { label: "客户消息输入", icon: "clipboard" },
  { label: "调用大模型", icon: "brain" },
  { label: "检索企业知识库", icon: "building" },
  { label: "检索销冠知识库", icon: "crown" },
  { label: "生成回复", icon: "wand" },
];
