import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174/";
const navCount = 25;
const mainButtonSelector = "main button:visible:not([disabled])";
const modalButtonSelector = '[role="dialog"] button:visible:not([disabled])';

function labelFor(button) {
  const label = button.getAttribute("aria-label") || button.innerText || button.textContent || "icon-button";
  return label.replace(/\s+/g, " ").trim();
}

function collectConsoleErrors(page, errors) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      errors.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
}

async function resetToModule(page, moduleIndex) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".nav-item").first().waitFor();
  await page.locator(".nav-item").nth(moduleIndex).click();
  await page.locator(".page-header h1").waitFor();
  await page.waitForTimeout(30);
}

async function sourceButtonAudit() {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const buttons = [...source.matchAll(/<button\b([\s\S]*?)<\/button>/g)].map((match) => match[0]);
  const inert = buttons.filter(
    (markup) => !/onClick=/.test(markup) && !/type="submit"/.test(markup) && !/type='submit'/.test(markup),
  );
  return { total: buttons.length, inert: inert.length };
}

async function clickSourceButton(page, moduleIndex, buttonIndex) {
  await resetToModule(page, moduleIndex);
  const target = page.locator(mainButtonSelector).nth(buttonIndex);
  const sourceLabel = await target.evaluate(labelFor);
  await target.click({ timeout: 3000 });
  await page.waitForTimeout(40);
  return {
    sourceLabel,
    modalButtonCount: await page.locator(modalButtonSelector).count(),
  };
}

async function auditModuleButtons(page, errors, moduleIndex, report) {
  await resetToModule(page, moduleIndex);
  const buttonCount = await page.locator(mainButtonSelector).count();
  report.modules.push({ moduleIndex, buttonCount });

  for (let buttonIndex = 0; buttonIndex < buttonCount; buttonIndex += 1) {
    const errorOffset = errors.length;
    let sourceLabel = "button";
    let modalButtonCount = 0;
    try {
      ({ sourceLabel, modalButtonCount } = await clickSourceButton(page, moduleIndex, buttonIndex));
      report.mainButtons += 1;
      if (errors.length > errorOffset) {
        report.failures.push({ moduleIndex, sourceLabel, errors: errors.slice(errorOffset) });
      }
    } catch (error) {
      report.failures.push({ moduleIndex, buttonIndex, sourceLabel, error: error.message });
      continue;
    }

    for (let modalIndex = 0; modalIndex < modalButtonCount; modalIndex += 1) {
      const modalErrorOffset = errors.length;
      try {
        await clickSourceButton(page, moduleIndex, buttonIndex);
        const modalTarget = page.locator(modalButtonSelector).nth(modalIndex);
        const targetLabel = await modalTarget.evaluate(labelFor);
        await modalTarget.click({ timeout: 3000 });
        await page.waitForTimeout(40);
        report.modalButtons += 1;
        if (errors.length > modalErrorOffset) {
          report.failures.push({ moduleIndex, sourceLabel, targetLabel, errors: errors.slice(modalErrorOffset) });
        }
      } catch (error) {
        report.failures.push({ moduleIndex, sourceLabel, modalIndex, error: error.message });
      }
    }
  }
}

async function auditShellControls(browser, page, errors, report) {
  const errorOffset = errors.length;
  try {
    await resetToModule(page, 0);
    await page.getByLabel("Mesajlar").click();
    await page.locator(".page-header h1").waitFor();
    await resetToModule(page, 0);
    await page.getByLabel("Bildirişlər").click();
    await page.locator(".page-header h1").waitFor();
    await resetToModule(page, 0);
    await page.locator(".logout-btn").click();
    await page.locator(".login-shell").waitFor();
    await page.locator(".login-shell .primary-btn").click();
    await page.locator(".workspace").waitFor();
    report.shellButtons += 4;
    if (errors.length > errorOffset) report.failures.push({ scope: "shell", errors: errors.slice(errorOffset) });
  } catch (error) {
    report.failures.push({ scope: "shell", error: error.message });
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  const mobileErrors = [];
  collectConsoleErrors(mobile, mobileErrors);
  await mobile.addInitScript(() => localStorage.clear());
  try {
    await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await mobile.locator(".mobile-menu").click();
    await mobile.locator(".sidebar-close").click();
    await mobile.locator(".mobile-menu").click();
    await mobile.locator(".nav-item").nth(1).click();
    await mobile.locator(".page-header h1").waitFor();
    report.shellButtons += 3;
    if (mobileErrors.length > 0) report.failures.push({ scope: "mobile-shell", errors: mobileErrors });
  } catch (error) {
    report.failures.push({ scope: "mobile-shell", error: error.message });
  } finally {
    await mobileContext.close();
  }
}

async function auditBusinessLinks(page, errors, report) {
  let errorOffset = errors.length;
  try {
    await resetToModule(page, 1);
    if ((await page.locator(".crm-kanban-card").count()) === 0) {
      await page.locator(".page-header .primary-btn").click();
      const modal = page.locator('[role="dialog"]');
      await modal.locator("input").nth(0).fill("QA Customer");
      await modal.locator("input").nth(1).fill(`QA${Date.now()}`);
      await modal.locator("input").nth(2).fill("0500000000");
      await modal.locator('button[type="submit"]').click();
      await page.locator(".crm-kanban-card").first().waitFor();
    }
    await page.locator(".crm-kanban-card").first().click();
    await page.locator(".crm-pipeline-selection").waitFor();
    report.businessLinks.push("crm-pipeline-selection");
    if (errors.length > errorOffset) report.failures.push({ scope: "crm-link", errors: errors.slice(errorOffset) });
  } catch (error) {
    report.failures.push({ scope: "crm-link", error: error.message });
  }

  errorOffset = errors.length;
  try {
    await resetToModule(page, 6);
    const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
    await page.getByRole("button", { name: /PDF\/Excel/i }).click();
    const download = await downloadPromise;
    if (!download.suggestedFilename().endsWith(".csv")) {
      throw new Error("Invoice export did not create a CSV download");
    }
    report.businessLinks.push("invoice-csv-export");
    if (errors.length > errorOffset) report.failures.push({ scope: "invoice-export", errors: errors.slice(errorOffset) });
  } catch (error) {
    report.failures.push({ scope: "invoice-export", error: error.message });
  }

  errorOffset = errors.length;
  try {
    await resetToModule(page, 3);
    const balanceTabs = page.locator(".warehouse-balance-tabs button");
    await balanceTabs.nth(1).click();
    if ((await balanceTabs.nth(1).getAttribute("aria-selected")) !== "true") {
      throw new Error("Warehouse balance view did not switch to warehouse mode");
    }
    await page.locator(".warehouse-balance-actions .secondary-btn").first().click();
    if (await page.locator(".warehouse-balance-filters").count()) {
      throw new Error("Warehouse filter panel did not collapse");
    }
    await page.locator(".warehouse-balance-actions .secondary-btn").first().click();
    await page.locator(".warehouse-balance-filters").waitFor();
    await page.locator(".warehouse-balance-actions .secondary-btn").nth(3).click();
    if (!(await page.locator('.warehouse-balance-filters input[type="checkbox"]').isChecked())) {
      throw new Error("Replenishment action did not apply the minimum stock filter");
    }
    await page.locator(".warehouse-action-menu .primary-btn").click();
    await page.locator(".warehouse-action-menu-popover").waitFor();
    report.businessLinks.push("warehouse-balance-controls");
    if (errors.length > errorOffset) report.failures.push({ scope: "warehouse-balance", errors: errors.slice(errorOffset) });
  } catch (error) {
    report.failures.push({ scope: "warehouse-balance", error: error.message });
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
collectConsoleErrors(page, errors);
await page.addInitScript(() => localStorage.clear());

const report = {
  source: await sourceButtonAudit(),
  modules: [],
  mainButtons: 0,
  modalButtons: 0,
  shellButtons: 0,
  businessLinks: [],
  failures: [],
};

try {
  for (let moduleIndex = 0; moduleIndex < navCount; moduleIndex += 1) {
    await auditModuleButtons(page, errors, moduleIndex, report);
  }
  await auditShellControls(browser, page, errors, report);
  await auditBusinessLinks(page, errors, report);
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));

if (
  report.source.inert > 0 ||
  report.modules.length !== navCount ||
  report.mainButtons === 0 ||
  report.businessLinks.length !== 3 ||
  report.failures.length > 0
) {
  process.exitCode = 1;
}
