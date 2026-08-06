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
  throw new Error(`Audit server ${baseUrl} ГјnvanД±nda baЕџlamadД±`);
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
    await expenseRow.getByText("RedaktЙ™").click();
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
    await page.locator(".page-header h1").filter({ hasText: "SatД±Еџ" }).waitFor();
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
    assert(cardCount >= …11040 tokens truncated…nd((employee) => employee.name === "QA B2B Specialist")?.managerId ===
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
      updatedState.auditLog?.some((row) => row.action === "ЖЏmЙ™kdaЕџ redaktЙ™ edildi"),
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
      documentState.auditLog?.some((row) => row.action === "ЖЏmЙ™kdaЕџ sЙ™nЙ™dlЙ™ri yenilЙ™ndi"),
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
      deletedState.auditLog?.some((row) => row.action === "ЖЏmЙ™kdaЕџ silindi"),
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
      payrollEmployee?.payrollStatus === "Г–dЙ™nildi" && payrollEmployee?.payrollPaidAt,
      "Payroll paid status did not persist on employee record",
    );
    assert(
      payrollState.auditLog?.some((row) => row.action === "Payroll Г¶dЙ™niЕџ statusu dЙ™yiЕџdi"),
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
      approvedLeaveState.leaveRequests?.[0]?.status === "TЙ™sdiq edildi",
      "Leave approval did not persist the approved status",
    );
    assert(
      approvedLeaveState.auditLog?.some((row) => row.action === "MЙ™zuniyyЙ™t statusu dЙ™yiЕџdi"),
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
    await form.locator("select").first().selectOption({ label: "Anbar Д°ЕџГ§isi" });
    await form.locator('button[type="submit"]').click();
    await page.waitForTimeout(100);

    let state = await readState(page);
    const user = state.settings.users.find((item) => item.email === userEmail);
    assert(user?.role === "Anbar Д°ЕџГ§isi", "Settings did not create the permission test user");
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
      state.auditLog?.some((entry) => entry.action === "Production hardening yoxlandД±"),
      "Production hardening check was not written to audit log",
    );

    await page.locator(".user-switcher select").selectOption(user.id);
    await page.waitForTimeout(150);
    await page.locator(".page-header h1").filter({ hasText: "Д°darЙ™etmЙ™ Paneli" }).waitFor();
    assert((await page.locator(".nav-item").filter({ hasText: "Ayarlar" }).count()) === 0, "Restricted user should not see Settings nav");
    assert((await page.locator(".nav-item").filter({ hasText: "SatД±Еџ" }).count()) === 0, "Restricted user should not see Sales nav");

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
      state.auditLog?.some((entry) => entry.action === "GiriЕџ edildi" && entry.detail.includes(userName)),
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
    assert(controlText.includes("DГ¶vr"), "Reports control panel does not show the reporting period");
    assert(controlText.includes("Data hЙ™cmi"), "Reports control panel does not show the data package size");

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
      state.auditLog?.some((entry) => entry.module === "Hesabat" && entry.action === "Export hazД±rlandД±"),
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
    await page.locator('[data-testid="support-comment-input"]').fill("QA baДџlД± support comment");
    await page.locator('[data-testid="support-comment-submit"]').click();
    await page.waitForTimeout(150);

    let state = await readState(page);
    let ticket = state.supportTickets?.[0];
    assert(ticket?.id, "Support action did not create a task");
    assert(ticket.orderId || ticket.creditId || ticket.fin, "Support task was not linked to an order, credit, or customer");
    assert(ticket.comments?.some((comment) => comment.text.includes("QA baДџlД± support comment")), "Support comment was not saved on the task");
    let conversation = state.conversations?.find((item) => item.ticketId === ticket.id);
    assert(conversation?.messages?.some((message) => message.text.includes("QA baДџlД± support comment")), "Support comment was not mirrored to messages");

    await selectModule(page, 21);
    await page.locator(".chat-panel").waitFor();
    const chatText = await page.locator(".chat-panel").innerText();
    assert(chatText.includes(ticket.id), "Message thread does not show the linked support task");
    await page.locator(".composer input").fill("QA mesajdan task cavabД±");
    await page.locator(".composer button").click();
    await page.waitForTimeout(150);

    state = await readState(page);
    ticket = state.supportTickets?.find((item) => item.id === ticket.id);
    conversation = state.conversations?.find((item) => item.ticketId === ticket.id);
    assert(ticket?.comments?.some((comment) => comment.text.includes("QA mesajdan task cavabД±")), "Message reply was not written back to the support task");
    assert(conversation?.messages?.some((message) => message.text.includes("QA mesajdan task cavabД±")), "Message reply was not saved on the thread");
    assert(
      state.auditLog?.some((entry) => entry.action === "Task comment Й™lavЙ™ edildi") &&
        state.auditLog?.some((entry) => entry.action === "BaДџlД± task-a mesaj yazД±ldД±"),
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

