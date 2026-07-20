# 正式模型联调记录

## 自动化结果

- Provider：`DeterministicTestChatProvider`
- 用途：pytest、本地开发、端到端流程与故障恢复验证
- 外部网络：不访问
- 结论：结构化输出、引用约束、风险标记、人工接管、Token/耗时记录、SSE、幂等和多租户隔离均由自动化测试覆盖

测试 Provider 的输出质量不代表正式模型效果，界面会持续显示“测试模型模式”。

## 正式模型联调

正式联调仅从未提交的 `.env` 读取 `LLM_BASE_URL`、`LLM_API_KEY` 和 `LLM_MODEL`。当前仓库未配置真实 API Key，因此正式付费模型联调按设计跳过，不计为自动化失败。

配置完成后，使用少量问题人工核验：普通产品咨询、实施周期、价格、无知识依据、投诉退款、Prompt Injection。逐项确认引用来自本次 `generation_sources`、回复未编造企业事实、Token 与耗时已记录，且错误响应不包含 Prompt、知识全文、API Key 或堆栈。
