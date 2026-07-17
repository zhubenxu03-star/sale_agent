import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const candidates = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
if (!executablePath) throw new Error("未找到 Chrome/Chromium，请通过 CHROME_PATH 指定。");

const stamp = Date.now();
const account = { tenantName: `智能体企业 ${stamp}`, tenantCode: `agent-e2e-${stamp}`, adminName: "管理员", email: `agent-${stamp}@example.com`, password: "Test123456" };
const output = path.resolve("test-results", `agent-${stamp}`);
await mkdir(output, { recursive: true });

for (let attempt = 0; attempt < 60; attempt += 1) {
  try { if ((await fetch("http://localhost:8000/health")).ok) break; } catch {}
  if (attempt === 59) throw new Error("后端健康检查未就绪");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function register(page) {
  await page.goto(`${baseURL}/register`);
  await page.getByLabel("企业名称").fill(account.tenantName);
  await page.getByLabel("企业编码").fill(account.tenantCode);
  await page.getByLabel("管理员姓名").fill(account.adminName);
  await page.getByLabel("管理员邮箱").fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByLabel("确认密码").fill(account.password);
  await page.getByRole("button", { name: "创建企业并进入工作台" }).click();
  await page.getByRole("button", { name: "退出登录" }).waitFor();
}

async function assertNoOverflow(page, label) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!fits) throw new Error(`${label} 出现页面级横向溢出`);
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await register(page);
  const ids = await page.evaluate(async () => {
    const request = async (url, body) => {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      return payload.data;
    };
    const customer = await request("/api/customers", { name: "智能体测试客户", company_name: "测试客户企业", stage: "needs_discovery", core_needs: ["确认解决方案"] });
    const conversation = await request("/api/conversations", { customer_id: customer.id, title: "智能体生成验证" });
    await request(`/api/conversations/${conversation.id}/messages`, { sender_type: "customer", content: "我们想先了解方案如何匹配业务场景", metadata_json: null });
    return { customer: customer.id, conversation: conversation.id };
  });
  await page.goto(`${baseURL}/?customer=${ids.customer}&conversation=${ids.conversation}`);
  await page.getByText("测试模型模式：用于流程验证，不代表真实模型回复质量").waitFor();
  await page.getByRole("button", { name: "生成回复" }).click();
  await page.getByText(/推荐回复 · 生成置信度/).waitFor({ timeout: 30_000 });
  await page.getByText("NO_RELIABLE_KNOWLEDGE").waitFor();
  await page.getByRole("button", { name: "赞", exact: true }).click();
  await page.getByRole("button", { name: "保存到会话" }).click();
  await page.getByText("回复已保存到会话").waitFor();
  await page.reload();
  await page.getByText(/AI 生成 · 人工已确认/).waitFor();
  await page.getByText(/推荐回复 · 生成置信度/).waitFor();
  await assertNoOverflow(page, "1440×900");
  await page.screenshot({ path: path.join(output, "workbench-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertNoOverflow(page, "1920×1080");
  await page.screenshot({ path: path.join(output, "workbench-1920.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "收起导航栏" }).click();
  await assertNoOverflow(page, "1280px");
  await page.goto(`${baseURL}/settings/agent`);
  await page.getByText("配置变更将影响企业内后续生成的所有销转回复。历史生成记录不受影响。").waitFor();
  await page.getByText(/当前配置版本：v\d+/).waitFor();
  console.log(JSON.stringify({ success: true, checks: 14, tenantCode: account.tenantCode, screenshots: [path.join(output, "workbench-1440.png"), path.join(output, "workbench-1920.png")] }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
