import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const stamp = Date.now();
const password = "Test123456";
const account = {
  tenantName: `编排中心真实验收 ${stamp}`,
  tenantCode: `agent-acceptance-${stamp}`,
  adminName: "验收管理员",
  adminEmail: `admin-${stamp}@example.com`,
  managerEmail: `manager-${stamp}@example.com`,
  salesEmail: `sales-${stamp}@example.com`,
};
const output = path.resolve("test-results", `agent-orchestration-real-${stamp}`);
await mkdir(output, { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {}
}
if (!executablePath) throw new Error("未找到 Chrome/Chromium");

const issues = { console: [], page: [], request: [], http: [] };
const checks = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  checks.push(message);
};
const observe = (page) => {
  page.on("console", (message) => {
    if (message.type() === "error") issues.console.push(message.text());
  });
  page.on("pageerror", (error) => issues.page.push(error.message));
  page.on("requestfailed", (request) =>
    issues.request.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      issues.http.push({ status: response.status(), url: response.url() });
    }
  });
};

async function api(page, url, { method = "GET", body } = {}) {
  const result = await page.evaluate(
    async ({ url, method, body }) => {
      const response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      return { status: response.status, payload };
    },
    { url, method, body },
  );
  if (result.status >= 400) {
    throw new Error(`${method} ${url} -> ${result.status}: ${result.payload?.message || "请求失败"}`);
  }
  return result.payload?.data;
}

async function rawApi(page, url, { method = "GET", body } = {}) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, payload: await response.json().catch(() => null) };
    },
    { url, method, body },
  );
}

async function register(page) {
  await page.goto(`${baseURL}/register`);
  await page.locator("#tenant_name").fill(account.tenantName);
  await page.locator("#tenant_code").fill(account.tenantCode);
  await page.locator("#admin_name").fill(account.adminName);
  await page.locator("#email").fill(account.adminEmail);
  await page.locator("#password").fill(password);
  await page.locator("#confirm_password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/register") && response.status() === 201),
    page.locator("form button[type=submit]").click(),
  ]);
  await page.getByRole("button", { name: "退出登录" }).waitFor();
}

async function login(page, email) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("企业编码").fill(account.tenantCode);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login") && response.status() === 200),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "退出登录" }).waitFor();
}

async function logout(page) {
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL(`${baseURL}/login*`);
}

function createRoleUsers(tenantId) {
  const source = [
    "import sys",
    "from uuid import UUID",
    "from sqlalchemy import select",
    "from app.core.security import hash_password",
    "from app.db.session import SessionLocal",
    "from app.models.user import User, UserRole, UserStatus",
    "tenant_id=UUID(sys.argv[1]); password=sys.argv[4]",
    "db=SessionLocal()",
    "for name,email,role in [('验收经理',sys.argv[2],UserRole.MANAGER),('验收销售',sys.argv[3],UserRole.SALES)]:",
    "    if db.scalar(select(User).where(User.tenant_id==tenant_id,User.email==email)) is None:",
    "        db.add(User(tenant_id=tenant_id,name=name,email=email,password_hash=hash_password(password),role=role,status=UserStatus.ACTIVE))",
    "db.commit(); db.close()",
  ].join("\n");
  const result = spawnSync(
    "docker",
    [
      "exec",
      "sales-agent-backend-1",
      "python",
      "-c",
      source,
      tenantId,
      account.managerEmail,
      account.salesEmail,
      password,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "创建角色账号失败");
}

async function uploadKnowledge(page, baseId, filename, displayName, content) {
  const result = await page.evaluate(
    async ({ baseId, filename, displayName, content }) => {
      const form = new FormData();
      form.append("knowledge_base_id", baseId);
      form.append("display_name", displayName);
      form.append("file", new File([content], filename, { type: "text/plain" }));
      const response = await fetch("/api/knowledge/documents/upload", {
        method: "POST",
        body: form,
      });
      return { status: response.status, payload: await response.json() };
    },
    { baseId, filename, displayName, content },
  );
  if (result.status !== 202) throw new Error(`上传 ${filename} 失败：${JSON.stringify(result)}`);
  return result.payload.data;
}

async function waitForKnowledgeReady(page, documentId) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const item = await api(page, `/api/knowledge/documents/${documentId}/status`);
    if (item.status === "ready") return item;
    if (item.status === "failed") throw new Error(`知识文件处理失败：${item.error_message}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`知识文件 ${documentId} 在 90 秒内未 ready`);
}

async function createChampionCard(page, payload) {
  const card = await api(page, "/api/champion/cards", { method: "POST", body: payload });
  const approved = await api(page, `/api/champion/cards/${card.id}/approve`, { method: "POST" });
  assert(approved.status === "approved", `${payload.title} 已通过正式审核接口变为 approved`);
  return approved;
}

async function openAdvanced(page, title) {
  const summary = page.locator("summary").filter({ hasText: title });
  const details = summary.locator("..");
  if (!(await details.evaluate((element) => element.open))) await summary.click();
}

async function saveDraft(page) {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "PUT" && response.url().includes("/api/agents/") && response.status() === 200,
  );
  await page.getByRole("button", { name: "保存草稿" }).click();
  await responsePromise;
  await page.getByText("草稿已保存", { exact: true }).waitFor();
}

async function publish(page) {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/config/publish") && response.status() === 200,
  );
  await page.getByRole("button", { name: "发布配置" }).click();
  await responsePromise;
  await page.getByText("配置已发布", { exact: true }).waitFor();
}

async function restore(page) {
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/config/restore") && response.status() === 200,
  );
  await page.getByRole("button", { name: "恢复已发布" }).click();
  await responsePromise;
  await page.getByText("已恢复最近发布版本", { exact: true }).waitFor();
}

async function setConfig(page, { name, style, length, maxTokens }) {
  await page.getByLabel("智能体名称").fill(name);
  await page.getByLabel("回复风格").selectOption(style);
  await page.getByLabel("回复长度").selectOption(length);
  await openAdvanced(page, "企业检索高级设置");
  await page.getByLabel("最低相关度").fill("0");
  await page.getByLabel("最低匹配度").fill("0");
  await openAdvanced(page, "模型与响应高级设置");
  await page.getByLabel("最大输出长度").fill(String(maxTokens));
}

async function formalGenerateAndSave(page, ids) {
  await page.goto(`${baseURL}/?customer=${ids.customerId}&conversation=${ids.conversationId}`);
  await page.getByRole("button", { name: "生成回复" }).waitFor();
  const stream = page.waitForResponse(
    (response) => response.url().includes("/api/agent/generate-stream") && response.status() === 200,
  );
  await page.getByRole("button", { name: "生成回复" }).click();
  await stream;
  await page.getByText("AI 推荐回复", { exact: true }).waitFor({ timeout: 30_000 });
  const generationPage = await api(
    page,
    `/api/agent/generations?conversation_id=${ids.conversationId}&page_size=1`,
  );
  const generation = generationPage.items[0];
  const review = page.getByLabel("我已完成必要的人工审核");
  if (await review.count()) await review.check();
  const saveResponse = page.waitForResponse(
    (response) => response.url().includes(`/generations/${generation.id}/save-message`) && response.status() === 200,
  );
  await page.getByRole("button", { name: "保存到会话" }).click();
  await saveResponse;
  await page.getByText("回复已保存到会话", { exact: true }).waitFor();
  return generation;
}

async function addCustomerMessage(page, conversationId, content) {
  return api(page, `/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { sender_type: "customer", content, metadata_json: null },
  });
}

async function visualCheck(page, width, height, filename) {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseURL}/settings/agent`);
  await page.getByRole("heading", { name: "销转智能体编排中心" }).waitFor();
  await page.getByLabel("智能体名称").waitFor();
  const layout = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("button,input,select,textarea")];
    const viewportWidth = window.innerWidth;
    return {
      overflow: document.documentElement.scrollWidth > viewportWidth,
      clipped: controls
        .map((element) => ({
          label: element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || element.tagName,
          rect: element.getBoundingClientRect().toJSON(),
        }))
        .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1)),
      robot: [...document.querySelectorAll("body *")].some((element) =>
        /robot|机器人/i.test(`${element.id} ${element.className}`),
      ),
    };
  });
  assert(!layout.overflow, `${width}×${height} 无页面级横向滚动`);
  assert(layout.clipped.length === 0, `${width}×${height} 控件未被横向裁切`);
  assert(!layout.robot, `${width}×${height} 无机器人悬浮遮挡元素`);
  const screenshot = path.join(output, filename);
  await page.screenshot({ path: screenshot, fullPage: true });
  return screenshot;
}

const browser = await chromium.launch({ executablePath, headless: true });
let context;
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  observe(page);
  await register(page);
  const identity = await api(page, "/api/auth/me");
  createRoleUsers(identity.tenant.id);
  assert(identity.user.role === "admin", "管理员通过真实注册与登录态进入系统");

  const bases = await api(page, "/api/knowledge/bases");
  const baseId = bases[0].id;
  const productText =
    "星河增长课程与服务包含业务需求诊断、销售流程设计、CRM系统配置、管理者工作坊、销售团队实战培训和上线陪跑。标准实施周期为六周，交付物包括诊断报告、实施方案、培训课件和阶段复盘。该资料仅描述企业产品与服务事实，不包含销售话术或成交策略。";
  const priceText =
    "星河增长标准服务价格为人民币 98,000 元，包含需求诊断、两场管理者工作坊、四场销售培训、系统配置与六周上线陪跑。报价有效期为三十天，任何额外折扣必须经过商务审批，未经批准不得承诺最低价。该资料属于企业价格与服务政策。";
  const productDoc = await uploadKnowledge(page, baseId, "product-course.txt", "课程与产品介绍", productText);
  const priceDoc = await uploadKnowledge(page, baseId, "price-service.txt", "价格与服务说明", priceText);
  const readyDocs = await Promise.all([
    waitForKnowledgeReady(page, productDoc.id),
    waitForKnowledgeReady(page, priceDoc.id),
  ]);
  assert(readyDocs.every((item) => item.chunk_count > 0), "两条企业知识 K 均经 Celery 处理为 ready 且产生知识片段");

  const baseCard = {
    applicable_industries: ["企业服务"],
    applicable_sales_stages: ["quotation"],
    applicable_customer_sentiments: ["hesitant"],
    trigger_patterns: ["价格有点贵", "需要考虑", "服务包含什么"],
    customer_intent: "了解服务范围并评估投入产出",
    customer_objection: "价格偏高，需要进一步考虑",
    customer_example: "你们的服务具体包含什么？价格有点贵，我需要考虑。",
    why_it_works: "先承接顾虑，再把投入拆解到可验证的业务结果，降低决策压力。",
    recommended_next_action: "确认优先场景并约定方案演示",
    suggested_question: "您更希望先验证哪个业务场景的投入产出？",
    tone_tags: ["专业", "共情", "克制"],
    risk_notes: ["不得承诺未经审批的价格或折扣"],
    outcome: "won",
    historical_success_rate: 0.9,
    quality_score: 95,
    admin_score: 95,
  };
  const strategyCard = await createChampionCard(page, {
    ...baseCard,
    title: "价值塑造：把服务范围与业务结果关联",
    card_type: "value_proposition",
    salesperson_reply: "理解您需要评估投入。我们可以把服务范围逐项对应到业务目标，并先确认最优先的改进场景。",
    strategy_summary: "用企业事实说明服务范围，再把投入拆解为可验证的阶段目标。",
  });
  const objectionCard = await createChampionCard(page, {
    ...baseCard,
    title: "价格异议：先拆解价值再推进小范围验证",
    card_type: "objection_handling",
    salesperson_reply: "价格顾虑很正常，我们先不急着做决定，可以从一个优先场景开始验证投入产出。",
    strategy_summary: "先共情价格顾虑，再用小范围验证降低客户的决策风险。",
  });

  const customer = await api(page, "/api/customers", {
    method: "POST",
    body: {
      name: "真实验收客户",
      company_name: "远山制造有限公司",
      industry: "企业服务",
      stage: "quotation",
      core_needs: ["了解服务范围", "评估投入产出"],
      objections: ["价格偏高"],
    },
  });
  const conversation = await api(page, "/api/conversations", {
    method: "POST",
    body: { customer_id: customer.id, title: "编排中心真实数据验收" },
  });
  const acceptanceMessage = "你们这个服务具体包含什么？价格有点贵，我还需要考虑一下。";
  await addCustomerMessage(page, conversation.id, acceptanceMessage);
  const ids = { customerId: customer.id, conversationId: conversation.id };

  const knowledgeSearch = await api(page, "/api/knowledge/search", {
    method: "POST",
    body: { query: acceptanceMessage, knowledge_base_id: baseId, top_k: 6, min_score: 0 },
  });
  const championSearch = await api(page, "/api/champion/search", {
    method: "POST",
    body: {
      query: acceptanceMessage,
      customer_id: customer.id,
      conversation_id: conversation.id,
      industry: "企业服务",
      sales_stage: "quotation",
      top_k: 4,
      min_score: 0,
    },
  });
  assert(knowledgeSearch.results.length >= 2, "真实 K 检索命中产品/课程与价格/服务两类资料");
  assert(championSearch.length >= 2, "真实 S 检索只命中两条 approved 销冠卡片");

  const agent = await api(page, "/api/agents/default");
  await page.goto(`${baseURL}/settings/agent`);
  await page.getByRole("heading", { name: "销转智能体编排中心" }).waitFor();
  await setConfig(page, { name: "企业销售顾问", style: "professional", length: "short", maxTokens: 512 });
  await saveDraft(page);
  await publish(page);
  const versionA = await api(page, `/api/agents/${agent.id}/config`);
  assert(versionA.published_config_json === undefined, "配置响应不泄露内部发布 JSON 快照");
  assert(versionA.agent_name === "企业销售顾问" && versionA.reply_length === "short", "版本 A 已发布为专业、简洁配置");

  await setConfig(page, { name: "老黄销售助手", style: "friendly", length: "long", maxTokens: 3072 });
  await saveDraft(page);
  const versionB = await api(page, `/api/agents/${agent.id}/config`);
  assert(versionB.agent_name === "老黄销售助手" && versionB.published_version === versionA.published_version, "草稿 B 已保存但发布版本仍保持 A");

  const messagesBeforeTest = await api(page, `/api/conversations/${conversation.id}/messages`);
  await page.getByLabel("测试客户消息").fill(acceptanceMessage);
  const testResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/agent/test-generate") && response.status() === 200,
  );
  await page.getByRole("button", { name: "运行配置测试" }).click();
  const testResponse = await testResponsePromise;
  const testGeneration = (await testResponse.json()).data;
  await page.getByText("最终推荐回复", { exact: true }).waitFor();
  assert(testGeneration.generation_type === "test", "测试台生成记录标记为 test");
  assert(testGeneration.config_version === versionB.draft_version, "测试台生成使用草稿版本 B");
  assert(testGeneration.sources.length >= 2, "测试台返回真实企业知识 K 来源");
  assert(testGeneration.champion_sources.length >= 2, "测试台返回真实 approved 销冠策略 S 来源");
  assert(testGeneration.reply_text.includes("98,000") || testGeneration.reply_text.includes("上线陪跑"), "最终回复体现 K 中的价格或服务事实");
  assert(testGeneration.result.champion_methods_used.length > 0, "最终回复记录实际使用的 S 销冠方法");
  const messagesAfterTest = await api(page, `/api/conversations/${conversation.id}/messages`);
  assert(messagesAfterTest.length === messagesBeforeTest.length, "测试生成前后正式会话消息数量完全一致");
  const testSave = await rawApi(page, `/api/agent/generations/${testGeneration.id}/save-message`, {
    method: "POST",
    body: { reply_text: testGeneration.reply_text, confirmed_human_review: true },
  });
  assert(testSave.status === 409 && testSave.payload.error_code === "TEST_GENERATION_NOT_SAVABLE", "后端明确拒绝把 test generation 保存到正式会话");

  const handoffTest = await api(page, "/api/agent/test-generate", {
    method: "POST",
    body: {
      request_id: `handoff-${stamp}`,
      agent_id: agent.id,
      customer_id: customer.id,
      conversation_id: conversation.id,
      customer_message: "请保证效果，否则我要找人工负责人处理。",
      sales_stage: "quotation",
      mode: "standard",
      use_enterprise_knowledge: true,
      use_champion_knowledge: true,
    },
  });
  assert(handoffTest.need_human && handoffTest.human_reason.includes("人工接管规则"), "配置化人工接管规则参与 need_human 判断");
  assert(handoffTest.result.risk_flags.includes("SECURITY_COMMITMENT"), "禁止承诺规则参与风险判断");

  const formalA = await formalGenerateAndSave(page, ids);
  assert(formalA.config_version === versionA.published_version, "草稿 B 未发布时正式生成继续使用已发布版本 A");
  assert(formalA.generation_type === "standard", "正式聊天生成记录标记为 standard");
  const messagesAfterFormalA = await api(page, `/api/conversations/${conversation.id}/messages`);
  assert(messagesAfterFormalA.some((item) => item.sender_type === "assistant" && item.generation_id === formalA.id), "正式生成经人工确认后创建 assistant 消息");

  await page.goto(`${baseURL}/settings/agent`);
  await publish(page);
  const publishedB = await api(page, `/api/agents/${agent.id}/config`);
  assert(publishedB.published_version === versionB.draft_version, "发布草稿 B 后 published_version 正确递进");
  await addCustomerMessage(page, conversation.id, "我理解了服务范围，请再说明价格与小范围验证怎么推进。 ");
  const formalB = await formalGenerateAndSave(page, ids);
  assert(formalB.config_version === publishedB.published_version, "发布后正式生成改用版本 B");
  assert(formalA.config_version === versionA.published_version, "历史 generation 的版本 A 记录未被新发布修改");

  await page.goto(`${baseURL}/settings/agent`);
  await setConfig(page, { name: "临时草稿 C", style: "conversion", length: "medium", maxTokens: 1536 });
  await saveDraft(page);
  const versionC = await api(page, `/api/agents/${agent.id}/config`);
  assert(versionC.draft_version > publishedB.published_version && versionC.agent_name === "临时草稿 C", "未发布草稿 C 已生成独立草稿版本");
  await restore(page);
  const restored = await api(page, `/api/agents/${agent.id}/config`);
  assert(restored.agent_name === "老黄销售助手" && restored.reply_style === "friendly", "恢复操作把草稿内容恢复为已发布版本 B");
  assert(restored.draft_version > versionC.draft_version && restored.published_version === publishedB.published_version, "恢复后草稿版本递增且已发布版本保持不变");
  await page.reload();
  await page.getByRole("heading", { name: "销转智能体编排中心" }).waitFor();
  assert((await page.getByLabel("智能体名称").inputValue()) === "老黄销售助手", "刷新浏览器后恢复状态未丢失");

  await logout(page);
  await login(page, account.managerEmail);
  await page.goto(`${baseURL}/settings/agent`);
  await page.getByRole("heading", { name: "销转智能体编排中心" }).waitFor();
  await page.getByRole("button", { name: "保存草稿" }).waitFor();
  assert((await page.getByRole("button", { name: "保存草稿" }).count()) === 1, "manager 可以看到保存草稿操作");
  assert((await page.getByRole("button", { name: "发布配置" }).count()) === 1, "manager 可以看到发布操作");
  assert(await page.getByLabel("身份说明").isDisabled(), "manager 不能编辑管理员专属身份安全说明");
  await saveDraft(page);
  await publish(page);
  const managerPublished = await api(page, `/api/agents/${agent.id}/config`);
  const repeatVersion = managerPublished.published_version;
  await publish(page);
  const repeated = await api(page, `/api/agents/${agent.id}/config`);
  assert(repeated.published_version === repeatVersion, "重复发布同一草稿不会产生异常版本跳变");

  await logout(page);
  await login(page, account.salesEmail);
  await page.goto(`${baseURL}/settings/agent`);
  await page.getByRole("heading", { name: "销转智能体编排中心" }).waitFor();
  assert((await page.getByRole("button", { name: "保存草稿" }).count()) === 0, "sales 页面不显示保存草稿按钮");
  assert((await page.getByRole("button", { name: "发布配置" }).count()) === 0, "sales 页面不显示发布按钮");
  assert((await page.getByRole("button", { name: "恢复已发布" }).count()) === 0, "sales 页面不显示恢复按钮");
  assert(await page.getByLabel("智能体名称").isDisabled(), "sales 配置表单为只读");
  const salesUpdate = await rawApi(page, `/api/agents/${agent.id}/config`, { method: "PUT", body: { reply_style: "friendly" } });
  const salesPublish = await rawApi(page, `/api/agents/${agent.id}/config/publish`, { method: "POST" });
  const salesRestore = await rawApi(page, `/api/agents/${agent.id}/config/restore`, { method: "POST" });
  assert([salesUpdate.status, salesPublish.status, salesRestore.status].every((status) => status === 403), "sales 绕过前端直接请求保存、发布和恢复均被后端 403 拒绝");

  await logout(page);
  await login(page, account.adminEmail);
  const screenshots = [
    await visualCheck(page, 1280, 720, "agent-orchestration-1280x720.png"),
    await visualCheck(page, 1440, 900, "agent-orchestration-1440x900.png"),
    await visualCheck(page, 1920, 1080, "agent-orchestration-1920x1080.png"),
  ];
  const requiredSections = ["一、基础身份", "二、企业知识库", "三、销冠知识库", "四、回复和安全规则", "五、测试与发布"];
  for (const section of requiredSections) {
    assert((await page.getByText(section, { exact: true }).count()) > 0, `页面清晰展示${section}`);
  }
  const workflow = await page.locator("main").innerText();
  for (const label of ["客户消息", "企业知识检索", "销冠策略检索", "大模型融合", "风险校验", "生成回复"]) {
    assert(workflow.includes(label), `顶部流程包含“${label}”`);
  }

  const expectedHttp = issues.http.filter(
    ({ status, url }) =>
      (status === 403 && url.includes("/api/agents/")) ||
      (status === 409 && url.includes(`/generations/${testGeneration.id}/save-message`)),
  );
  const unexpectedHttp = issues.http.filter((item) => !expectedHttp.includes(item));
  const expectedConsole = issues.console.filter((message) =>
    /Failed to load resource.*(?:403|409)/i.test(message),
  );
  const unexpectedConsole = issues.console.filter((message) => !expectedConsole.includes(message));
  const expectedRequestFailures = issues.request.filter((message) => /ERR_ABORTED|NS_BINDING_ABORTED/i.test(message));
  const unexpectedRequestFailures = issues.request.filter((message) => !expectedRequestFailures.includes(message));
  assert(unexpectedConsole.length === 0, `浏览器 Console 无未处理 error：${JSON.stringify(unexpectedConsole)}`);
  assert(issues.page.length === 0, "浏览器无 pageerror");
  assert(unexpectedRequestFailures.length === 0, `浏览器无非导航取消类 requestfailed：${JSON.stringify(unexpectedRequestFailures)}`);
  assert(unexpectedHttp.length === 0, `浏览器 Network 无非预期 4xx/5xx：${JSON.stringify(unexpectedHttp)}`);

  const result = {
    success: true,
    checks: checks.length,
    address: `${baseURL}/settings/agent`,
    route: "/settings/agent",
    account: { ...account, password },
    tenantId: identity.tenant.id,
    agentId: agent.id,
    customerId: customer.id,
    conversationId: conversation.id,
    knowledge: readyDocs.map((item) => ({ id: item.id, name: item.display_name, status: item.status, chunks: item.chunk_count })),
    champion: [strategyCard, objectionCard].map((item) => ({ id: item.id, title: item.title, type: item.card_type, status: item.status })),
    versions: {
      A: versionA.published_version,
      B_draft: versionB.draft_version,
      B_published: publishedB.published_version,
      C_draft: versionC.draft_version,
      restored_draft: restored.draft_version,
      final_published: repeated.published_version,
    },
    generations: {
      test: { id: testGeneration.id, config_version: testGeneration.config_version },
      handoff_test: { id: handoffTest.id, config_version: handoffTest.config_version },
      formal_A: { id: formalA.id, config_version: formalA.config_version },
      formal_B: { id: formalB.id, config_version: formalB.config_version },
    },
    messageCounts: {
      beforeTest: messagesBeforeTest.length,
      afterTest: messagesAfterTest.length,
      afterFormalA: messagesAfterFormalA.length,
    },
    screenshots,
    browser: {
      consoleErrors: issues.console,
      expectedConsole,
      unexpectedConsole,
      pageErrors: issues.page,
      requestFailures: issues.request,
      expectedRequestFailures,
      unexpectedRequestFailures,
      expectedHttp,
      unexpectedHttp,
    },
    checksList: checks,
  };
  await writeFile(path.join(output, "acceptance-result.json"), JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context?.close();
  await browser.close();
}
