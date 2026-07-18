import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174/";
const navCount = 25;

function collectConsoleErrors(page, errors) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
}

async function openFreshPage(browser, viewport, isMobile = false) {
  const page = await browser.newPage({ viewport, isMobile });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  return page;
}

const browser = await chromium.launch({ headless: true });
const errors = [];
const page = await openFreshPage(browser, { width: 1440, height: 1050 });
collectConsoleErrors(page, errors);

const headings = [];
for (let index = 0; index < navCount; index += 1) {
  await page.locator(".nav-item").nth(index).click();
  await page.waitForTimeout(60);
  headings.push(await page.locator(".page-header h1").innerText().catch(() => "missing"));
}

await page.locator(".nav-item").nth(24).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: /Integrity yoxla/i }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: /Go-live yoxla/i }).click();
await page.waitForTimeout(150);

const settingsText = await page.locator("main").innerText();
const settingsChecks = {
  systemHealth: settingsText.includes("Sistem Sağlamlığı"),
  goLive: settingsText.includes("Real Mühitə Çıxış"),
  integrity: settingsText.includes("Integrity score"),
  backup: settingsText.includes("Backup export"),
};

const mobileErrors = [];
const mobile = await openFreshPage(browser, { width: 390, height: 844 }, true);
collectConsoleErrors(mobile, mobileErrors);
await mobile.locator(".mobile-menu").click();
await mobile.locator(".nav-item").nth(24).click();
await mobile.waitForTimeout(150);
const mobileOverflow = await mobile.evaluate(() =>
  Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
);

await browser.close();

const result = {
  modulesOpened: headings.length,
  missingHeadings: headings.filter((heading) => heading === "missing").length,
  settingsChecks,
  mobileOverflow,
  errors,
  mobileErrors,
};

console.log(JSON.stringify(result, null, 2));

if (
  result.modulesOpened !== navCount ||
  result.missingHeadings > 0 ||
  Object.values(settingsChecks).some((value) => !value) ||
  result.mobileOverflow > 0 ||
  errors.length > 0 ||
  mobileErrors.length > 0
) {
  process.exitCode = 1;
}
