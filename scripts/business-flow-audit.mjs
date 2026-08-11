import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174/";
const storageKey = "erpaz.local.backend.v1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isLocalBaseUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

async function canReachBaseUrl() {
  try {
    const response = await fetch(baseUrl, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureAuditServer() {
  if (await canReachBaseUrl()) return null;
  if (!isLocalBaseUrl(baseUrl)) return null;

  const url = new URL(baseUrl);
  const server = spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host",
    url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    "--port",
    url.port || "5174",
    "--strictPort",
  ], {
    cwd: process.cwd(),
    stdio: "ignore",
    windowsHide: true,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (await canReachBaseUrl()) return server;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  server.kill();
  throw new Error(`Audit server ${baseUrl} ünvanında başlamadı`);
}

function collectErrors(page, errors) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
}

async function createFlowPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  collectErrors(page, errors);
  await page.addInitScript(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const marketingLogin = page.locator(".xp-ghost").first();
  if (await marketingLogin.isVisible().catch(() => false)) {
    await marketingLogin.click();
  }
  const passwordLogin = page.locator(".login-password-form, .xp-mod-x").first();
  if (await passwordLogin.isVisible().catch(() => false)) {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    if (!email || !password) {
      throw new Error("Remote auth requires E2E_USER_EMAIL and E2E_USER_PASSWORD");
    }
    await passwordLogin.locator('input[type="email"]').fill(email);
    await passwordLogin.locator('input[type="password"]').fill(password);
    await passwordLogin.locator('button[type="submit"]').click();
    try {
      await page.locator(".nav-item").first().waitFor({ state: "visible", timeout: 30000 });
    } catch {
      const authError = await page.locator(".xp-al.e, .form-error").first().innerText().catch(() => "");
      throw new Error(`E2E login did not reach the application${authError ? `: ${authError}` : ""}`);
    }
  }
  return { context, page, errors };
}

async function selectModule(page, index) {
  if ((await page.locator(".nav-item").count()) <= index) {
    const diagnostic = {
      url: page.url(),
      title: await page.title().catch(() => ""),
      text: (await page.locator("body").innerText().catch(() => "")).slice(0, 500),
    };
    throw new Error(`Navigation is unavailable: ${JSON.stringify(diagnostic)}`);
  }
  await page.locator(".nav-item").nth(index).click();
  await page.locator(".page-header h1").waitFor();
}

async function readState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
}

function stockTotal(state, warehouseId, product) {
  return (state.warehouseStock?.[warehouseId] || [])
    .filter((item) => item.product === product)
    .reduce((sum, item) => sum + Number(item.total || 0), 0);
}

function stockReserved(state, warehouseId, product) {
  return (state.warehouseStock?.[warehouseId] || [])
    .filter((item) => item.product === product)
    .reduce((sum, item) => sum + Number(item.reserved || 0), 0);
}

async function createWarehouseWithStock(page) {
  await selectModule(page, 3);
  await page.locator(".page-header .primary-btn").click();
  let modal = page.locator('[role="dialog"]');
  const suffix = Date.now().toString().slice(-6);
  await modal.locator("input").nth(0).fill(`WH-QA-${suffix}`);
  await modal.locator("input").nth(1).fill("QA Warehouse");
  await modal.locator("input").nth(2).fill("Baku");
  await modal.locator("input").nth(3).fill("QA Admin");
  await modal.locator("input").nth(4).fill("100");
  await modal.locator("input").nth(5).fill("QA Address");
  await modal.locator('button[type="submit"]').click();

  await page.locator(".warehouse-action-menu .primary-btn").click();
  await page.locator(".warehouse-action-menu-popover button").first().click();
  modal = page.locator('[role="dialog"]');
  await modal.locator("input").nth(0).fill("QA Device");
  await modal.locator("input").nth(1).fill("5");
  await modal.locator("input").nth(2).fill("1200");
  await modal.locator('button[type="submit"]').click();

  const state = await readState(page);
  const warehouse = state.warehouses.find((item) => item.name === "QA Warehouse");
  assert(warehouse, "Warehouse seed was not created");
  assert(stockTotal(state, warehouse.id, "QA Device") === 5, "Warehouse intake did not create the seed stock");
  assert(state.products?.some((item) => item.name === "QA Device"), "Warehouse intake did not create the product catalog record");
  return warehouse;
}

async function createCustomer(page) {
  await selectModule(page, 1);
  await page.locator(".page-header .primary-btn").click();
  const modal = page.locator('[role="dialog"]');
  const fin = `QA${Date.now().toString().slice(-7)}`;
  await modal.locator("input").nth(0).fill("QA Customer");
  await modal.locator("input").nth(1).fill(fin);
  await modal.locator("input").nth(2).fill("0500000000");
  await modal.locator('button[type="submit"]').click();
  return fin;
}

async function createCreditSaleFromCurrentData(page, expectedFin) {
  await selectModule(page, 2);
  const before = await readState(page);
  await page.locator(".page-header .primary-btn").click();
  const modal = page.locator('[role="dialog"]');
  await modal.locator("select").nth(1).selectOption({ index: 1 });
  await modal.locator(".order-modal-form button[type=submit]").click();
  await page.waitForTimeout(100);
  const after = await readState(page);
  const order = after.orders?.find((item) => !before.orders?.some((previous) => previous.id === item.id));
  const credit = after.credits?.find((item) => item.id === order?.creditId);
  const contract = after.contracts?.find((item) => item.id === order?.contractId);
  const line = order?.productLines?.[0];
  const warehouse = after.warehouses?.find((item) => item.id === order?.warehouseId);

  assert(order?.paymentMethod === "Kredit", "Credit sale did not create a credit order");
  if (expectedFin) assert(order.fin === expectedFin, "Credit sale did not use the expected customer");
  assert(credit?.orderId === order.id, "Credit record is not linked to the sales order");
  assert(contract?.orderId === order.id, "Contract is not linked to the sales order");
  assert(line?.product, "Credit order has no reserved product line");
  assert(
    stockReserved(after, warehouse.id, line.product) === stockReserved(before, warehouse.id, line.product) + Number(line.qty),
    "Warehouse reservation did not increase for the credit sale",
  );

  return { before, after, order, credit, contract, line, warehouse };
}

async function createCreditSale(page) {
  await createWarehouseWithStock(page);
  const fin = await createCustomer(page);
  return createCreditSaleFromCurrentData(page, fin);
}

async function auditCreditSale(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    await page.locator(".sales-search-field input").fill(sale.order.id);
    await page.locator(".sales-date-filter input").nth(0).fill(sale.order.date);
    await page.locator(".sales-date-filter input").nth(1).fill(sale.order.date);
    const registryText = await page.locator(".sales-registry-panel").innerText();
    assert(registryText.includes(sale.order.id), "Sales registry search did not keep the created order visible");
    assert(registryText.includes(sale.credit.id), "Sales registry does not show the linked credit id");
    assert(registryText.includes(sale.contract.id), "Sales registry does not show the linked contract id");
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".sales-export-btn").click(),
    ]).then(([file]) => file);
    assert(download.suggestedFilename().includes("satis-reyestri"), "Sales registry export did not create the expected CSV file");
    assert(errors.length === 0, `Credit sale produced browser errors: ${errors.join(" | ")}`);
    return { id: sale.order.id, creditId: sale.credit.id, contractId: sale.contract.id, product: sale.line.product };
  } finally {
    await context.close();
  }
}

async function auditSalesAndExpenseMutations(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    const originalReserved = stockReserved(sale.before, sale.warehouse.id, sale.line.product);

    await page.locator(".sales-order-card .operation-row-actions button").first().click();
    let modal = page.locator('[role="dialog"]');
    await modal.locator(".edit-order-total input").fill("1300");
    await modal.locator(".credit-order-section input").fill("100");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    let state = await readState(page);
    let editedOrder = state.orders.find((item) => item.id === sale.order.id);
    let editedCredit = state.credits.find((item) => item.id === editedOrder?.creditId);
    assert(editedOrder?.amount === 1300, "Sales edit did not update order amount");
    assert(editedOrder?.initialPayment === 100, "Sales edit did not update initial payment");
    assert(editedCredit?.total === 1300, "Sales edit did not sync credit total");
    assert(editedCredit?.initialPayment === 100, "Sales edit did not sync credit initial payment");

    await page.locator(".sales-order-card .operation-row-actions .danger-outline").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator(".danger-outline").click();
    await page.waitForTimeout(100);

    state = await readState(page);
    assert(!state.orders.some((item) => item.id === sale.order.id), "Sales delete did not remove order");
    assert(!state.credits.some((item) => item.id === sale.credit.id), "Sales delete did not remove linked credit");
    assert(stockReserved(state, sale.warehouse.id, sale.line.product) === originalReserved, "Sales delete did not release reservation");

    await selectModule(page, 5);
    await page.locator(".page-header .primary-btn").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Expense");
    await modal.locator("input").nth(1).fill("QA Ops");
    await modal.locator("input").nth(3).fill("300");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    state = await readState(page);
    const expense = state.expenses.find((item) => item.description === "QA Expense");
    assert(expense, "Expense create did not add finance expense");

    const expenseRow = page.locator(".finance-expense-queue-panel tr", { hasText: "QA Expense" }).first();
    await expenseRow.getByText("Redaktə").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator('input[type="number"]').fill("450");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    state = await readState(page);
    assert(state.expenses.find((item) => item.id === expense.id)?.amount === 450, "Expense edit did not update amount");

    await page.locator(".finance-expense-queue-panel tr", { hasText: "QA Expense" }).first().getByText("Sil").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator(".danger-outline").click();
    await page.waitForTimeout(100);

    state = await readState(page);
    assert(!state.expenses.some((item) => item.id === expense.id), "Expense delete did not remove expense");
    assert(errors.length === 0, `Mutation flow produced browser errors: ${errors.join(" | ")}`);

    return { editedOrder: sale.order.id, editedCredit: sale.credit.id, expense: expense.id };
  } finally {
    await context.close();
  }
}

async function auditCreditPayment(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    await selectModule(page, 9);
    const before = await readState(page);
    const previousCredit = before.credits?.find((item) => item.id === sale.credit.id);
    const previousOrder = before.orders?.find((order) => order.id === sale.order.id);
    const previousPaidMonths = Number(previousCredit?.paidMonths || 0);
    const currentDue = Number(previousCredit?.installments?.[previousPaidMonths]?.amount || previousCredit?.monthly || 0);
    const nextDueBefore = Number(previousCredit?.installments?.[previousPaidMonths + 1]?.amount || 0);
    const principalPayment = currentDue + 50;
    const penaltyPayment = 17;

    await page.locator(".credit-directory-panel tr").filter({ hasText: sale.contract.id }).locator(".credit-table-actions .icon-btn").first().click();
    await page.locator(".credit-detail-modal-card .credit-payment-form").waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-debt-formula"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-total-tile"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-paid-tile"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-balance-tile"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-order-link"]').click();
    await page.locator(".page-header h1").filter({ hasText: "Satış" }).waitFor();
    await page.locator(".sales-order-card").filter({ hasText: sale.order.id }).waitFor();
    await selectModule(page, 9);
    await page.locator(".credit-directory-panel tr").filter({ hasText: sale.contract.id }).locator(".credit-table-actions .icon-btn").first().click();
    await page.locator(".credit-detail-modal-card .credit-payment-form").waitFor({ state: "visible" });
    const paymentInputs = page.locator(".credit-detail-modal-card .credit-payment-form input");
    await paymentInputs.nth(0).fill(String(principalPayment));
    await paymentInputs.nth(1).fill(String(penaltyPayment));
    await page.locator(".credit-detail-modal-card .credit-payment-form button[type=submit]").click();
    await page.waitForTimeout(100);
    const after = await readState(page);
    const cashEntry = after.cashEntries?.[0];
    const linkedOrder = after.orders?.find((order) => order.id === cashEntry?.orderId);
    const linkedCredit = after.credits?.find((credit) => credit.id === cashEntry?.creditId);

    assert(after.cashEntries.length === before.cashEntries.length + 1, "Credit payment did not create a cash entry");
    assert(cashEntry?.creditId && Number(cashEntry.amount) > 0, "Cash entry is missing credit payment data");
    assert(cashEntry.principal === principalPayment, "Credit payment did not split principal correctly");
    assert(cashEntry.penalty === penaltyPayment, "Credit payment did not store the penalty amount");
    assert(cashEntry.amount === principalPayment + penaltyPayment, "Cash entry should contain principal plus penalty");
    assert(
      linkedOrder && previousOrder && Number(linkedOrder.paid) === Number(previousOrder.paid) + principalPayment,
      "Credit payment did not update the linked order principal",
    );
    assert(
      Number(linkedOrder.creditBalance) === Number(previousCredit.balance) - principalPayment,
      "Penalty amount incorrectly affected the remaining principal debt",
    );
    assert(linkedCredit?.payments?.[0]?.extraApplied === 50, "Overpayment was not carried into the next installment");
    assert(Number(linkedCredit?.installments?.[previousPaidMonths]?.amount || 0) === 0, "Current installment was not closed");
    assert(
      Number(linkedCredit?.installments?.[previousPaidMonths + 1]?.amount || 0) === Math.max(0, nextDueBefore - 50),
      "Overpayment did not reduce the next installment",
    );
    assert(errors.length === 0, `Credit payment produced browser errors: ${errors.join(" | ")}`);
    return { creditId: cashEntry.creditId, cashAmount: cashEntry.amount, orderId: cashEntry.orderId };
  } finally {
    await context.close();
  }
}

async function auditSeparateCreditContracts(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await createWarehouseWithStock(page);
    const fin = await createCustomer(page);
    const firstSale = await createCreditSaleFromCurrentData(page, fin);
    await page.waitForTimeout(20);
    const secondSale = await createCreditSaleFromCurrentData(page, fin);
    const state = await readState(page);
    const customerCredits = state.credits?.filter((credit) => credit.fin === fin) || [];
    const customerContracts = state.contracts?.filter((contract) => contract.fin === fin) || [];

    assert(customerCredits.length === 2, "Same customer credit sales were merged instead of staying separate");
    assert(customerContracts.length === 2, "Same customer contracts were merged instead of staying separate");
    assert(firstSale.order.id !== secondSale.order.id, "Separate credit sales reused the same order ID");
    assert(firstSale.credit.id !== secondSale.credit.id, "Separate credit sales reused the same credit ID");
    assert(firstSale.contract.id !== secondSale.contract.id, "Separate credit sales reused the same contract ID");
    assert(
      customerCredits.every((credit) => credit.orderId && credit.contractId),
      "Every credit should keep its own order and contract reference",
    );
    assert(
      stockReserved(state, firstSale.warehouse.id, firstSale.line.product) ===
        Number(firstSale.line.qty || 0) + Number(secondSale.line.qty || 0),
      "Separate credit contracts did not keep independent warehouse reservations",
    );
    await selectModule(page, 9);
    await page.locator('[data-testid="credit-contract-cell"]').filter({ hasText: firstSale.contract.id }).waitFor();
    await page.locator('[data-testid="credit-contract-cell"]').filter({ hasText: secondSale.contract.id }).waitFor();
    assert(
      (await page.locator('[data-testid="credit-contract-cell"]').filter({ hasText: fin }).count()) >= 2 ||
        (await page.locator(".credit-directory-panel tbody tr").filter({ hasText: fin }).count()) >= 2,
      "Credit directory did not keep same-customer contracts as separate visible rows",
    );
    await selectModule(page, 1);
    await page.locator(".crm-search-field input").fill(fin);
    await page.locator(".crm-customer-name-btn").filter({ hasText: "QA Customer" }).first().click();
    await page.locator(".customer-360-modal-card").waitFor({ state: "visible" });
    const cardCount = await page.locator(".customer-360-contract-card").count();
    const modalText = await page.locator(".customer-360-modal-card").innerText();
    assert(cardCount >= 2, "CRM 360 did not render separate credit agreement cards");
    assert(modalText.includes(firstSale.credit.id), "CRM 360 is missing the first credit agreement");
    assert(modalText.includes(secondSale.credit.id), "CRM 360 is missing the second credit agreement");
    assert(modalText.includes(firstSale.contract.id), "CRM 360 is missing the first contract");
    assert(modalText.includes(secondSale.contract.id), "CRM 360 is missing the second contract");
    assert((await page.locator('[data-testid="crm-360-order-link"]').count()) >= 2, "CRM 360 did not expose order module links");
    assert((await page.locator('[data-testid="crm-360-credit-link"]').count()) >= 2, "CRM 360 did not expose credit module links");
    await page.locator('[data-testid="crm-360-order-link"]').filter({ hasText: firstSale.order.id }).click();
    await page.locator(".page-header h1").filter({ hasText: "Satış" }).waitFor();
    await page.locator(".sales-order-card").filter({ hasText: firstSale.order.id }).waitFor();
    await selectModule(page, 1);
    await page.locator(".crm-search-field input").fill(fin);
    await page.locator(".crm-customer-name-btn").filter({ hasText: "QA Customer" }).first().click();
    await page.locator(".customer-360-modal-card").waitFor({ state: "visible" });
    await page.locator('[data-testid="crm-360-credit-link"]').filter({ hasText: firstSale.credit.id }).click();
    await page.locator(".page-header h1").filter({ hasText: "Kredit" }).waitFor();
    await page.locator(".credit-detail-modal-card").filter({ hasText: firstSale.credit.id }).waitFor();
    await page.locator(".credit-detail-modal-head .icon-btn").click();
    await page.locator(".credit-detail-modal-card").waitFor({ state: "hidden" });
    await selectModule(page, 1);
    await page.locator(".crm-search-field input").fill(fin);
    await page.locator(".crm-customer-name-btn").filter({ hasText: "QA Customer" }).first().click();
    await page.locator(".customer-360-modal-card").waitFor({ state: "visible" });
    await page.locator(".customer-360-schedule-preview").first().click();
    assert((await page.locator(".customer-360-schedule-row").count()) > 0, "CRM 360 credit schedule did not expand");
    await page.locator(".customer-360-head .icon-btn").click();
    await page.locator(".customer-360-modal-card").waitFor({ state: "hidden" });
    assert(errors.length === 0, `Separate credit contract flow produced browser errors: ${errors.join(" | ")}`);
    return {
      fin,
      credits: customerCredits.map((credit) => credit.id),
      contracts: customerContracts.map((contract) => contract.id),
    };
  } finally {
    await context.close();
  }
}

async function auditWarehouseDelivery(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    const before = await readState(page);
    await selectModule(page, 4);
    await page.locator(".delivery-search input").fill(sale.order.id);
    const deliveryRegistryText = await page.locator(".delivery-registry-panel").innerText();
    assert(deliveryRegistryText.includes(sale.order.id), "Delivery registry search did not keep the created order visible");
    const deliveryExport = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".delivery-export-btn").click(),
    ]).then(([file]) => file);
    assert(deliveryExport.suggestedFilename().includes("tehvil-reyestri"), "Delivery registry export did not create the expected CSV file");
    await selectModule(page, 3);
    await page.locator(".warehouse-operations-drawer > summary").click();
    const orderRow = page.locator("tr").filter({ hasText: sale.order.id });
    await orderRow.locator("button.text-btn").click();
    await page.waitForTimeout(100);
    const after = await readState(page);
    const deliveredOrder = after.orders?.find((item) => item.id === sale.order.id);

    assert(deliveredOrder?.status === "Təhvil verilib", "Warehouse delivery did not complete the order");
    assert(
      stockTotal(after, sale.warehouse.id, sale.line.product) === stockTotal(before, sale.warehouse.id, sale.line.product) - Number(sale.line.qty),
      "Warehouse delivery did not reduce physical stock",
    );
    assert(
      stockReserved(after, sale.warehouse.id, sale.line.product) === stockReserved(before, sale.warehouse.id, sale.line.product) - Number(sale.line.qty),
      "Warehouse delivery did not release the reservation",
    );
    assert(errors.length === 0, `Warehouse delivery produced browser errors: ${errors.join(" | ")}`);
    return { orderId: sale.order.id, product: sale.line.product, qty: sale.line.qty, warehouseId: sale.warehouse.id, exportFile: deliveryExport.suggestedFilename() };
  } finally {
    await context.close();
  }
}

async function auditPurchaseOrder(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const warehouse = await createWarehouseWithStock(page);
    await selectModule(page, 11);
    await page.locator(".page-header .primary-btn").click();
    const vendorModal = page.locator('[role="dialog"]');
    await vendorModal.locator("input").nth(0).fill("QA Vendor");
    await vendorModal.locator("input").nth(1).fill("Azerbaijan");
    await vendorModal.locator("input").nth(2).fill("1");
    await vendorModal.locator("input").nth(3).fill("100");
    await vendorModal.locator('button[type="submit"]').click();

    const before = await readState(page);
    await page.getByRole("button", { name: "Zavod sifarişi" }).click();
    const poModal = page.locator('[role="dialog"]');
    await poModal.locator("input").nth(0).fill("QA Vendor");
    await poModal.locator("input").nth(1).fill("6");
    await poModal.locator("input").nth(2).fill("50");
    await poModal.locator("input").nth(3).fill("120");
    await poModal.locator("input").nth(5).fill("QA factory audit order");
    await poModal.locator('button[type="submit"]').click();
    await page.waitForTimeout(75);
    const created = await readState(page);
    const po = created.purchaseOrders?.[0];
    assert(po?.status === "Təsdiq gözləyir", "Purchase order was not created as pending");

    await page.locator(".po-action-panel button.text-btn").first().click();
    await page.waitForTimeout(100);
    const after = await readState(page);
    const approvedPo = after.purchaseOrders?.find((item) => item.id === po.id);

    assert(approvedPo?.status === "Təsdiq edildi", "Purchase order was not approved");
    assert(
      stockTotal(after, po.warehouseId, po.product) === stockTotal(before, po.warehouseId, po.product) + Number(po.qty),
      "Approved purchase order did not increase warehouse stock",
    );
    assert(after.expenses.length === before.expenses.length + 1, "Approved purchase order did not create a finance expense");
    assert(errors.length === 0, `Purchase order produced browser errors: ${errors.join(" | ")}`);
    return { poId: po.id, product: po.product, qty: po.qty, warehouseId: warehouse.id };
  } finally {
    await context.close();
  }
}

async function auditVendorLifecycle(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await createWarehouseWithStock(page);
    await selectModule(page, 11);

    const suffix = Date.now().toString().slice(-6);
    const vendorName = `QA Vendor ${suffix}`;
    const updatedName = `QA Vendor Updated ${suffix}`;

    await page.locator(".page-header .primary-btn").click();
    let modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill(vendorName);
    await modal.locator("input").nth(1).fill("Azerbaijan");
    await modal.locator("input").nth(2).fill("3");
    await modal.locator("input").nth(3).fill("120");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    let state = await readState(page);
    assert(state.vendors?.some((vendor) => vendor.name === vendorName), "Vendor create did not persist");

    await page.locator(".vendor-registry-panel tr").filter({ hasText: vendorName }).locator(".vendor-row-actions .text-btn").first().click();
    modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill(updatedName);
    await modal.locator("input").nth(5).fill("QA Procurement Lead");
    await modal.locator("input").nth(6).fill("0501112233");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    state = await readState(page);
    const updatedVendor = state.vendors?.find((vendor) => vendor.name === updatedName);
    assert(updatedVendor?.contact === "QA Procurement Lead", "Vendor edit did not persist contact data");
    assert(!state.vendors?.some((vendor) => vendor.name === vendorName), "Vendor edit left the old vendor name active");

    await page.locator(".vendor-command-actions .secondary-btn").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill(updatedName);
    await modal.locator("input").nth(1).fill("2");
    await modal.locator("input").nth(2).fill("70");
    await modal.locator("input").nth(3).fill("130");
    await modal.locator("input").nth(5).fill("QA vendor lifecycle PO");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    state = await readState(page);
    const createdPo = state.purchaseOrders?.[0];
    assert(createdPo?.vendor === updatedName && createdPo.status === "Təsdiq gözləyir", "Vendor PO was not created as pending");

    const vendorRow = page.locator(".vendor-registry-panel tr").filter({ hasText: updatedName });
    const deleteButtonWithOpenPo = vendorRow.locator(".vendor-row-actions .text-btn.danger");
    assert(await deleteButtonWithOpenPo.isDisabled(), "Vendor delete should be disabled while an open PO exists");

    await page.locator(".po-action-panel button.text-btn").first().click();
    await page.waitForTimeout(100);

    state = await readState(page);
    const approvedPo = state.purchaseOrders?.find((po) => po.id === createdPo.id);
    assert(approvedPo?.status === "Təsdiq edildi", "Vendor PO approval did not persist");

    const deleteButtonAfterApproval = page
      .locator(".vendor-registry-panel tr")
      .filter({ hasText: updatedName })
      .locator(".vendor-row-actions .text-btn.danger");
    assert(!(await deleteButtonAfterApproval.isDisabled()), "Vendor delete stayed disabled after PO approval");
    await deleteButtonAfterApproval.click();
    modal = page.locator('[role="dialog"]');
    await modal.locator(".danger-outline").click();
    await page.waitForTimeout(100);

    state = await readState(page);
    assert(!state.vendors?.some((vendor) => vendor.name === updatedName), "Vendor delete did not remove the vendor");
    assert(state.purchaseOrders?.some((po) => po.id === createdPo.id), "Vendor delete should not remove approved PO history");
    assert(
      state.auditLog?.some((entry) => entry.action === "Vendor redaktə edildi") &&
        state.auditLog?.some((entry) => entry.action === "Vendor silindi"),
      "Vendor lifecycle did not write expected audit log entries",
    );
    assert(errors.length === 0, `Vendor lifecycle produced browser errors: ${errors.join(" | ")}`);

    return { vendor: updatedName, poId: createdPo.id, poStatus: approvedPo.status };
  } finally {
    await context.close();
  }
}

async function auditFinanceModuleIntegration(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 5);
    await page.locator(".finance-account-panel .secondary-btn").click();
    let modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Main Cash");
    await modal.locator("input").nth(1).fill(`QAC${Date.now().toString().slice(-5)}`);
    await modal.locator("input").nth(2).fill("250");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    const sale = await createCreditSale(page);
    await selectModule(page, 9);
    await page.locator(".credit-directory-panel tr").filter({ hasText: sale.contract.id }).locator(".credit-table-actions .icon-btn").first().click();
    await page.locator(".credit-detail-modal-card .credit-payment-form").waitFor({ state: "visible" });
    const paymentInputs = page.locator(".credit-detail-modal-card .credit-payment-form input");
    await paymentInputs.nth(0).fill("150");
    await paymentInputs.nth(1).fill("25");
    await page.locator(".credit-detail-modal-card .credit-payment-form button[type=submit]").click();
    await page.waitForTimeout(100);
    await page.locator(".credit-detail-modal-head .icon-btn").click();
    await page.locator(".credit-detail-modal-card").waitFor({ state: "hidden" });

    await selectModule(page, 11);
    await page.locator(".page-header .primary-btn").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Finance Vendor");
    await modal.locator("input").nth(1).fill("Azerbaijan");
    await modal.locator("input").nth(2).fill("2");
    await modal.locator("input").nth(3).fill("100");
    await modal.locator('button[type="submit"]').click();
    await page.getByRole("button", { name: "Zavod sifarişi" }).click();
    modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Finance Vendor");
    await modal.locator("input").nth(1).fill("3");
    await modal.locator("input").nth(2).fill("80");
    await modal.locator("input").nth(3).fill("140");
    await modal.locator("input").nth(5).fill("QA finance integration PO");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(75);
    let state = await readState(page);
    const po = state.purchaseOrders?.[0];
    await page.locator(".po-action-panel button.text-btn").first().click();
    await page.waitForTimeout(100);

    await selectModule(page, 14);
    await createHrEmployee(page, {
      name: "QA Finance Payroll",
      position: "Finance Analyst",
      department: "Finance",
      salary: 1600,
    });
    await page.waitForTimeout(100);

    state = await readState(page);
    const cashEntry = state.cashEntries?.find((entry) => entry.creditId === sale.credit.id);
    const poExpense = state.expenses?.find((expense) => expense.source === "Vendor PO" && expense.poId === po.id);
    const payrollExpense = state.expenses?.find((expense) => expense.source === "HR Payroll");
    const account = state.financeAccounts?.find((item) => item.name === "QA Main Cash");

    assert(account?.openingBalance === 250, "Finance account opening balance was not persisted");
    assert(cashEntry?.amount === 175 && cashEntry.penalty === 25, "Credit cash entry did not reach finance correctly");
    assert(poExpense?.status === "Təsdiq gözləyir" && poExpense.amount === po.amount, "Approved PO did not create a pending finance expense");
    assert(payrollExpense?.cashImpact === false, "Payroll expense should remain cash-neutral in finance");

    await selectModule(page, 5);
    await page.locator('[data-testid="finance-daily-close"]').waitFor({ state: "visible" });
    const dailyCloseText = await page.locator('[data-testid="finance-daily-close"]').innerText();
    assert(dailyCloseText.includes("Bağlanış") && dailyCloseText.includes("Proqnoz"), "Finance daily cash close summary is missing");
    await page.locator(".finance-ledger-summary").waitFor({ state: "visible" });
    await page.locator(".finance-search-filter input").fill(cashEntry.creditId);
    await page.locator(".finance-date-filter input").nth(0).fill(cashEntry.date);
    await page.locator(".finance-date-filter input").nth(1).fill(cashEntry.date);
    const filteredLedger = await page.locator(".finance-ledger-panel tbody").innerText();
    assert(filteredLedger.includes(cashEntry.creditId), "Finance ledger search/date filters did not keep the credit cash row visible");
    assert(filteredLedger.includes("25 ₼"), "Finance ledger did not expose the penalty income");
    await page.locator(".finance-ledger-panel [data-testid=\"finance-ledger-credit-link\"]").filter({ hasText: cashEntry.creditId }).click();
    await page.locator(".page-header h1").filter({ hasText: "Kredit" }).waitFor();
    await page.locator(".credit-detail-modal-card").filter({ hasText: cashEntry.creditId }).waitFor();
    await page.locator(".credit-detail-modal-head .icon-btn").click();
    await page.locator(".credit-detail-modal-card").waitFor({ state: "hidden" });
    await selectModule(page, 5);
    await page.locator(".finance-search-filter input").fill(po.id);
    const poLedger = await page.locator(".finance-ledger-panel tbody").innerText();
    assert(poLedger.includes(po.id), "Finance ledger search did not expose linked PO expense");
    await page.locator(".finance-ledger-panel [data-testid=\"finance-ledger-po-link\"]").filter({ hasText: po.id }).click();
    await page.locator(".page-header h1").filter({ hasText: "Vendor" }).waitFor();
    await selectModule(page, 5);
    await page.locator(".finance-filter-tabs button").filter({ hasText: "Cash təsirsiz" }).click();
    await page.locator(".finance-search-filter input").fill("Payroll");
    const accrualLedger = await page.locator(".finance-ledger-panel tbody").innerText();
    assert(accrualLedger.includes("cash təsiri yoxdur"), "Finance ledger did not expose payroll as cash-neutral accrual");
    assert(errors.length === 0, `Finance integration produced browser errors: ${errors.join(" | ")}`);

    return {
      account: account.code,
      creditCash: cashEntry.amount,
      poExpense: poExpense.id,
      payrollCashImpact: payrollExpense.cashImpact,
    };
  } finally {
    await context.close();
  }
}

async function auditReceivableCreditorWorkflow(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    await selectModule(page, 11);
    await page.locator(".page-header .primary-btn").click();
    let modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Receivable Vendor");
    await modal.locator("input").nth(1).fill("Azerbaijan");
    await modal.locator("input").nth(2).fill("2");
    await modal.locator("input").nth(3).fill("100");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    await page.locator(".vendor-command-actions .secondary-btn").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Receivable Vendor");
    await modal.locator("input").nth(1).fill("2");
    await modal.locator("input").nth(2).fill("110");
    await modal.locator("input").nth(3).fill("160");
    await modal.locator("input").nth(5).fill("QA receivable close PO");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);
    let state = await readState(page);
    const poId = state.purchaseOrders?.[0]?.id;
    assert(poId, "Receivable audit did not create a vendor PO");

    await selectModule(page, 10);
    await page.locator('[data-testid="receivable-control-panel"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="receivable-aging-panel"]').waitFor({ state: "visible" });
    const panelText = await page.locator('[data-testid="receivable-control-panel"]').innerText();
    assert(panelText.includes("Kolleksiya") && panelText.includes("Növbəti addım"), "Receivable registry did not expose collection/risk controls");

    const closeButtons = page.locator('[data-testid="receivable-close-button"]');
    const closeCount = await closeButtons.count();
    if (closeCount < 2) {
      const state = await readState(page);
      throw new Error(
        `Receivable registry did not expose both debtor and creditor close actions: ${JSON.stringify({
          closeCount,
          customers: state.customers?.map((customer) => ({ name: customer.name, fin: customer.fin, debt: customer.debt, delay: customer.delay })),
          credits: state.credits?.map((credit) => ({ id: credit.id, customer: credit.customer, fin: credit.fin, balance: credit.balance })),
          vendors: state.vendors?.map((vendor) => ({ name: vendor.name, status: vendor.status })),
          purchaseOrders: state.purchaseOrders?.map((po) => ({ id: po.id, vendor: po.vendor, amount: po.amount, status: po.status })),
          panel: panelText.slice(0, 800),
        })}`,
      );
    }
    await closeButtons.first().click();
    await page.waitForTimeout(100);
    await closeButtons.first().click();
    await page.waitForTimeout(100);

    const after = await readState(page);
    const closedCredit = after.credits?.find((credit) => credit.id === sale.credit.id);
    const debtorClosure = after.receivableClosures?.find((closure) => closure.type === "Debitor");
    const creditorClosure = after.receivableClosures?.find((closure) => closure.type === "Kreditor");
    const closedPo = after.purchaseOrders?.find((po) => po.id === poId);
    const creditorExpense = after.expenses?.find((expense) => expense.poId === poId);
    const debtorCash = after.cashEntries?.find((entry) => entry.receivableId?.startsWith("DB-"));

    assert(Number(closedCredit?.balance || 0) === 0, "Debitor close did not clear the linked credit balance");
    assert(debtorCash?.source === "Debitor/Kreditor", "Debitor close did not create a cash-in ledger entry");
    assert(closedPo?.status === "Ödənilib", "Kreditor close did not mark the PO as paid");
    assert(creditorExpense?.status === "Təsdiq edildi", "Kreditor close did not approve the finance expense");
    assert(debtorClosure && creditorClosure, "Receivable close history did not persist both closure types");
    assert(
      after.auditLog?.some((entry) => entry.module === "Debitor/Kreditor" && entry.action.includes("borcu bağlandı")),
      "Receivable close actions were not written to audit log",
    );
    assert(errors.length === 0, `Receivable workflow produced browser errors: ${errors.join(" | ")}`);

    return { creditId: sale.credit.id, poId, closures: after.receivableClosures.length, cashIn: debtorCash.amount };
  } finally {
    await context.close();
  }
}

async function auditInvoiceAccountingTax(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);

    await selectModule(page, 6);
    await page.locator(".invoice-registry-panel tbody tr").filter({ hasText: sale.order.id }).waitFor();
    await page.locator('[data-testid="invoice-order-link"]').filter({ hasText: sale.order.id }).click();
    await page.locator(".page-header h1").filter({ hasText: "Satış" }).waitFor();
    await page.locator(".sales-order-card").filter({ hasText: sale.order.id }).waitFor();

    await selectModule(page, 6);
    await page.locator(".invoice-operations-panel").waitFor({ state: "visible" });
    await page.locator(".page-header .primary-btn").click();
    await page.waitForTimeout(100);
    let state = await readState(page);
    const sentOrder = state.orders?.find((order) => order.id === sale.order.id);
    assert(sentOrder?.invoiceSentAt && sentOrder?.invoiceBatchId, "Invoice action did not mark the linked order as e-invoice sent");

    await selectModule(page, 7);
    await page.locator('[data-testid="accounting-close-readiness"]').waitFor({ state: "visible" });
    const closeText = await page.locator('[data-testid="accounting-close-readiness"]').innerText();
    assert(closeText.includes("Balans") && closeText.includes("Kassa"), "Accounting close checklist is missing reconciliation checks");
    await page.locator(".page-header .primary-btn").click();
    await page.waitForTimeout(100);
    state = await readState(page);
    assert(state.accountingClose?.journalCount > 0, "Accounting action did not create a close/export snapshot");

    await selectModule(page, 8);
    await page.locator('[data-testid="tax-control-panel"]').waitFor({ state: "visible" });
    assert((await page.locator(".tax-calendar-panel tbody tr").count()) >= 3, "Tax calendar did not generate default obligations");
    await page.locator(".page-header .primary-btn").click();
    await page.waitForTimeout(100);
    state = await readState(page);
    assert(state.expenses?.some((expense) => String(expense.id).startsWith("TAXPAY-")), "Tax action did not create a payment task expense");
    assert(state.taxCalendar?.some((item) => item.paymentTaskId), "Tax action did not persist the payment task on the calendar");
    assert(errors.length === 0, `Invoice/accounting/tax flow produced browser errors: ${errors.join(" | ")}`);

    return {
      orderId: sale.order.id,
      invoiceBatch: sentOrder.invoiceBatchId,
      journalCount: state.accountingClose?.journalCount,
      taxTasks: state.taxCalendar?.filter((item) => item.paymentTaskId).length || 0,
    };
  } finally {
    await context.close();
  }
}

async function auditWarehouseImport(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 3);
    await page.locator(".page-header .primary-btn").click();
    const warehouseModal = page.locator('[role="dialog"]');
    const suffix = Date.now().toString().slice(-6);
    const warehouseName = `QA Import ${suffix}`;
    await warehouseModal.locator("input").nth(0).fill(`IMP-${suffix}`);
    await warehouseModal.locator("input").nth(1).fill(warehouseName);
    await warehouseModal.locator("input").nth(2).fill("Baku");
    await warehouseModal.locator("input").nth(3).fill("QA Admin");
    await warehouseModal.locator("input").nth(4).fill("100");
    await warehouseModal.locator("input").nth(5).fill("QA Address");
    await warehouseModal.locator('button[type="submit"]').click();

    await page.locator(".warehouse-action-menu .primary-btn").click();
    await page.locator(".warehouse-action-menu-popover button").nth(1).click();
    const importModal = page.locator('[role="dialog"]');
    const sku = `IMP-${suffix}-001`;
    const csv = [
      "Product;SKU;Warehouse;Quantity;Sale Price;Cost Price;Category;Minimum;Unit;Serial",
      `Imported Device;${sku};${warehouseName};7;900;600;Electronics;2;piece;Bəli`,
    ].join("\n");
    await importModal.locator('input[type="file"]').setInputFiles({
      name: "warehouse-import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    await importModal.locator(".warehouse-import-summary").waitFor();
    await importModal.locator(".modal-actions .primary-btn").click();

    const state = await readState(page);
    const warehouse = state.warehouses.find((item) => item.name === warehouseName);
    const product = state.products.find((item) => item.sku === sku);
    const item = state.warehouseStock?.[warehouse?.id || ""]?.find((row) => row.product === "Imported Device");
    assert(warehouse, "Warehouse import test could not create the target warehouse");
    assert(product?.costPrice === 600 && product?.serialTracked === true, "Import did not persist product metadata");
    assert(Number(item?.total || 0) === 7, "Import did not increase warehouse stock");
    assert(errors.length === 0, `Warehouse import produced browser errors: ${errors.join(" | ")}`);
    return { warehouseId: warehouse.id, sku: product.sku, quantity: item.total };
  } finally {
    await context.close();
  }
}

async function auditProductionCosting(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const warehouse = await createWarehouseWithStock(page);
    let state = await readState(page);
    const rawBefore = stockTotal(state, warehouse.id, "QA Device");

    await selectModule(page, 13);
    await page.locator(".page-header .primary-btn").click();
    await page.locator('[data-testid="production-control-panel"]').waitFor();
    await page.locator('[data-testid="production-complete-plan"]').first().click();
    await page.waitForTimeout(150);

    state = await readState(page);
    const plan = state.productionPlans?.find((item) => item.product === "Yeni satış komplekti");
    assert(plan, "Production action did not create a BOM plan");
    assert(plan.status === "İstehsal edildi", "Production completion did not mark the plan as produced");
    assert(plan.receipt?.warehouseId === warehouse.id, "Finished goods were not received into the source warehouse");
    assert(Number(plan.actualUnitCost || 0) > 0, "Production did not calculate an actual unit cost");
    const rawAfter = stockTotal(state, warehouse.id, "QA Device");
    const finishedAfter = stockTotal(state, warehouse.id, plan.product);
    const issuedQty = (plan.issuedMaterials || []).find((item) => item.product === "QA Device")?.qty || 0;
    assert(rawAfter === rawBefore - issuedQty, "Production did not reduce raw material stock");
    assert(finishedAfter >= Number(plan.producedQty || 0), "Production did not increase finished goods stock");
    const finishedProduct = state.products?.find((item) => item.name === plan.product);
    assert(finishedProduct?.costPrice === plan.actualUnitCost, "Finished product catalog did not receive the actual unit cost");
    assert(
      state.auditLog?.some((entry) => entry.action === "Xammal çıxışı və hazır məhsul mədaxili"),
      "Production warehouse movement was not written to the audit log",
    );
    assert(errors.length === 0, `Production costing flow produced browser errors: ${errors.join(" | ")}`);
    return {
      planId: plan.id,
      rawIssued: issuedQty,
      producedQty: plan.producedQty,
      unitCost: plan.actualUnitCost,
      warehouseId: warehouse.id,
    };
  } finally {
    await context.close();
  }
}

async function auditProjectRoiWorkflow(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    await selectModule(page, 12);
    await page.locator('[data-testid="project-roi-control-panel"]').waitFor();
    const panelText = await page.locator(".project-roi-panel").innerText();
    assert(panelText.includes("Avtomatik satış layihəsi") || panelText.includes(sale.order.id), "Project ROI page did not derive a project portfolio from sales");

    await page.locator(".page-header .primary-btn").click();
    await page.waitForTimeout(150);

    const state = await readState(page);
    const snapshot = state.projectRoiSnapshot;
    const exportRow = state.reportExports?.find((item) => item.title === "Layihə ROI");
    assert(snapshot?.projects?.length > 0, "Project ROI export did not persist a snapshot");
    assert(snapshot.summary?.revenue > 0, "Project ROI snapshot did not calculate revenue");
    assert(snapshot.summary?.committedCost > 0, "Project ROI snapshot did not calculate committed cost");
    assert(exportRow?.snapshot?.projects?.length > 0, "Project ROI export was not written to report exports");
    assert(
      state.auditLog?.some((entry) => entry.module === "Layihə ROI" && entry.action === "ROI export"),
      "Project ROI export was not written to the audit log",
    );
    assert(errors.length === 0, `Project ROI flow produced browser errors: ${errors.join(" | ")}`);
    return {
      exportId: exportRow.id,
      revenue: snapshot.summary.revenue,
      roi: Math.round(snapshot.summary.avgRoi),
      projects: snapshot.projects.length,
    };
  } finally {
    await context.close();
  }
}

async function auditHelpOnboardingWorkflow(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 19);
    await page.locator('[data-testid="help-module-guide-panel"]').waitFor();
    await page.locator(".page-header .primary-btn").click();
    await page.waitForTimeout(150);

    let state = await readState(page);
    assert(state.helpGuideSnapshot?.modules >= 15, "Help action did not persist a module guide snapshot");
    assert(state.knowledgeBase?.some((article) => article.category === "Təlim"), "Help action did not create the training article");
    const helpText = await page.locator('[data-testid="help-module-guide-panel"]').innerText();
    assert(helpText.includes("Satış") && helpText.includes("Anbar"), "Help page does not show real module guides");

    await selectModule(page, 20);
    await page.locator('[data-testid="onboarding-command-panel"]').waitFor();
    const onboardingText = await page.locator(".onboarding-panel").innerText();
    assert(onboardingText.includes("ONB-10"), "Onboarding checklist does not include the go-live checklist layer");
    await page.locator(".page-header .primary-btn").click();
    await page.locator(".page-header h1").waitFor();
    const title = await page.locator(".page-header h1").innerText();
    state = await readState(page);
    assert(title.includes("Tənzimləmələr"), "Onboarding action did not route to the next setup module");
    assert(
      state.auditLog?.some((entry) => entry.module === "Onboarding" && entry.action === "Qurulum addımına keçid"),
      "Onboarding route action was not written to the audit log",
    );
    assert(errors.length === 0, `Help/onboarding flow produced browser errors: ${errors.join(" | ")}`);
    return { modules: state.helpGuideSnapshot.modules, onboardingSteps: state.helpGuideSnapshot.onboardingSteps, routedTo: title };
  } finally {
    await context.close();
  }
}

async function auditNotificationProviderDispatch(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    await selectModule(page, 11);
    await page.locator(".page-header .primary-btn").click();
    let modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Notification Vendor");
    await modal.locator("input").nth(1).fill("Azerbaijan");
    await modal.locator("input").nth(2).fill("2");
    await modal.locator("input").nth(3).fill("100");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    await page.locator(".vendor-command-actions .secondary-btn").click();
    modal = page.locator('[role="dialog"]');
    await modal.locator("input").nth(0).fill("QA Notification Vendor");
    await modal.locator("input").nth(1).fill("2");
    await modal.locator("input").nth(2).fill("90");
    await modal.locator("input").nth(3).fill("140");
    await modal.locator("input").nth(5).fill("QA notification dispatch PO");
    await modal.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    await selectModule(page, 22);
    await page.locator('[data-testid="notification-provider-panel"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="notification-run-dispatch"]').click();
    await page.waitForTimeout(150);

    const state = await readState(page);
    const providerText = await page.locator('[data-testid="notification-provider-panel"]').innerText();
    const logText = await page.locator('[data-testid="notification-sendlog-panel"]').innerText();

    assert(providerText.includes("SMS") && providerText.includes("Email") && providerText.includes("Push"), "Notification providers are not visible");
    assert(state.notificationDispatchSnapshot?.sent >= 1, "Notification dispatch did not send queued reminders");
    assert(state.notificationSendLog?.some((entry) => entry.status === "Göndərildi"), "Provider send log did not persist successful delivery rows");
    assert(logText.includes("QA Notification Vendor") || logText.includes("PO-") || logText.includes("QA Device"), "Notification send log did not show dispatched business events");
    assert(
      state.auditLog?.some((entry) => entry.module === "Bildiriş" && entry.action === "Provider göndəriş növbəsi işləndi"),
      "Notification dispatch was not written to the audit log",
    );
    assert(errors.length === 0, `Notification dispatch flow produced browser errors: ${errors.join(" | ")}`);

    return { sent: state.notificationDispatchSnapshot.sent, logRows: state.notificationSendLog.length, creditId: sale.credit.id };
  } finally {
    await context.close();
  }
}

async function auditApiWebhookIntegrationWorkflow(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 23);
    await page.locator('[data-testid="api-console-panel"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="api-endpoint-panel"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="api-secret-panel"]').waitFor({ state: "visible" });

    const endpointText = await page.locator('[data-testid="api-endpoint-panel"]').innerText();
    const secretText = await page.locator('[data-testid="api-secret-panel"]').innerText();
    assert(endpointText.includes("credit.overdue") && endpointText.includes("product.low_stock"), "API endpoint map does not expose default webhook events");
    assert(secretText.includes("ERP_WEBHOOK_SIGNING_SECRET"), "API secret vault does not expose the signing secret");

    await page.locator('[data-testid="api-secret-rotate"]').first().click();
    await page.waitForTimeout(120);
    await page.locator('[data-testid="api-run-webhook-test"]').click();
    await page.waitForTimeout(150);

    const state = await readState(page);
    const log = state.apiWebhookLogs?.[0];
    const rotatedSecret = state.apiSecrets?.find((secret) => secret.key === "ERP_WEBHOOK_SIGNING_SECRET");
    assert((state.apiWebhooks || []).length >= 5, "API webhook defaults were not hydrated");
    assert(log?.responseCode === 200 && log.result === "Uğurlu", "API webhook test did not persist a successful result");
    assert(state.apiIntegrationSnapshot?.result === "Uğurlu", "API integration snapshot was not updated");
    assert(Number(rotatedSecret?.version || 0) >= 2 && rotatedSecret?.lastRotatedBy, "API secret rotation did not persist version metadata");
    assert(
      state.auditLog?.some((entry) => entry.action === "Webhook test nəticəsi") &&
        state.auditLog?.some((entry) => entry.action === "API secret rotasiya edildi"),
      "API webhook test/secret rotation actions were not written to audit log",
    );
    assert(errors.length === 0, `API webhook integration flow produced browser errors: ${errors.join(" | ")}`);
    return { webhookId: log.webhookId, responseCode: log.responseCode, secretVersion: rotatedSecret.version };
  } finally {
    await context.close();
  }
}

async function createHrEmployee(page, values) {
  await page.locator(".page-header .primary-btn").click();
  const modal = page.locator('[role="dialog"]');
  const inputs = modal.locator("input");
  await inputs.nth(0).fill(values.name);
  await inputs.nth(1).fill(values.position);
  await inputs.nth(2).fill(values.department);
  await inputs.nth(3).fill(values.departmentParent || "");
  await modal.locator("select").nth(0).selectOption({ index: values.managerIndex || 0 });
  await modal.locator("select").nth(1).selectOption({ index: values.levelIndex || 0 });
  await inputs.nth(4).fill(String(values.salary));
  if (values.kpi != null) await inputs.nth(5).fill(String(values.kpi));
  if (values.documentsComplete != null) await inputs.nth(6).fill(String(values.documentsComplete));
  if (values.leaveBalance != null) await inputs.nth(9).fill(String(values.leaveBalance));
  await modal.locator('button[type="submit"]').click();
  await page.locator('[role="dialog"]').waitFor({ state: "hidden" });
}

async function auditKpiPeriodPayoutWorkflow(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 14);
    await createHrEmployee(page, {
      name: "QA KPI Seller",
      position: "Satış mütəxəssisi",
      department: "Satış",
      salary: 2000,
      kpi: 110,
    });

    await selectModule(page, 15);
    await page.locator('[data-testid="kpi-period-panel"]').waitFor();
    await page.locator('[data-testid="kpi-payout-plan-panel"]').waitFor();

    const closeButton = page.locator('[data-testid="kpi-close-period"]');
    assert(!(await closeButton.isDisabled()), "KPI close period button should be enabled");
    await closeButton.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="kpi-approve-period"]');
      return button && !button.disabled;
    });

    await page.locator('[data-testid="kpi-approve-period"]').click();
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="kpi-payout-period"]');
      return button && !button.disabled;
    });

    await page.locator('[data-testid="kpi-payout-period"]').click();
    await page.waitForTimeout(200);

    const state = await readState(page);
    const period = state.kpiPeriods?.[0];
    assert(period?.approvalStatus === "Təsdiq edildi", "KPI period was not approved");
    assert(period?.payoutStatus === "Ödənildi", "KPI payout status was not marked as paid");
    assert(Number(period?.payoutAmount || 0) > 0, "KPI payout amount was not calculated");
    assert(
      state.expenses?.some((expense) => expense.source === "KPI Payout" && expense.status === "Təsdiq edildi" && expense.cashImpact === true),
      "KPI payout did not create an approved cash expense",
    );
    assert(state.kpiPayouts?.some((payout) => payout.status === "Ödənildi"), "KPI payout history was not persisted");
    assert(state.auditLog?.some((entry) => entry.action === "KPI payout ödənildi"), "KPI payout was not written to audit log");
    assert(errors.length === 0, `KPI period payout flow produced browser errors: ${errors.join(" | ")}`);
    return { period: period.period, payout: period.payoutAmount };
  } finally {
    await context.close();
  }
}

async function auditHrStructure(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 14);
    await createHrEmployee(page, {
      name: "QA Director",
      position: "Direktor",
      department: "İcraçı rəhbərlik",
      salary: 3000,
    });
    await createHrEmployee(page, {
      name: "QA Sales Manager",
      position: "Satış rəhbəri",
      department: "Satış",
      departmentParent: "İcraçı rəhbərlik",
      managerIndex: 1,
      levelIndex: 1,
      salary: 2200,
    });
    await createHrEmployee(page, {
      name: "QA B2B Specialist",
      position: "B2B mütəxəssisi",
      department: "B2B satış",
      departmentParent: "Satış",
      managerIndex: 1,
      levelIndex: 3,
      salary: 1300,
      leaveBalance: 14,
    });

    const state = await readState(page);
    const employees = state.employees || [];
    assert(employees.length === 3, "HR employee creation did not persist all employees");
    assert(
      employees.every((employee) => employee.hrStatus === "Stabil" && Number(employee.documentsComplete) === 100),
      "New employee was incorrectly marked as awaiting information",
    );
    assert(
      employees.find((employee) => employee.name === "QA B2B Specialist")?.managerId ===
        employees.find((employee) => employee.name === "QA Sales Manager")?.id,
      "Employee manager relationship was not stored by ID",
    );

    const salesNode = page.locator(".hr-org-card").filter({ hasText: "QA Sales Manager" });
    await salesNode.waitFor();
    const b2bNode = page.locator(".hr-org-card").filter({ hasText: "QA B2B Specialist" });
    await b2bNode.waitFor();
    await salesNode.click();
    await b2bNode.waitFor({ state: "hidden" });
    await salesNode.click();
    await b2bNode.waitFor();

    const reportingPanel = page.locator(".hr-reporting-panel");
    await reportingPanel.locator(".hr-employee-node").filter({ hasText: "QA B2B Specialist" }).click();
    await page.locator(".hr-profile-head").filter({ hasText: "QA B2B Specialist" }).waitFor();
    await page.locator(".hr-profile-edit").click();
    const editModal = page.locator('[role="dialog"]');
    await editModal.locator("input").nth(1).fill("Senior B2B Specialist");
    await editModal.locator("input").nth(4).fill("1750");
    await editModal.locator("input").nth(6).fill("60");
    await editModal.locator('button[type="submit"]').click();
    await editModal.waitFor({ state: "hidden" });
    const updatedState = await readState(page);
    const updatedEmployee = updatedState.employees.find((employee) => employee.name === "QA B2B Specialist");
    assert(updatedEmployee?.position === "Senior B2B Specialist", "Employee edit did not persist the new position");
    assert(Number(updatedEmployee?.salary) === 1750, "Employee edit did not persist the new salary");
    assert(
      Number(updatedEmployee?.documentsComplete) === 60 && updatedEmployee?.documentReviewRequired === true,
      "Employee document completion status did not persist",
    );
    assert(
      updatedState.auditLog?.some((row) => row.action === "Əməkdaş redaktə edildi"),
      "Employee edit did not create an audit log entry",
    );
    await page.locator('[data-testid="hr-document-complete"]').click();
    await page.waitForTimeout(100);
    const documentState = await readState(page);
    const documentedEmployee = documentState.employees.find((employee) => employee.name === "QA B2B Specialist");
    assert(
      Number(documentedEmployee?.documentsComplete) === 100 && documentedEmployee?.documentReviewRequired === false,
      "Employee document completion action did not close document risk",
    );
    assert(
      documentState.auditLog?.some((row) => row.action === "Əməkdaş sənədləri yeniləndi"),
      "Employee document completion did not create an audit log entry",
    );
    await page.locator(".hr-person-row").filter({ hasText: "QA Sales Manager" }).click();
    await page.locator(".hr-profile-head").filter({ hasText: "QA Sales Manager" }).waitFor();
    await page.locator(".hr-profile-edit").click();
    const managerEditModal = page.locator('[role="dialog"]');
    await managerEditModal.locator("input").nth(0).fill("QA Sales Lead");
    await managerEditModal.locator('button[type="submit"]').click();
    await managerEditModal.waitFor({ state: "hidden" });
    const renamedState = await readState(page);
    const renamedManager = renamedState.employees.find((employee) => employee.name === "QA Sales Lead");
    assert(
      renamedState.employees.find((employee) => employee.name === "QA B2B Specialist")?.managerName === "QA Sales Lead",
      "Employee rename did not update direct reports' manager names",
    );
    await page.locator(".hr-structure-actions .secondary-btn").click();
    const departmentModal = page.locator('[role="dialog"]');
    await departmentModal.locator("input").nth(0).fill("QA New Department");
    await departmentModal.locator("textarea").fill("QA department for hierarchy validation");
    await departmentModal.locator('button[type="submit"]').click();
    await departmentModal.waitFor({ state: "hidden" });
    const departmentState = await readState(page);
    assert(
      departmentState.departments?.some((department) => department.name === "QA New Department"),
      "Department creation did not persist the new department",
    );
    await page.locator(".hr-org-card").filter({ hasText: "QA New Department" }).waitFor();

    await page.locator(".hr-person-row").filter({ hasText: "QA Sales Lead" }).click();
    await page.locator(".hr-profile-head").filter({ hasText: "QA Sales Lead" }).waitFor();
    await page.locator(".hr-profile-delete").click();
    const deleteModal = page.locator('[role="dialog"]');
    await deleteModal.locator(".hr-delete-reassignment select").selectOption({ index: 1 });
    await deleteModal.locator(".danger-outline").click();
    await deleteModal.waitFor({ state: "hidden" });
    const deletedState = await readState(page);
    assert(!deletedState.employees.some((employee) => employee.name === "QA Sales Lead"), "Employee delete did not remove the employee");
    assert(
      deletedState.employees.find((employee) => employee.name === "QA B2B Specialist")?.managerName === "QA Director",
      "Employee delete did not reassign direct reports",
    );
    assert(
      deletedState.auditLog?.some((row) => row.action === "Əməkdaş silindi"),
      "Employee delete did not create an audit log entry",
    );
    assert(
      deletedState.departments?.some((department) => department.name === renamedManager?.department),
      "Deleting the last employee removed the department from the structure",
    );

    const hrTabs = page.locator(".hr-platform-toolbar .tabs button");
    await hrTabs.nth(3).click();
    await page.locator(".hr-platform-section tbody tr").filter({ hasText: "QA B2B Specialist" }).locator(".hr-payroll-actions .text-btn").click();
    await page.waitForTimeout(100);
    const payrollState = await readState(page);
    const payrollEmployee = payrollState.employees.find((employee) => employee.name === "QA B2B Specialist");
    assert(
      payrollEmployee?.payrollStatus === "Ödənildi" && payrollEmployee?.payrollPaidAt,
      "Payroll paid status did not persist on employee record",
    );
    assert(
      payrollState.auditLog?.some((row) => row.action === "Payroll ödəniş statusu dəyişdi"),
      "Payroll status update did not create an audit log entry",
    );

    await hrTabs.nth(2).click();
    await page.locator(".hr-operation-toolbar .secondary-btn").click();
    const leaveModal = page.locator('[role="dialog"]');
    await leaveModal.locator("select").first().selectOption({ index: 1 });
    await leaveModal.locator('button[type="submit"]').click();
    await leaveModal.waitFor({ state: "hidden" });
    const leaveState = await readState(page);
    assert(leaveState.leaveRequests?.length === 1, "Leave request did not persist");
    await page.locator(".hr-platform-section tbody tr").filter({ hasText: leaveState.leaveRequests[0].employeeName }).locator(".hr-leave-actions .text-btn").first().click();
    await page.waitForTimeout(100);
    const approvedLeaveState = await readState(page);
    assert(
      approvedLeaveState.leaveRequests?.[0]?.status === "Təsdiq edildi",
      "Leave approval did not persist the approved status",
    );
    assert(
      approvedLeaveState.auditLog?.some((row) => row.action === "Məzuniyyət statusu dəyişdi"),
      "Leave status update did not create an audit log entry",
    );

    await hrTabs.nth(4).click();
    await page.locator(".hr-operation-toolbar .secondary-btn").click();
    const vacancyModal = page.locator('[role="dialog"]');
    await vacancyModal.locator("input").nth(0).fill("QA Recruitment Role");
    await vacancyModal.locator("input").nth(1).fill("QA New Department");
    await vacancyModal.locator('button[type="submit"]').click();
    await vacancyModal.waitFor({ state: "hidden" });
    const vacancyState = await readState(page);
    assert(vacancyState.vacancies?.some((vacancy) => vacancy.role === "QA Recruitment Role"), "Vacancy creation did not persist");
    await page.locator(".hr-recruitment-card").filter({ hasText: "QA Recruitment Role" }).waitFor();

    await selectModule(page, 24);
    await page.getByRole("button", { name: "Integrity yoxla" }).click();
    await page.waitForTimeout(75);
    const integrityState = await readState(page);
    assert(integrityState.integritySnapshot, "Integrity check did not create a snapshot");
    assert(
      !integrityState.integritySnapshot.issues?.some((issue) => issue.area === "HR"),
      "Healthy HR structure produced an integrity warning",
    );
    const payrollExpense = integrityState.expenses?.find((expense) => expense.source === "HR Payroll");
    assert(payrollExpense?.cashImpact === false, "HR payroll expense should not affect real cash balance");
    assert(errors.length === 0, `HR structure produced browser errors: ${errors.join(" | ")}`);
    return { employees: employees.length, selectedEmployee: "QA B2B Specialist", updatedSalary: updatedEmployee.salary, department: "QA New Department" };
  } finally {
    await context.close();
  }
}

async function auditSettingsPermissions(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 24);
    const form = page.locator(".user-create-form");
    const userName = `QA Permission User ${Date.now().toString().slice(-5)}`;
    const userEmail = `qa-permission-${Date.now().toString().slice(-5)}@example.com`;
    await form.locator("input").nth(0).fill(userName);
    await form.locator("input").nth(1).fill(userEmail);
    await form.locator("select").first().selectOption({ label: "Anbar İşçisi" });
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    let state = await readState(page);
    const user = state.settings.users.find((item) => item.email === userEmail);
    assert(user?.role === "Anbar İşçisi", "Settings did not create the permission test user");
    assert(user.moduleAccess?.includes("warehouse"), "Role module access did not include warehouse");
    assert(!user.moduleAccess?.includes("sales"), "Role module access incorrectly included sales");
    const effectiveCell = page.locator("tr").filter({ hasText: userEmail }).locator(".permission-effective-cell");
    await effectiveCell.waitFor();
    const effectiveText = await effectiveCell.innerText();
    assert(effectiveText.includes("aktiv permission"), "Settings UI did not show effective permission summary");

    await page.locator('[data-testid="production-hardening-check"]').click();
    await page.waitForTimeout(120);
    state = await readState(page);
    assert(state.productionHardeningSnapshot?.score >= 0, "Production hardening check did not persist a snapshot");
    assert(
      state.auditLog?.some((entry) => entry.action === "Production hardening yoxlandı"),
      "Production hardening check was not written to audit log",
    );

    await page.locator(".user-switcher select").selectOption(user.id);
    await page.waitForTimeout(150);
    await page.locator(".page-header h1").filter({ hasText: "İdarəetmə Paneli" }).waitFor();
    assert((await page.locator(".nav-item").filter({ hasText: "Ayarlar" }).count()) === 0, "Restricted user should not see Settings nav");
    assert((await page.locator(".nav-item").filter({ hasText: "Satış" }).count()) === 0, "Restricted user should not see Sales nav");

    await page.locator(".nav-item").filter({ hasText: "Hesabatlar" }).click();
    const reportButton = page.locator(".page-header .primary-btn");
    await reportButton.waitFor();
    assert(await reportButton.isDisabled(), "Reports export button should be disabled without reports.export");

    await page.locator(".nav-item").filter({ hasText: "Anbar" }).click();
    const warehouseButton = page.locator(".page-header .primary-btn");
    await warehouseButton.waitFor();
    assert(!(await warehouseButton.isDisabled()), "Warehouse action should be enabled for warehouse role");

    state = await readState(page);
    assert(
      state.auditLog?.some((entry) => entry.action === "Giriş edildi" && entry.detail.includes(userName)),
      "Switching to restricted user did not write login audit",
    );
    assert(errors.length === 0, `Settings permission flow produced browser errors: ${errors.join(" | ")}`);

    return { user: userEmail, role: user.role, modules: user.moduleAccess.length };
  } finally {
    await context.close();
  }
}

async function auditReportsAnalytics(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await createCreditSale(page);
    await selectModule(page, 17);
    await page.locator('[data-testid="reports-control-panel"]').waitFor();
    await page.locator('[data-testid="report-module-panel"]').waitFor();
    await page.locator('[data-testid="report-risk-panel"]').waitFor();

    const controlText = await page.locator('[data-testid="reports-control-panel"]').innerText();
    assert(controlText.includes("Dövr"), "Reports control panel does not show the reporting period");
    assert(controlText.includes("Data həcmi"), "Reports control panel does not show the data package size");

    await page.locator('[data-testid="report-template-export"]').first().click();
    await page.waitForTimeout(150);

    const state = await readState(page);
    const exportRow = state.reportExports?.[0];
    assert(exportRow?.snapshot, "Report export did not persist a snapshot");
    assert(exportRow?.format, "Report export did not persist the selected format");
    assert(exportRow.snapshot.moduleRows?.length >= 6, "Report snapshot does not contain module analytics");
    assert(Array.isArray(exportRow.snapshot.riskRows), "Report snapshot does not contain a risk register");
    assert(Number(exportRow.score) >= 0, "Report export did not calculate a readiness score");
    assert(
      state.auditLog?.some((entry) => entry.module === "Hesabat" && entry.action === "Export hazırlandı"),
      "Report export was not written to the audit log",
    );
    assert(errors.length === 0, `Reports analytics flow produced browser errors: ${errors.join(" | ")}`);
    return { exportId: exportRow.id, format: exportRow.format, score: exportRow.score, risks: exportRow.riskCount };
  } finally {
    await context.close();
  }
}

async function auditSupportMessaging(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await createCreditSale(page);
    await selectModule(page, 18);
    await page.locator(".page-header .primary-btn").click();
    await page.locator('[data-testid="support-task-panel"]').waitFor();
    await page.locator('[data-testid="support-comment-input"]').fill("QA bağlı support comment");
    await page.locator('[data-testid="support-comment-submit"]').click();
    await page.waitForTimeout(150);

    let state = await readState(page);
    let ticket = state.supportTickets?.[0];
    assert(ticket?.id, "Support action did not create a task");
    assert(ticket.orderId || ticket.creditId || ticket.fin, "Support task was not linked to an order, credit, or customer");
    assert(ticket.comments?.some((comment) => comment.text.includes("QA bağlı support comment")), "Support comment was not saved on the task");
    let conversation = state.conversations?.find((item) => item.ticketId === ticket.id);
    assert(conversation?.messages?.some((message) => message.text.includes("QA bağlı support comment")), "Support comment was not mirrored to messages");

    await selectModule(page, 21);
    await page.locator(".chat-panel").waitFor();
    const chatText = await page.locator(".chat-panel").innerText();
    assert(chatText.includes(ticket.id), "Message thread does not show the linked support task");
    await page.locator(".composer input").fill("QA mesajdan task cavabı");
    await page.locator(".composer button").click();
    await page.waitForTimeout(150);

    state = await readState(page);
    ticket = state.supportTickets?.find((item) => item.id === ticket.id);
    conversation = state.conversations?.find((item) => item.ticketId === ticket.id);
    assert(ticket?.comments?.some((comment) => comment.text.includes("QA mesajdan task cavabı")), "Message reply was not written back to the support task");
    assert(conversation?.messages?.some((message) => message.text.includes("QA mesajdan task cavabı")), "Message reply was not saved on the thread");
    assert(
      state.auditLog?.some((entry) => entry.action === "Task comment əlavə edildi") &&
        state.auditLog?.some((entry) => entry.action === "Bağlı task-a mesaj yazıldı"),
      "Support/message actions were not written to the audit log",
    );
    assert(errors.length === 0, `Support messaging flow produced browser errors: ${errors.join(" | ")}`);
    return { ticketId: ticket.id, threadId: conversation.id, comments: ticket.comments.length };
  } finally {
    await context.close();
  }
}

const auditServer = await ensureAuditServer();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const report = { flows: [], failures: [] };
const flowFilter = process.env.AUDIT_FLOW_FILTER?.trim();
const flowTimeoutMs = Number(process.env.AUDIT_FLOW_TIMEOUT_MS || 60000);

const auditFlows = [
  ["sales-credit-warehouse-reservation", auditCreditSale],
  ["sales-expense-edit-delete", auditSalesAndExpenseMutations],
  ["credit-payment-finance-cash", auditCreditPayment],
  ["credit-contracts-remain-separate", auditSeparateCreditContracts],
  ["warehouse-delivery-stock-release", auditWarehouseDelivery],
  ["purchase-order-warehouse-finance", auditPurchaseOrder],
  ["vendor-edit-delete-lifecycle", auditVendorLifecycle],
  ["finance-module-integrated-ledger", auditFinanceModuleIntegration],
  ["receivable-creditor-aging-close-workflow", auditReceivableCreditorWorkflow],
  ["invoice-accounting-tax-workflow", auditInvoiceAccountingTax],
  ["warehouse-csv-import-catalog-stock", auditWarehouseImport],
  ["production-costing-warehouse-bom", auditProductionCosting],
  ["project-roi-reporting-workflow", auditProjectRoiWorkflow],
  ["help-onboarding-training-workflow", auditHelpOnboardingWorkflow],
  ["notification-provider-dispatch-workflow", auditNotificationProviderDispatch],
  ["api-webhook-integration-workflow", auditApiWebhookIntegrationWorkflow],
  ["kpi-period-payout-workflow", auditKpiPeriodPayoutWorkflow],
  ["hr-department-reporting-structure", auditHrStructure],
  ["settings-role-permission-enforcement", auditSettingsPermissions],
  ["reports-analytics-export-package", auditReportsAnalytics],
  ["support-messaging-linked-comments", auditSupportMessaging],
].filter(([name]) => !flowFilter || name.includes(flowFilter));

for (const [name, run] of auditFlows) {
  console.log(`[audit] ${name} started`);
  try {
    const result = await Promise.race([
      run(browser),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Flow exceeded ${flowTimeoutMs} ms`)), flowTimeoutMs),
      ),
    ]);
    report.flows.push({ name, result });
    console.log(`[audit] ${name} passed`);
  } catch (error) {
    report.failures.push({ name, error: error.message });
    console.error(`[audit] ${name} failed: ${error.message}`);
  }
}

await browser.close();
auditServer?.kill();
console.log(JSON.stringify(report, null, 2));

if (report.flows.length !== 21 || report.failures.length > 0) {
  process.exitCode = 1;
}
