import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const tenantCode = process.env.E2E_TENANT_CODE;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!tenantCode || !email || !password) {
  throw new Error("请设置 E2E_TENANT_CODE、E2E_EMAIL 和 E2E_PASSWORD");
}

const stamp = Date.now();
const output = path.resolve("test-results", `sales-workspace-${stamp}`);
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

const checks = [];
const issues = { console: [], page: [], request: [], http: [] };
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  checks.push(message);
};

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (message) => {
  if (message.type() === "error") issues.console.push(message.text());
});
page.on("pageerror", (error) => issues.page.push(error.message));
page.on("requestfailed", (request) => {
  const text = `${request.method()} ${request.url()} ${request.failure()?.errorText}`;
  if (!text.includes("ERR_ABORTED")) issues.request.push(text);
});
page.on("response", (response) => {
  if (response.status() >= 400) issues.http.push({ status: response.status(), url: response.url() });
});

try {
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("企业编码").fill(tenantCode);
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login") && response.status() === 200),
    page.getByRole("button", { name: "登录", exact: true }).click(),
  ]);
  await page.waitForURL(`${baseURL}/**`);
  await page.goto(baseURL);
  await page.getByLabel("销售操作工作区").waitFor({ timeout: 30_000 });
  assert(await page.getByText("客户阶段", { exact: true }).isVisible(), "顶部摘要卡片正常展示");
  assert(await page.getByText("企业知识 K", { exact: true }).isVisible(), "底部流程包含企业知识 K");
  assert(await page.getByText("销冠策略 S", { exact: true }).isVisible(), "底部流程包含销冠策略 S");

  const resultBody = page.getByLabel("推荐回复正文");
  await resultBody.waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "收起", exact: true }).click();
  assert(await page.getByLabel("已收起的推荐回复").isVisible(), "生成结果可以收起并显示单行摘要");
  await page.getByRole("button", { name: "关闭推荐回复" }).click();
  assert(await page.getByText("最近一次生成结果已隐藏").isVisible(), "关闭结果只隐藏面板，不删除生成记录");
  await page.getByRole("button", { name: "查看最近生成" }).click();
  assert(await resultBody.isVisible(), "关闭后可以重新打开最近生成结果");

  const input = page.getByLabel("客户消息输入");
  const message = `首页布局验收 ${stamp}：服务具体包含什么？价格方面我还需要考虑。`;
  await input.fill(message);
  const saveResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/messages") && response.ok());
  await input.press("Enter");
  await saveResponse;
  await page.waitForFunction(() => {
    const element = document.querySelector('textarea[aria-label="客户消息输入"]');
    return element instanceof HTMLTextAreaElement && element.value === "";
  });
  assert((await input.inputValue()) === "", "Enter 可以保存客户消息并清空输入框");

  const generateResponse = page.waitForResponse((response) => response.url().includes("/api/agent/generate-stream") && response.status() === 200);
  await page.getByRole("button", { name: "生成回复", exact: true }).click();
  await generateResponse;
  await page.getByRole("button", { name: "保存到会话" }).waitFor({ timeout: 40_000 });
  assert(await page.getByLabel("推荐回复正文").isVisible(), "真实生成完成后结果区自动展开");
  assert(await page.getByText(/已用于当前回复|检索命中，未直接引用/).first().isVisible(), "企业知识 K 来源正常展示");
  assert(await page.getByText(/已用于当前策略|已批准策略/).first().isVisible(), "销冠策略 S 来源正常展示");

  const strategyRegenerate = page.getByRole("button", { name: "使用该策略重新生成" }).first();
  await strategyRegenerate.waitFor();
  const strategyResponse = page.waitForResponse((response) => response.url().includes("/api/agent/generate-stream") && response.status() === 200);
  await strategyRegenerate.click();
  await strategyResponse;
  await page.getByText("正在生成推荐回复").waitFor({ state: "hidden", timeout: 40_000 });
  assert(await page.getByLabel("推荐回复正文").isVisible(), "可从销冠策略卡片触发重新生成");

  for (const title of ["客户资料", "企业知识命中", "销冠策略命中"]) {
    await page.getByRole("button", { name: `收起${title}` }).click();
    assert(await page.getByRole("button", { name: `展开${title}` }).isVisible(), `${title}可以收起`);
    await page.getByRole("button", { name: `展开${title}` }).click();
  }
  await page.getByRole("button", { name: "收起上下文侧栏" }).click();
  assert(await page.getByRole("button", { name: "展开上下文侧栏" }).isVisible(), "右侧上下文栏可以整体折叠");
  await page.getByRole("button", { name: "展开上下文侧栏" }).click();

  const screenshots = [];
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    await page.getByText("AI 推荐回复", { exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.evaluate(() => {
      const interactive = [...document.querySelectorAll("button, input, select, textarea")];
      const clipped = interactive.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1);
      }).length;
      const floating = [...document.querySelectorAll("body *")].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.position === "fixed" && rect.width < 200 && rect.height < 200 && rect.top > window.innerHeight / 2;
      }).length;
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        clipped,
        floating,
      };
    });
    assert(layout.documentWidth <= layout.viewportWidth + 1 && layout.bodyWidth <= layout.viewportWidth + 1, `${viewport.width}×${viewport.height} 无页面级横向滚动`);
    assert(layout.clipped === 0, `${viewport.width}×${viewport.height} 交互控件未被横向裁切`);
    assert(layout.floating === 0, `${viewport.width}×${viewport.height} 无底部悬浮机器人遮挡`);
    const screenshot = path.join(output, `sales-workspace-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshot, fullPage: false });
    screenshots.push(screenshot);
  }

  assert(issues.console.length === 0, `浏览器 Console 无错误：${JSON.stringify(issues.console)}`);
  assert(issues.page.length === 0, "浏览器无 pageerror");
  assert(issues.request.length === 0, `浏览器无异常请求失败：${JSON.stringify(issues.request)}`);
  assert(issues.http.length === 0, `浏览器 Network 无 4xx/5xx：${JSON.stringify(issues.http)}`);

  const result = { success: true, checks: checks.length, address: baseURL, screenshots, checksList: checks, browser: issues };
  await writeFile(path.join(output, "workspace-layout-result.json"), JSON.stringify(result, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
