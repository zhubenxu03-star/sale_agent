import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
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
if (!executablePath)
  throw new Error("未找到 Chrome/Chromium，请通过 CHROME_PATH 指定。");

const stamp = `${Date.now()}`;
const first = {
  tenantName: `知识库企业A ${stamp}`,
  tenantCode: `knowledge-a-${stamp}`,
  adminName: "企业A管理员",
  email: `knowledge-${stamp}@example.com`,
  password: "Test123456",
};
const second = {
  tenantName: `知识库企业B ${stamp}`,
  tenantCode: `knowledge-b-${stamp}`,
  adminName: "企业B管理员",
  email: first.email,
  password: first.password,
};
const marker = `KB-${stamp}`;
const output = path.resolve("test-results", `knowledge-${stamp}`);
await mkdir(output, { recursive: true });
const healthURL = process.env.E2E_BACKEND_HEALTH_URL || "http://localhost:8000/health";
let backendReady = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(healthURL);
    if (response.ok) {
      backendReady = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
if (!backendReady) throw new Error("后端健康检查未就绪。");
const python =
  process.env.E2E_PYTHON ||
  path.resolve("backend", ".venv", "Scripts", "python.exe");
const generated = spawnSync(
  python,
  [path.resolve("scripts", "generate-knowledge-fixtures.py"), output, marker],
  { stdio: "inherit" },
);
if (generated.status !== 0) throw new Error("知识库测试文件生成失败。");

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

async function login(page, account) {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("企业编码").fill(account.tenantCode);
  await page.getByLabel("邮箱").fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "退出登录" }).waitFor();
}

async function logout(page) {
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL(`${baseURL}/login*`);
}

async function waitForReady(page, count) {
  await page.waitForFunction(
    ({ expected }) =>
      [...document.querySelectorAll("tbody tr")].filter((row) =>
        row.textContent?.includes("已完成"),
      ).length >= expected,
    { expected: count },
    { timeout: 90_000 },
  );
}

async function assertNoPageOverflow(page, label) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  if (!fits) throw new Error(`${label} 出现页面级横向溢出。`);
}

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await register(page, first);
  await page.goto(`${baseURL}/knowledge`);
  await page
    .getByRole("heading", { name: "企业知识库", exact: true })
    .first()
    .waitFor();
  const chooseFiles = page.getByRole("button", { name: "选择文件" });
  await chooseFiles.waitFor();
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "选择文件",
      )?.disabled,
  );
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      path.join(output, "enterprise-guide.txt"),
      path.join(output, "delivery-plan.docx"),
      path.join(output, "service-guide.pdf"),
    ]);
  await page.getByText("上传成功，等待处理", { exact: true }).first().waitFor();
  await waitForReady(page, 3);

  await page.getByLabel("测试问题").fill(`企业专属编号 ${marker}`);
  await page.getByLabel("最低相关度").fill("0.6");
  await page.getByRole("button", { name: "开始检索" }).click();
  await page.getByText("enterprise-guide.txt", { exact: true }).last().waitFor();

  const workbench = await page.evaluate(
    async ({ marker }) => {
      const request = async (url, body) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(`${url}: ${payload.message}`);
        return payload.data;
      };
      const customer = await request("/api/customers", {
        name: `知识检索客户-${marker}`,
        company_name: `知识检索企业-${marker}`,
        stage: "方案评估",
      });
      const conversation = await request("/api/conversations", {
        customer_id: customer.id,
        title: `知识检索会话-${marker}`,
      });
      await request(`/api/conversations/${conversation.id}/messages`, {
        sender_type: "customer",
        content: `企业专属编号 ${marker}`,
        metadata_json: null,
      });
      return { customerId: customer.id, conversationId: conversation.id };
    },
    { marker },
  );
  await page.goto(
    `${baseURL}/?customer=${workbench.customerId}&conversation=${workbench.conversationId}`,
  );
  await page.getByRole("button", { name: "根据最新客户消息检索" }).click();
  await page.getByText("企业知识检索结果", { exact: true }).waitFor();
  await page.getByText(/enterprise-guide.txt/).first().waitFor();
  await page.goto(`${baseURL}/knowledge`);

  await page.reload();
  await waitForReady(page, 3);
  await assertNoPageOverflow(page, "1440×900");
  await page.screenshot({
    path: path.join(output, "knowledge-1440.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertNoPageOverflow(page, "1920×1080");
  await page.screenshot({
    path: path.join(output, "knowledge-1920.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "收起导航栏" }).click();
  await assertNoPageOverflow(page, "1280px");

  await logout(page);
  await register(page, second);
  await page.goto(`${baseURL}/knowledge`);
  if (await page.getByText("enterprise-guide.txt", { exact: true }).count()) {
    throw new Error("企业B看到了企业A的文件。");
  }
  await page.getByLabel("测试问题").fill(`企业专属编号 ${marker}`);
  await page.getByLabel("最低相关度").fill("0.6");
  await page.getByRole("button", { name: "开始检索" }).click();
  await page.getByText("没有检索到达到当前相关度要求的企业资料。").waitFor();

  await logout(page);
  await login(page, first);
  await page.goto(`${baseURL}/knowledge`);
  const row = page.locator("tbody tr").filter({ hasText: "enterprise-guide" });
  await row.waitFor();
  await row.getByRole("button", { name: "删除" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认删除" })
    .click();
  await row.waitFor({ state: "detached" });
  await page.getByLabel("测试问题").fill(`企业专属编号 ${marker}`);
  await page.getByLabel("最低相关度").fill("0.8");
  await page.getByRole("button", { name: "开始检索" }).click();
  await page.getByText("没有检索到达到当前相关度要求的企业资料。").waitFor();

  console.log(
    JSON.stringify(
      {
        success: true,
        checks: 18,
        tenantCode: first.tenantCode,
        isolationTenantCode: second.tenantCode,
        screenshots: [
          path.join(output, "knowledge-1440.png"),
          path.join(output, "knowledge-1920.png"),
        ],
      },
      null,
      2,
    ),
  );
  await context.close();
} finally {
  await browser.close();
}
