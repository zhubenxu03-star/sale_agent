import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const candidates = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
if (!executablePath) throw new Error("Chrome/Chromium not found");
const stamp = Date.now();
const account = { tenantName: `Orchestration ${stamp}`, tenantCode: `orchestration-${stamp}`, adminName: "Admin", email: `orchestration-${stamp}@example.com`, password: "Test123456" };
const output = path.resolve("test-results", `agent-settings-${stamp}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/register`);
  await page.locator("#tenant_name").fill(account.tenantName);
  await page.locator("#tenant_code").fill(account.tenantCode);
  await page.locator("#admin_name").fill(account.adminName);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("#confirm_password").fill(account.password);
  await page.locator("form button[type=submit]").click();
  await page.waitForTimeout(1500);
  console.log("after-register", page.url(), await page.locator("body").innerText());
  await page.goto(`${baseURL}/settings/agent`);
  console.log("settings-url", page.url());
  await page.getByRole("heading", { name: "销转智能体编排中心" }).waitFor();
  await page.getByText("一、基础身份").waitFor();
  await page.getByText("二、企业知识库").waitFor();
  await page.getByText("三、销冠知识库").waitFor();
  await page.getByText("四、回复和安全规则").waitFor();
  await page.getByText("五、测试与发布").waitFor();
  const assertNoOverflow = async (label) => { if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) throw new Error(`${label} horizontal overflow`); };
  await assertNoOverflow("1440x900");
  await page.screenshot({ path: path.join(output, "settings-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await assertNoOverflow("1920x1080");
  await page.screenshot({ path: path.join(output, "settings-1920.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow("1280");
  console.log(JSON.stringify({ success: true, checks: 10, screenshots: [path.join(output, "settings-1440.png"), path.join(output, "settings-1920.png")] }, null, 2));
  await context.close();
} finally { await browser.close(); }
