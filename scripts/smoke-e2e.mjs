import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const candidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

let executablePath;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Try the next supported local browser location.
  }
}
if (!executablePath) throw new Error("未找到 Chrome/Chromium，请通过 CHROME_PATH 指定浏览器路径");

const stamp = `${Date.now()}`;
const first = {
  tenantName: `端到端企业 ${stamp}`,
  tenantCode: `e2e-${stamp}`,
  adminName: "端到端管理员",
  email: `admin-${stamp}@example.com`,
  password: "Test123456",
};
const second = {
  tenantName: `隔离验证企业 ${stamp}`,
  tenantCode: `isolation-${stamp}`,
  adminName: "隔离验证管理员",
  email: first.email,
  password: first.password,
};
const customerName = `客户-${stamp}`;
const companyName = `远航科技-${stamp}`;
const conversationTitle = `首次需求沟通-${stamp}`;
const customerMessage = `我们希望在本季度完成销售流程升级，编号 ${stamp}`;
const screenshotDir = path.resolve("test-results");

async function register(page, account) {
  await page.goto(`${baseURL}/register`);
  await page.getByLabel("企业名称").fill(account.tenantName);
  await page.getByLabel("企业编码").fill(account.tenantCode);
  await page.getByLabel("管理员姓名").fill(account.adminName);
  await page.getByLabel("管理员邮箱").fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByLabel("确认密码").fill(account.password);
  await page.getByRole("button", { name: "创建企业并进入工作台" }).click();
  await page.waitForURL(`${baseURL}/**`);
  await page.getByRole("button", { name: "退出登录" }).waitFor();
}

async function logout(page) {
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL(`${baseURL}/login*`);
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await register(page, first);
  const authCookie = (await context.cookies()).find((cookie) => cookie.name === "sales_agent_access_token");
  if (!authCookie?.httpOnly) throw new Error("JWT 未存放在 HttpOnly Cookie 中");
  const browserStorage = await page.evaluate(() => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    cookie: document.cookie,
  }));
  if (JSON.stringify(browserStorage).includes("access_token")) {
    throw new Error("浏览器可读存储中发现 access_token");
  }

  await page.getByRole("button", { name: "新建客户" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "新建客户" }).click();
  await page.locator("#customer-name").fill(customerName);
  await page.locator("#customer-company_name").fill(companyName);
  await page.locator("#customer-stage").fill("方案评估");
  await page.locator("#customer-expected_amount").fill("680000");
  await page.locator("#customer-deal_probability").fill("72");
  await page.getByRole("button", { name: "保存客户", exact: true }).click();
  await page.getByText(companyName, { exact: true }).first().waitFor();

  await page.getByRole("button", { name: "新建会话" }).click();
  await page.getByLabel("会话标题").fill(conversationTitle);
  await page.getByRole("button", { name: "创建会话" }).click();
  await page.getByLabel("选择会话").selectOption({ label: conversationTitle });

  await page.locator("textarea").last().fill(customerMessage);
  await page.getByRole("button", { name: "保存客户消息" }).click();
  await page.getByText(customerMessage, { exact: true }).waitFor();
  await page.getByRole("button", { name: "生成回复" }).click();
  await page.getByText(/推荐回复 · 生成置信度/).waitFor();
  await page.getByRole("button", { name: "保存到会话" }).click();
  await page.getByText("回复已保存到会话").waitFor();

  await page.reload();
  await page.getByText(customerMessage, { exact: true }).waitFor();
  await page.getByText(/AI 生成 · 人工已确认/).last().waitFor();
  const noHorizontalOverflow1440 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!noHorizontalOverflow1440) throw new Error("1440×900 出现页面级横向溢出");
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "dashboard-integration-1440.png") });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(200);
  const noHorizontalOverflow1920 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!noHorizontalOverflow1920) throw new Error("1920×1080 出现页面级横向溢出");
  await page.screenshot({ path: path.join(screenshotDir, "dashboard-integration-1920.png") });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "收起导航栏" }).click();
  const noHorizontalOverflow1280 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!noHorizontalOverflow1280) throw new Error("1280px 桌面宽度出现页面级横向溢出");

  await logout(page);
  await register(page, second);
  if (await page.getByText(customerName, { exact: true }).count()) {
    throw new Error("第二企业看到了第一企业客户，多租户隔离失败");
  }
  await logout(page);

  await page.getByLabel("企业编码").fill(first.tenantCode);
  await page.getByLabel("邮箱").fill(first.email);
  await page.getByLabel("密码", { exact: true }).fill(first.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(`${baseURL}/**`);
  await page.getByText(customerName, { exact: true }).first().waitFor();
  await page.getByText(customerMessage, { exact: true }).waitFor();

  await logout(page);
  await page.goto(baseURL);
  await page.waitForURL(`${baseURL}/login*`);

  console.log(JSON.stringify({
    success: true,
    checks: 15,
    tenantCode: first.tenantCode,
    isolationTenantCode: second.tenantCode,
    screenshots: [
      path.join(screenshotDir, "dashboard-integration-1440.png"),
      path.join(screenshotDir, "dashboard-integration-1920.png"),
    ],
  }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
