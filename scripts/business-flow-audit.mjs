import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { assertE2eTarget } from '../tests/e2e-target.mjs';
import { auditResponse, auditServerArguments, runBoundedFlow, waitForAuditModule } from './audit-flow-runner.mjs';
import { auditModulePath, createAuditBackend, findNewLinkedCreditSale, verifyRestrictedRoleAudit } from './supabase-audit-backend.mjs';
import { navItems } from '../src/data.js';
import { moduleRoutes } from '../src/config/routes.js';
import { round2 } from '../src/shared/utils/invoiceMath.js';

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5174/";
let auditBackend;
let currentFlowName = 'startup';
const fixtureByPage = new WeakMap();

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
  if (process.env.CI === 'true') {
    // Release gates must build the exact application before its business audit.
    await readFile('dist/index.html');
  }
  const server = spawn(process.execPath, auditServerArguments(url), {
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
  page.on('response', async response => {
    const path = new URL(response.url()).pathname;
    if (response.ok() || !path.startsWith('/rest/v1/')) return;
    const detail = await response.text().catch(() => 'Response body unavailable');
    errors.push(`Supabase ${path}: ${response.status()} ${detail.slice(0,1200)}`);
  });
}

async function createFlowPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  const page = await context.newPage();
  const evidenceName = currentFlowName;
  const closeContext = context.close.bind(context);
  let closing = false;
  context.close = async () => {
    if (closing) return;
    closing = true;
    if (errors.length) console.warn(`[audit] ${evidenceName} browser diagnostics: ${errors.join(' | ')}`);
    try {
      if (!page.isClosed()) {
        await mkdir('test-results/audit-evidence', { recursive: true });
        await page.screenshot({ path: `test-results/audit-evidence/${evidenceName}.png`, fullPage: true, timeout: 5000 });
      }
    } catch (error) {
      console.warn(`[audit] Screenshot unavailable for ${evidenceName}: ${error.message}`);
    } finally {
      await closeContext();
    }
  };
  page.setDefaultTimeout(8000);
  const errors = [];
  collectErrors(page, errors);
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: auditBackend.storageKey, session: auditBackend.session });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
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
      await page.locator('a[href="/satis/sifarisler"]').first().waitFor({ state: "visible", timeout: 15000 });
    } catch {
      const authError = await page.locator(".xp-al.e, .form-error").first().innerText().catch(() => "");
      throw new Error(`E2E login did not reach the application${authError ? `: ${authError}` : ""}`);
    }
  }
  // The backend already checked membership and schema; readiness is a UI concern.
  await page.locator('.sidebar .nav-list').waitFor({ state: 'visible', timeout: 15000 });
  return { context, page, errors };
}

async function selectModule(page, index) {
  const path = auditModulePath(index);
  await selectPath(page, path);
}

async function selectPath(page, path) {
  const item = navItems.find(item => moduleRoutes[item.id] === path);
  assert(item, `AUDIT_MODULE_UNAVAILABLE: no navigation entry for ${path}`);
  const sidebar = page.locator('.sidebar .nav-list');
  await sidebar.waitFor();
  const groups = { crm: 'CRM', sales: 'Satış', supply: 'Təchizat & Anbar', finance: 'Maliyyə',
    ops: 'Əməliyyat', analytics: 'Analitika', system: 'Sistem' };
  if (item.group) {
    const group = sidebar.getByRole('button', { name: groups[item.group], exact: true });
    await group.waitFor();
    if (await group.getAttribute('aria-expanded') !== 'true') await group.click();
  }
  await sidebar.getByRole('button', { name: item.label, exact: true }).click();
  await waitForAuditModule(page, path, item.label);
  assert(new URL(page.url()).pathname === path, `AUDIT_MODULE_REDIRECTED: expected ${path}, received ${new URL(page.url()).pathname}`);
  await page.locator('main.main').waitFor();
}

async function readState(page) {
  return auditBackend.readState(flowReadOptions());
}

function flowReadOptions() {
  if (['sales-credit-warehouse-reservation','sales-expense-edit-delete','credit-payment-finance-cash',
    'credit-contracts-remain-separate','warehouse-delivery-stock-release','finance-module-integrated-ledger'].includes(currentFlowName)) return { scope: 'sales-ledger' };
  if (currentFlowName === 'hr-department-reporting-structure') return { scope: 'hr' };
  if (currentFlowName === 'support-messaging-linked-comments') return { scope: 'ui' };
  return { scope: 'all' };
}

async function readHrState() {
  return auditBackend.readState({ scope: 'hr' });
}

async function waitForHrState(predicate, message) {
  return waitForState(predicate, message, { scope: 'hr' });
}

async function waitForState(predicate, message, options) {
  const deadline = Date.now() + 15000;
  do {
    const state = await auditBackend.readState(options || flowReadOptions());
    if (predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(message);
}

async function waitForCanonical(readRows, predicate, message) {
  const deadline = Date.now() + 15000;
  do {
    const rows = await readRows();
    if (predicate(rows)) return rows;
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(message);
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
  await page.locator('.page-header').getByRole('heading', { name: 'Anbar idarəetməsi', exact: true }).waitFor();
  const suffix = crypto.randomUUID().slice(0, 8);
  const code = `WH-QA-${suffix}`;
  const sku = `SKU-QA-${suffix}`.toUpperCase();
  const productName = `QA Device ${suffix}`;
  await page.getByRole('button', { name: '+ Yeni anbar', exact: true }).click();
  const warehouseForm = page.locator('form').filter({ has: page.getByPlaceholder('Kod', { exact: true }) });
  await warehouseForm.getByPlaceholder('Kod', { exact: true }).fill(code);
  await warehouseForm.getByPlaceholder('Ad', { exact: true }).fill(`QA Warehouse ${suffix}`);
  await warehouseForm.getByPlaceholder('Ünvan', { exact: true }).fill('QA Address');
  await warehouseForm.getByRole('button', { name: '+ Anbar', exact: true }).click();
  const [warehouse] = await waitForCanonical(() => auditBackend.readCanonical('warehouses', '*', `&code=eq.${code}`),
    rows => rows.length === 1, 'Warehouse was not persisted');
  await selectPath(page, '/anbar/mehsullar');
  await page.getByRole('button', { name: 'Əməliyyatlar', exact: true }).click();
  await page.locator('.warehouse-action-menu-popover').getByRole('button', { name: 'Məhsul yarat', exact: true }).click();
  const productForm = page.getByRole('dialog');
  await productForm.getByLabel('SKU', { exact: true }).fill(sku);
  await productForm.getByLabel('Məhsul adı', { exact: true }).fill(productName);
  await productForm.getByLabel('Satış qiyməti', { exact: true }).fill('1200');
  await productForm.getByRole('button', { name: 'Məhsul yarat', exact: true }).click();
  await productForm.waitFor({ state: 'hidden' });
  const [product] = await waitForCanonical(() => auditBackend.readCanonical('products', '*', `&sku=eq.${sku}`),
    rows => rows.length === 1, 'Product was not persisted');
  await selectModule(page, 3);
  await page.getByRole('button', { name: 'Hərəkətlər', exact: true }).click();
  const intakeForm = page.locator('form').filter({ has: page.getByPlaceholder('Say', { exact: true }) });
  await intakeForm.locator('select').filter({ has: page.locator('option', { hasText: 'Anbar seç' }) }).selectOption(warehouse.id);
  await intakeForm.getByPlaceholder('Məhsul adı və ya SKU yazın', { exact: true }).fill(sku);
  await intakeForm.getByRole('button', { name: `${productName} ${sku}`, exact: true }).click();
  await intakeForm.getByPlaceholder('Say', { exact: true }).fill('5');
  await intakeForm.getByPlaceholder('Maya dəyəri', { exact: true }).fill('1200');
  await intakeForm.getByPlaceholder('Sənəd №', { exact: true }).fill(code);
  await intakeForm.getByRole('button', { name: '+ Qeyd et', exact: true }).click();
  const [balance] = await waitForCanonical(() => auditBackend.readCanonical('stock_balances', '*',
    `&warehouse_id=eq.${warehouse.id}&product_id=eq.${product.id}`), rows => rows.length === 1 && Number(rows[0].on_hand) === 5,
    'Warehouse intake was not persisted');
  assert(warehouse, "Warehouse seed was not created");
  assert(Number(balance.on_hand) === 5, "Warehouse intake did not create the seed stock");
  assert(product.sku === sku, "Warehouse intake did not create the product catalog record");
  fixtureByPage.set(page, { warehouse, product, productName, sku });
  return warehouse;
}

async function createCustomer(page) {
  await selectModule(page, 1);
  await page.getByRole('button', { name: '+ Yeni müştəri', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Yeni müştəri', exact: true });
  const fin = `Q${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
  await modal.getByLabel('Ad və soyad / şirkət adı *', { exact: true }).fill(`QA Customer ${fin}`);
  await modal.getByLabel('FİN kod', { exact: true }).fill(fin);
  await modal.getByLabel('Telefon', { exact: true }).fill('0500000000');
  await modal.getByRole('button', { name: 'Yarat', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  const [customer] = await waitForCanonical(() => auditBackend.readCanonical('customers', '*', `&tax_id=eq.${fin}`),
    rows => rows.length === 1, 'Customer was not persisted');
  fixtureByPage.set(page, { ...fixtureByPage.get(page), customer });
  return fin;
}

async function createCreditSaleFromCurrentData(page, expectedFin) {
  const employees = await auditBackend.readCollections(['employees']);
  if (!employees.some(e => e.data?.name === 'QA Audit Seller')) {
    await selectModule(page, 14);
    await createHrEmployee(page, { name: 'QA Audit Seller', position: 'Satıcı', department: 'Satış', salary: 0 });
  }
  await selectModule(page, 2);
  const fixture = fixtureByPage.get(page);
  assert(fixture?.customer, 'Missing isolated customer fixture');
  const scope = { scope: 'sales', customerId: fixture.customer.id, warehouseId: fixture.warehouse.id };
  const before = await auditBackend.readState(scope);
  await page.locator(".page-header .primary-btn").click();
  const modal = page.locator('[role="dialog"]');
  assert(fixture, 'Missing isolated warehouse fixture');
  await modal.getByRole('combobox', { name: 'Müştəri axtar və seç', exact: true }).fill(expectedFin);
  await modal.getByRole('option').filter({ hasText: expectedFin }).click();
  await modal.getByRole('combobox', { name: 'Ödəniş tipi', exact: true }).selectOption('Kredit');
  await modal.getByRole('combobox', { name: 'Rezerv anbarı', exact: true }).selectOption(fixture.warehouse.id);
  await modal.getByRole('combobox', { name: 'Məhsul axtar və seç', exact: true }).fill(fixture.productName);
  await modal.getByRole('option').filter({ hasText: fixture.productName }).click();
  await modal.getByRole('spinbutton', { name: 'Qiymət', exact: true }).fill('1200');
  await modal.getByRole('spinbutton', { name: 'İlkin ödəniş hədəfi', exact: true }).fill('200');
  await modal.getByRole('spinbutton', { name: 'Beh məbləği', exact: true }).fill('0');
  await modal.getByRole('combobox', { name: 'Satıcı axtar və seç', exact: true }).fill('QA Audit Seller');
  await modal.getByRole('option').filter({ hasText: 'QA Audit Seller' }).first().click();
  await modal.locator(".order-modal-form button[type=submit]").click();
  await modal.waitFor({ state: 'hidden' });
  const after = await waitForState(s => Boolean(findNewLinkedCreditSale(s, before.orders, expectedFin)),
    'Sale and its credit/contract links were not persisted', scope);
  const order = findNewLinkedCreditSale(after, before.orders, expectedFin);
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
    await page.getByPlaceholder('Axtar...', { exact: true }).fill(sale.order.orderNo);
    await page.getByLabel('Başlanğıc tarixi', { exact: true }).fill(sale.order.date);
    await page.getByLabel('Son tarix', { exact: true }).fill(sale.order.date);
    await page.locator('main.main table tbody tr').filter({ hasText: sale.order.orderNo }).waitFor({ state: 'visible' });
    const registryText = await page.locator('main.main table').innerText();
    assert(registryText.includes(sale.order.orderNo), "Sales registry search did not keep the created order visible");
    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole('button', { name: 'CSV ixrac', exact: true }).click(),
    ]).then(([file]) => file);
    assert(download.suggestedFilename().includes("satis-reyestri"), "Sales registry export did not create the expected CSV file");
    const csv = await readFile(await download.path(), 'utf8');
    assert(csv.includes(sale.order.orderNo) && csv.includes(sale.contract.id), 'Sales export lost the order/contract link');
    await selectModule(page, 9);
    await page.getByPlaceholder('Müştəri, kredit kodu, müqavilə...', { exact: true }).fill(sale.contract.id);
    await page.locator('main.main tr').filter({ hasText: sale.contract.id }).waitFor();
    assert(sale.credit.orderId === sale.order.id && sale.contract.creditId === sale.credit.id, 'Credit registry contract lost its structural order link');
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

    await page.locator('main.main tr').filter({ hasText: sale.order.orderNo }).click();
    await page.getByRole('button', { name: 'Redaktə et', exact: true }).click();
    await page.getByLabel('Qiymət', { exact: true }).fill('1300');
    await page.getByRole('button', { name: 'Dəyişiklikləri yadda saxla', exact: true }).click();
    let state = await waitForState(s => s.orders.find(o => o.id === sale.order.id)?.amount === 1300
      && s.credits.find(c => c.id === sale.credit.id)?.total === 1300,
      'Sales edit did not update order amount');
    let editedOrder = state.orders.find((item) => item.id === sale.order.id);
    let editedCredit = state.credits.find((item) => item.id === editedOrder?.creditId);
    assert(editedOrder?.amount === 1300, "Sales edit did not update order amount");
    assert(editedCredit?.total === 1300, "Sales edit did not sync credit total");
    assert(editedCredit?.initialPayment === sale.credit.initialPayment && editedCredit?.initialPaid === sale.credit.initialPaid,
      'Editing a sale silently changed its deposit target or collected deposit');
    await page.locator('main.main tr').filter({ hasText: sale.order.orderNo }).click();
    await page.getByRole('button', { name: 'Ləğv et', exact: true }).click();
    const reversal = page.getByRole('dialog', { name: 'Satışın ləğv təsiri', exact: true });
    await reversal.getByRole('button', { name: 'Satışı ləğv et', exact: true }).click();
    state = await waitForState(s => !s.orders.some(o => o.id === sale.order.id)
      && s.credits.find(c => c.id === sale.credit.id)?.status === 'cancelled', 'Sales cancellation did not cancel linked credit');
    assert(!state.orders.some((item) => item.id === sale.order.id), "Sales delete did not remove order");
    assert(state.credits.find(item => item.id === sale.credit.id)?.status === 'cancelled', 'Sales cancellation lost cancelled credit history');
    assert(stockReserved(state, sale.warehouse.id, sale.line.product) === originalReserved, "Sales delete did not release reservation");

    await selectModule(page, 5);
    const marker = `QA Expense ${crypto.randomUUID().slice(0, 8)}`;
    await page.getByRole('button', { name: '+ Yeni kassa', exact: true }).click();
    const accountForm = page.locator('form').filter({ has: page.getByPlaceholder('Hesab adı', { exact: true }) });
    await accountForm.getByPlaceholder('Hesab adı', { exact: true }).fill(marker);
    await accountForm.getByPlaceholder('Hesab №', { exact: true }).fill(marker);
    await accountForm.getByPlaceholder('Açılış qalığı', { exact: true }).fill('600');
    await accountForm.getByRole('button', { name: '+ Hesab', exact: true }).click();
    state = await waitForState(s => s.financeAccounts.some(a => a.name === marker), 'Expense cash account was not persisted');
    const account = state.financeAccounts.find(a => a.name === marker);
    await page.getByRole('button', { name: 'Xərclər', exact: true }).click();
    await page.getByRole('button', { name: '+ Yeni xərc', exact: true }).click();
    const createForm = page.locator('form').filter({ has: page.getByRole('button', { name: '+ Xərc', exact: true }) });
    await createForm.locator('select').first().selectOption(account.id);
    await createForm.getByPlaceholder('Təsvir', { exact: true }).fill(marker);
    await createForm.getByPlaceholder('Məbləğ', { exact: true }).fill('300');
    await createForm.getByRole('button', { name: '+ Xərc', exact: true }).click();
    state = await waitForState(s => s.expenses.some(e => e.description === marker)
      && s.financeAccounts.find(a => a.id === account.id)?.currentBalance === 300, 'Expense create did not persist its cash debit');
    const expense = state.expenses.find((item) => item.description === marker);
    assert(expense, "Expense create did not add finance expense");

    assert(state.financeAccounts.find(a => a.id === account.id)?.currentBalance === 300, 'Expense create did not debit cash');
    const expenseRow = page.locator('main.main tr').filter({ hasText: marker });
    await expenseRow.getByRole('button', { name: 'Redaktə et', exact: true }).click();
    const editForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Dəyişiklikləri saxla', exact: true }) });
    await editForm.getByPlaceholder('Məbləğ', { exact: true }).fill('450');
    await editForm.getByRole('button', { name: 'Dəyişiklikləri saxla', exact: true }).click();
    state = await waitForState(s => s.expenses.find(e => e.id === expense.id)?.amount === 450
      && s.financeAccounts.find(a => a.id === account.id)?.currentBalance === 150, 'Expense edit did not persist its cash debit');
    assert(state.expenses.find((item) => item.id === expense.id)?.amount === 450, "Expense edit did not update amount");

    assert(state.financeAccounts.find(a => a.id === account.id)?.currentBalance === 150, 'Expense edit did not update its cash debit');
    await expenseRow.getByRole('button', { name: 'Ləğv et', exact: true }).click();
    await page.getByRole('dialog', { name: 'Təsdiq', exact: true }).getByRole('button', { name: 'Təsdiqlə', exact: true }).click();
    state = await waitForState(s => s.expenses.find(e => e.id === expense.id)?.status === 'cancelled'
      && s.financeAccounts.find(a => a.id === account.id)?.currentBalance === 600, 'Expense cancellation did not persist its cash reversal');
    assert(state.financeAccounts.find(a => a.id === account.id)?.currentBalance === 600, 'Expense cancellation did not restore opening balance');
    const ledger = state.cashEntries.filter(tx => tx.reference === `EXPENSE:${expense.id}` || tx.reference === `EXPENSE-REVERSAL:${expense.id}`);
    assert(ledger.length === 2 && ledger.reduce((sum, tx) => sum + (tx.direction === 'in' ? tx.amount : -tx.amount), 0) === 0,
      'Expense cancellation did not preserve a balanced debit/reversal pair');
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
    await page.getByPlaceholder('Müştəri, kredit kodu, müqavilə...', { exact: true }).fill(sale.contract.id);
    const creditRow = page.locator('.credit-directory-panel tr').filter({ hasText: sale.contract.id });
    await creditRow.getByRole('button', { name: 'Krediti başlat', exact: true }).click();
    const startModal = page.getByRole('dialog', { name: 'Krediti başlat', exact: true });
    assert(await startModal.getByRole('button', { name: 'Krediti başlat', exact: true }).isDisabled(),
      'Credit activation was enabled before collecting the planned deposit');
    await startModal.getByLabel('Qəbul ediləcək məbləğ', { exact: true }).fill('200');
    await startModal.getByRole('button', { name: 'Behi kassaya qəbul et', exact: true }).click();
    await waitForState(s => s.credits.find(c => c.id === sale.credit.id)?.initialPaid === 200, 'Deposit was not posted');
    await startModal.getByRole('button', { name: 'Krediti başlat', exact: true }).click();
    await startModal.waitFor({ state: 'hidden' });
    await waitForState(s => s.credits.find(c => c.id === sale.credit.id)?.status === 'active', 'Credit was not activated');
    const before = await readState(page);
    const previousCredit = before.credits?.find((item) => item.id === sale.credit.id);
    const previousOrder = before.orders?.find((order) => order.id === sale.order.id);
    const previousPaidMonths = Number(previousCredit?.paidMonths || 0);
    const currentDue = Number(previousCredit?.installments?.[previousPaidMonths]?.amount || previousCredit?.monthly || 0);
    assert(currentDue > 0 && previousCredit.installments.length === Number(previousCredit.months), 'Activated credit has no complete server installment schedule');
    const nextDueBefore = Number(previousCredit?.installments?.[previousPaidMonths + 1]?.amount || 0);
    const principalPayment = round2(currentDue + 50);
    const penaltyPayment = 17;

    await page.locator(".credit-directory-panel tr").filter({ hasText: sale.contract.id }).locator(".credit-table-actions .icon-btn").first().click();
    await page.locator(".credit-detail-modal-card .credit-payment-form").waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-total-tile"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-paid-tile"]').waitFor({ state: "visible" });
    await page.locator('[data-testid="credit-balance-tile"]').waitFor({ state: "visible" });
    const tileAmount = async id => Number((await page.locator(`[data-testid="${id}"] strong`).innerText()).replace(/[^0-9.-]/g, ''));
    assert(await tileAmount('credit-total-tile') === Number(sale.credit.total), 'Credit detail total differs from its server principal');
    assert(await tileAmount('credit-paid-tile') === Number(previousCredit.initialPaid), 'Credit detail does not show the collected deposit');
    assert(await tileAmount('credit-balance-tile') === Number(previousCredit.balance), 'Credit detail debt differs from the server balance');
    await page.locator('[data-testid="credit-order-link"]').click();
    await page.locator(".page-header h1").filter({ hasText: "Satış" }).waitFor();
    await page.locator('main.main tr').filter({ hasText: sale.order.orderNo }).waitFor();
    const orderCard = page.getByRole('dialog', { name: 'Sifariş kartı', exact: true });
    await orderCard.getByRole('button', { name: 'Sifariş kartını bağla', exact: true }).click();
    await orderCard.waitFor({ state: 'hidden' });
    await selectModule(page, 9);
    await page.getByPlaceholder('Müştəri, kredit kodu, müqavilə...', { exact: true }).fill(sale.contract.id);
    await page.locator(".credit-directory-panel tr").filter({ hasText: sale.contract.id }).locator(".credit-table-actions .icon-btn").first().click();
    await page.locator(".credit-detail-modal-card .credit-payment-form").waitFor({ state: "visible" });
    const paymentForm = page.locator('.credit-detail-modal-card .credit-payment-form');
    await paymentForm.getByLabel('Əsas məbləğ', { exact: true }).fill(String(principalPayment));
    await paymentForm.getByLabel('Gecikmə faizi', { exact: true }).fill(String(penaltyPayment));
    await page.locator(".credit-detail-modal-card .credit-payment-form button[type=submit]").click();
    // Separate HTTP reads can straddle a transaction commit; require every linked effect.
    const after = await waitForState(s => {
      const credit = s.credits.find(c => c.id === sale.credit.id);
      const order = s.orders.find(o => o.id === sale.order.id);
      return credit?.payments.some(p => Number(p.principal_amount) === principalPayment && Number(p.penalty_amount) === penaltyPayment)
        && Number(order?.paid) === round2(Number(previousOrder.paid) + principalPayment)
        && Number(credit.balance) === round2(Number(previousCredit.balance) - principalPayment)
        && s.cashEntries.some(tx => tx.creditId === sale.credit.id && !before.cashEntries.some(old => old.id === tx.id));
    }, 'Credit payment receipt, linked principal and cash effects did not converge');
    const cashEntry = after.cashEntries.find(tx => tx.creditId === sale.credit.id && !before.cashEntries.some(old => old.id === tx.id));
    const linkedOrder = after.orders?.find((order) => order.id === sale.order.id);
    const linkedCredit = after.credits?.find((credit) => credit.id === cashEntry?.creditId);

    assert(after.cashEntries.length === before.cashEntries.length + 1, "Credit payment did not create a cash entry");
    assert(cashEntry?.creditId && Number(cashEntry.amount) > 0, "Cash entry is missing credit payment data");
    assert(cashEntry.principal === principalPayment, "Credit payment did not split principal correctly");
    assert(cashEntry.penalty === penaltyPayment, "Credit payment did not store the penalty amount");
    assert(cashEntry.amount === round2(principalPayment + penaltyPayment), "Cash entry should contain principal plus penalty");
    assert(
      linkedOrder && previousOrder && Number(linkedOrder.paid) === round2(Number(previousOrder.paid) + principalPayment),
      "Credit payment did not update the linked order principal",
    );
    assert(
      Number(linkedCredit.balance) === round2(Number(previousCredit.balance) - principalPayment),
      "Penalty amount incorrectly affected the remaining principal debt",
    );
    assert(linkedCredit?.payments?.some(p => Number(p.principal_amount) === principalPayment && Number(p.penalty_amount) === penaltyPayment),
      "Credit payment receipt did not retain separate principal and penalty amounts");
    assert(Number(linkedCredit?.installments?.[previousPaidMonths]?.amount || 0) === 0, "Current installment was not closed");
    assert(
      Number(linkedCredit?.installments?.[previousPaidMonths + 1]?.amount || 0) === Math.max(0, round2(nextDueBefore - 50)),
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
    const fixture = fixtureByPage.get(page);
    const state = await auditBackend.readState({ scope: 'sales', customerId: fixture.customer.id, warehouseId: fixture.warehouse.id });
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
    await page.getByPlaceholder('Müştəri, kredit kodu, müqavilə...', { exact: true }).fill(fin);
    await page.locator('[data-testid="credit-contract-cell"]').filter({ hasText: firstSale.contract.id }).waitFor();
    await page.locator('[data-testid="credit-contract-cell"]').filter({ hasText: secondSale.contract.id }).waitFor();
    await selectModule(page, 1);
    await page.locator('main.main tr').filter({ hasText: fin }).click();
    let customerCard = page.getByRole('dialog', { name: 'Müştəri kartı', exact: true });
    await customerCard.getByRole('button', { name: 'Kreditlər', exact: true }).click();
    await customerCard.getByRole('article', { name: firstSale.contract.id, exact: true }).waitFor();
    await customerCard.getByRole('article', { name: secondSale.contract.id, exact: true }).waitFor();
    assert(await customerCard.getByRole('button', { name: 'Kreditə bax', exact: true }).count() === 2,
      'CRM 360 did not expose two independent credit links');
    const firstCard = customerCard.getByRole('article', { name: firstSale.contract.id, exact: true });
    await firstCard.getByText('Ödəniş cədvəli', { exact: true }).click();
    await firstCard.getByText('Kreditin ödəniş cədvəli hələ aktivləşdirilməyib.', { exact: true }).waitFor();
    await firstCard.getByRole('button', { name: 'Sifarişə bax', exact: true }).click();
    await page.locator(".page-header h1").filter({ hasText: "Satış" }).waitFor();
    await page.locator('main.main tr').filter({ hasText: firstSale.order.orderNo }).waitFor();
    const linkedOrderCard = page.getByRole('dialog', { name: 'Sifariş kartı', exact: true });
    await linkedOrderCard.getByRole('button', { name: 'Sifariş kartını bağla', exact: true }).click();
    await linkedOrderCard.waitFor({ state: 'hidden' });
    await selectModule(page, 1);
    await page.locator('main.main tr').filter({ hasText: fin }).click();
    customerCard = page.getByRole('dialog', { name: 'Müştəri kartı', exact: true });
    await customerCard.getByRole('button', { name: 'Kreditlər', exact: true }).click();
    await customerCard.getByRole('article', { name: firstSale.contract.id, exact: true })
      .getByRole('button', { name: 'Kreditə bax', exact: true }).click();
    await page.locator(".page-header h1").filter({ hasText: "Kredit" }).waitFor();
    await page.locator(".credit-detail-modal-card").filter({ hasText: firstSale.credit.id }).waitFor();
    await page.locator(".credit-detail-modal-head .icon-btn").click();
    await page.locator(".credit-detail-modal-card").waitFor({ state: "hidden" });
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
    await page.locator(".delivery-search input").fill(sale.order.orderNo);
    const deliveryRegistryText = await page.locator(".delivery-registry-panel").innerText();
    assert(deliveryRegistryText.includes(sale.order.orderNo), "Delivery registry search did not keep the created order visible");
    const deliveryExport = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".delivery-export-btn").click(),
    ]).then(([file]) => file);
    assert(deliveryExport.suggestedFilename().includes("tehvil-reyestri"), "Delivery registry export did not create the expected CSV file");
    const csv = await readFile(await deliveryExport.path(), 'utf8');
    assert(csv.includes(sale.order.orderNo), 'Delivery export omitted the selected order');
    const orderRow = page.locator('.delivery-registry-panel tr').filter({ hasText: sale.order.orderNo });
    await orderRow.getByRole('button', { name: 'Kartı aç', exact: true }).click();
    const card = page.locator('#delivery-detail-card');
    await card.getByLabel('Təhvil alanın ad-soyadı', { exact: true }).fill('QA Customer');
    await card.getByLabel('Anbardan götürən əməkdaş', { exact: true }).fill('QA Audit Seller');
    await card.getByLabel('Sənəd nömrəsi', { exact: true }).fill(`QA-${sale.order.orderNo}`);
    await card.getByLabel('Təhvil alan şəxs elektron imzanı təsdiqlədi', { exact: true }).check();
    await card.getByRole('button', { name: 'Təhvil verildi', exact: true }).click();
    const after = await waitForState(s => s.orders.find(o => o.id === sale.order.id)?.status === 'Təhvil verilib',
      'Delivery acceptance was not persisted');
    const deliveredOrder = after.orders?.find((item) => item.id === sale.order.id);

    assert(deliveredOrder?.status === "Təhvil verilib", "Warehouse delivery did not complete the order");
    assert(deliveredOrder.deliveryAcceptance?.recipientName === 'QA Customer' &&
      deliveredOrder.deliveryAcceptance?.warehouseEmployeeName === 'QA Audit Seller' &&
      deliveredOrder.deliveryAcceptance?.documentNo === `QA-${sale.order.orderNo}` &&
      deliveredOrder.deliveryAcceptance?.signatureConfirmed === true && deliveredOrder.deliveryAcceptance?.acceptedAt,
      'Delivery did not durably persist its signed acceptance alongside stock posting');
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
    const fixture = fixtureByPage.get(page);
    const suffix = crypto.randomUUID().slice(0, 8);
    const marker = `QA Purchase ${suffix}`;
    const read = (table, filter) => auditBackend.readCanonical(table, '*', filter);
    await selectModule(page, 5);
    await page.getByRole('button', { name: '+ Yeni kassa', exact: true }).click();
    const accountForm = page.locator('form').filter({ has: page.getByPlaceholder('Hesab adı', { exact: true }) });
    await accountForm.getByPlaceholder('Hesab adı', { exact: true }).fill(marker);
    await accountForm.getByPlaceholder('Hesab №', { exact: true }).fill(marker);
    await accountForm.getByPlaceholder('Açılış qalığı', { exact: true }).fill('500');
    await accountForm.getByRole('button', { name: '+ Hesab', exact: true }).click();
    const [account] = await waitForCanonical(() => read('cash_accounts', '&name=eq.' + encodeURIComponent(marker)), rows => rows.length === 1, 'Purchase payment account was not persisted');

    await selectPath(page, '/satinalma');
    await page.getByRole('button', { name: 'Vendorlar', exact: true }).click();
    await page.getByRole('button', { name: 'Yeni vendor', exact: true }).click();
    const vendorForm = page.locator('form').filter({ has: page.getByLabel('Ad', { exact: true }) });
    await vendorForm.getByLabel('Ad', { exact: true }).fill(marker);
    await vendorForm.getByRole('button', { name: 'Əlavə et', exact: true }).click();
    const [vendor] = await waitForCanonical(() => read('vendors', '&name=eq.' + encodeURIComponent(marker)), rows => rows.length === 1, 'Purchase vendor was not persisted');

    await page.getByRole('button', { name: 'PO', exact: true }).click();
    await page.getByRole('button', { name: 'Yeni PO yarat', exact: true }).click();
    const poNumber = 'PO-QA-' + suffix;
    const poForm = page.locator('form').filter({ has: page.getByLabel('PO nömrəsi', { exact: true }) });
    await poForm.getByLabel(/^Vendor/).selectOption(vendor.id);
    await poForm.getByLabel('PO nömrəsi', { exact: true }).fill(poNumber);
    await poForm.getByLabel('SKU / məhsul kodu', { exact: true }).fill(fixture.sku);
    await poForm.getByLabel('Miqdar', { exact: true }).fill('2');
    await poForm.getByLabel('Vahid invoice qiyməti', { exact: true }).fill('50');
    await poForm.getByRole('button', { name: 'PO yarat', exact: true }).click();
    const [po] = await waitForCanonical(() => read('purchase_orders', '&po_number=eq.' + poNumber), rows => rows.length === 1, 'Purchase PO was not persisted');
    await page.locator('main.main tr').filter({ hasText: poNumber }).getByRole('button', { name: 'Təsdiq', exact: true }).click();
    await waitForCanonical(() => read('purchase_orders', '&id=eq.' + po.id), rows => rows[0]?.status === 'approved', 'Purchase PO was not approved');

    await page.locator('main.main nav').getByRole('button', { name: 'Mədaxil', exact: true }).click();
    const receiptForm = page.locator('form').filter({ has: page.getByLabel('GRN nömrəsi', { exact: true }) });
    const grnNumber = 'GRN-QA-' + suffix;
    await receiptForm.getByLabel('PO', { exact: true }).selectOption(po.id);
    await receiptForm.getByLabel('GRN nömrəsi', { exact: true }).fill(grnNumber);
    await receiptForm.getByPlaceholder('Qəbul edildi', { exact: true }).fill('2');
    await receiptForm.getByPlaceholder('Vahid həcm, m³', { exact: true }).fill('1');
    await receiptForm.getByRole('button', { name: 'Mədaxil et', exact: true }).click();
    const [grn] = await waitForCanonical(() => read('goods_receipts', '&grn_number=eq.' + grnNumber), rows => rows.length === 1, 'Purchase GRN was not persisted');
    const [shipment] = await waitForCanonical(() => read('procurement_shipments', '&source_grn_id=eq.' + grn.id), rows => rows.length === 1, 'GRN did not create the canonical shipment');
    const before = await readState(page);
    assert(stockTotal(before, warehouse.id, fixture.productName) === 5, 'PO approval or GRN changed physical stock before warehouse receipt');

    await page.getByRole('button', { name: 'Göndəriş və maya', exact: true }).click();
    await page.locator('.landed-list button').filter({ has: page.getByText(shipment.shipment_no, { exact: true }) }).click();
    await page.getByLabel('Qəbul anbarı', { exact: true }).selectOption(warehouse.id);
    await page.getByRole('button', { name: 'Mayanı təsdiqlə', exact: true }).click();
    await waitForCanonical(() => read('procurement_shipments', '&id=eq.' + shipment.id), rows => rows[0]?.status === 'costed', 'Shipment costing was not approved');
    await page.getByRole('button', { name: 'Anbara qəbul et', exact: true }).click();
    const [receipt] = await waitForCanonical(() => read('procurement_receipts', '&shipment_id=eq.' + shipment.id), rows => rows.length === 1, 'Warehouse receipt was not posted');
    const journals = await read('journal_entries', '&source_type=eq.procurement_receipt&source_id=eq.' + receipt.id);
    assert(journals.length === 1 && journals[0].posted, 'Warehouse receipt has no posted accounting journal');
    await waitForState(s => stockTotal(s, warehouse.id, fixture.productName) === 7, 'Purchase receipt did not increase physical stock');

    await page.getByRole('button', { name: 'Fakturalar', exact: true }).click();
    const invoiceNumber = 'INV-QA-' + suffix;
    const invoiceForm = page.locator('form').filter({ has: page.getByLabel('Faktura nömrəsi', { exact: true }) });
    await invoiceForm.getByLabel('PO', { exact: true }).selectOption(po.id);
    await invoiceForm.getByLabel('Faktura nömrəsi', { exact: true }).fill(invoiceNumber);
    await invoiceForm.getByRole('button', { name: 'Faktura yarat', exact: true }).click();
    const [invoice] = await waitForCanonical(() => read('vendor_invoices', '&invoice_number=eq.' + invoiceNumber), rows => rows.length === 1 && rows[0].status === 'matched', 'Invoice did not pass three-way matching');
    await page.locator('main.main tr').filter({ hasText: invoiceNumber }).getByRole('button', { name: 'Ödəniş et', exact: true }).click();
    const payment = page.getByRole('dialog', { name: 'Vendor fakturasının ödənişi', exact: true });
    await payment.getByLabel('Ödəniş hesabı', { exact: true }).selectOption(account.id);
    const response = await auditResponse(page,
      r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/rpc/pay_vendor_invoice_atomic'),
      () => payment.getByRole('button', { name: 'Ödənişi təsdiq et', exact: true }).click());
    assert(response.ok(), 'Purchase payment RPC failed: ' + await response.text());
    const first = await response.json();
    const replay = await auditBackend.command('pay_vendor_invoice_atomic', response.request().postDataJSON());
    assert(first.payment_id === replay.payment_id && Number(first.amount) === 100, 'Purchase payment replay was not idempotent');
    const cash = await read('cash_transactions', '&reference_type=eq.vendor_invoice&reference_id=eq.' + invoice.id);
    assert(cash.length === 1 && cash[0].direction === 'out' && Number(cash[0].amount) === 100 && cash[0].account_id === account.id, 'Purchase payment did not debit cash once');
    const state = await waitForState(s => s.financeAccounts.find(a => a.id === account.id)?.currentBalance === 400, 'Purchase payment did not update the server cash balance');
    assert(stockTotal(state, warehouse.id, fixture.productName) === 7, 'Invoice payment changed warehouse stock');
    const [paidInvoice] = await read('vendor_invoices', '&id=eq.' + invoice.id);
    assert(paidInvoice.status === 'paid', 'Invoice did not become paid');
    const paymentJournal = await read('journal_entries', '&id=eq.' + first.journal_entry_id);
    assert(paymentJournal.length === 1 && paymentJournal[0].posted, 'Purchase payment has no posted journal');
    assert(errors.length === 0, 'Purchase browser errors: ' + errors.join(' | '));
    return { poId: po.id, receiptId: receipt.id, invoiceId: invoice.id, paymentId: first.payment_id, warehouseId: warehouse.id, cashBalance: 400, replayVerified: true };
  } finally {
    await context.close();
  }
}

async function auditVendorLifecycle(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await createWarehouseWithStock(page);
    const fixture = fixtureByPage.get(page);
    await selectPath(page, '/satinalma');
    await page.getByRole('button', { name: 'Vendorlar', exact: true }).click();
    const suffix = crypto.randomUUID().slice(0, 8);
    const vendorName = `QA Vendor ${suffix}`;
    const updatedName = `QA Vendor Updated ${suffix}`;
    await page.getByRole('button', { name: 'Yeni vendor', exact: true }).click();
    const vendorForm = page.locator('form').filter({ has: page.getByLabel('Ad', { exact: true }) });
    await vendorForm.getByLabel('Ad', { exact: true }).fill(vendorName);
    await vendorForm.getByLabel('Telefon', { exact: true }).fill('0501112233');
    await vendorForm.getByRole('button', { name: 'Əlavə et', exact: true }).click();
    let state = await waitForState(s => s.vendors.some(v => v.name === vendorName), 'Vendor create did not persist');
    const vendor = state.vendors.find(v => v.name === vendorName);
    await page.locator('main.main tr').filter({ hasText: vendorName }).getByRole('button', { name: 'Edit', exact: true }).click();
    await vendorForm.getByLabel('Ad', { exact: true }).fill(updatedName);
    await vendorForm.getByLabel('Email', { exact: true }).fill(`qa-${suffix}@example.invalid`);
    await vendorForm.getByRole('button', { name: 'Yadda saxla', exact: true }).click();
    state = await waitForState(s => s.vendors.some(v => v.id === vendor.id && v.name === updatedName), 'Vendor edit did not persist');
    assert(state.vendors.find(v => v.id === vendor.id)?.email === `qa-${suffix}@example.invalid`, 'Vendor contact edit did not persist');
    assert(!state.vendors.some(v => v.name === vendorName), 'Vendor edit retained its old name');

    await page.getByRole('button', { name: 'PO', exact: true }).click();
    await page.getByRole('button', { name: 'Yeni PO yarat', exact: true }).click();
    const poNumber = `PO-QA-${suffix.toUpperCase()}`;
    const poForm = page.locator('form').filter({ has: page.getByLabel('PO nömrəsi', { exact: true }) });
    await poForm.getByLabel(/^Vendor/).selectOption(vendor.id);
    await poForm.getByLabel('PO nömrəsi', { exact: true }).fill(poNumber);
    await poForm.getByLabel('SKU / məhsul kodu', { exact: true }).fill(fixture.sku);
    await poForm.getByLabel('Miqdar', { exact: true }).fill('2');
    await poForm.getByLabel('Vahid invoice qiyməti', { exact: true }).fill('70');
    await poForm.getByRole('button', { name: 'PO yarat', exact: true }).click();
    state = await waitForState(s => s.purchaseOrders.some(p => p.po_number === poNumber), 'Vendor PO was not persisted');
    const po = state.purchaseOrders.find(p => p.po_number === poNumber);
    assert(po.vendor_id === vendor.id && po.status === 'draft', 'PO lost the vendor foreign key or draft status');
    assert(state.purchaseOrderLines.some(l => l.po_id === po.id && Number(l.qty_ordered) === 2), 'PO line did not persist');
    await page.locator('main.main tr').filter({ hasText: poNumber }).getByRole('button', { name: 'Təsdiq', exact: true }).click();
    await waitForState(s => s.purchaseOrders.some(p => p.id === po.id && p.status === 'approved'), 'Vendor PO approval did not persist');

    await page.getByRole('button', { name: 'Vendorlar', exact: true }).click();
    await page.locator('main.main tr').filter({ hasText: updatedName }).getByRole('button', { name: 'Sil', exact: true }).click();
    state = await waitForState(s => s.vendors.some(v => v.id === vendor.id && v.is_active === false), 'Historical vendor was not deactivated');
    assert(state.purchaseOrders.some(p => p.id === po.id && p.vendor_id === vendor.id), 'Vendor deactivation broke PO history');

    const disposableName = `QA Disposable Vendor ${suffix}`;
    await page.getByRole('button', { name: 'Yeni vendor', exact: true }).click();
    const disposableForm = page.locator('form').filter({ has: page.getByLabel('Ad', { exact: true }) });
    await disposableForm.getByLabel('Ad', { exact: true }).fill(disposableName);
    await disposableForm.getByRole('button', { name: 'Əlavə et', exact: true }).click();
    await waitForState(s => s.vendors.some(v => v.name === disposableName), 'Unlinked vendor was not created');
    await page.locator('main.main tr').filter({ hasText: disposableName }).getByRole('button', { name: 'Sil', exact: true }).click();
    await page.getByRole('dialog', { name: 'Təsdiq', exact: true }).getByRole('button', { name: 'Təsdiqlə', exact: true }).click();
    await waitForState(s => !s.vendors.some(v => v.name === disposableName), 'Unlinked vendor delete did not persist');
    assert(errors.length === 0, `Vendor lifecycle produced browser errors: ${errors.join(' | ')}`);
    return { vendorId: vendor.id, poId: po.id, historicalVendorPreserved: true };
  } finally {
    await context.close();
  }
}

async function auditFinanceModuleIntegration(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  const read = (table, filter = '') => auditBackend.readCanonical(table, '*', filter);
  const summary = () => auditBackend.command('cashbook_ledger_summary', { _tenant_id: auditBackend.tenantId });
  const accountBalance = (ledger, id) => {
    const account = ledger.accounts.find(row => row.id === id);
    assert(account, 'Server ledger omitted the cash account');
    return Number(account.balance);
  };
  try {
    const sale = await createCreditSale(page);
    await selectModule(page, 9);
    await page.getByPlaceholder('Müştəri, kredit kodu, müqavilə...', { exact: true }).fill(sale.contract.id);
    const creditRow = page.locator('.credit-directory-panel tr').filter({ hasText: sale.contract.id });
    await creditRow.getByRole('button', { name: 'Krediti başlat', exact: true }).click();
    const startModal = page.getByRole('dialog', { name: 'Krediti başlat', exact: true });
    assert(await startModal.getByRole('button', { name: 'Krediti başlat', exact: true }).isDisabled(),
      'Finance flow activated credit before collecting the planned deposit');
    await startModal.getByLabel('Qəbul ediləcək məbləğ', { exact: true }).fill('200');
    await startModal.getByRole('button', { name: 'Behi kassaya qəbul et', exact: true }).click();
    await waitForCanonical(() => read('credit_contracts', '&id=eq.' + sale.credit.id),
      rows => Number(rows[0]?.initial_payment) === 200, 'Finance deposit was not persisted');
    const deposits = await read('cash_transactions', '&reference_id=eq.' + sale.order.id + '&category=eq.sales_payment');
    assert(deposits.length === 1 && Number(deposits[0].amount) === 200 && deposits[0].direction === 'in',
      'Deposit did not produce exactly one real cash receipt');
    await startModal.getByRole('button', { name: 'Krediti başlat', exact: true }).click();
    await startModal.waitFor({ state: 'hidden' });
    await waitForCanonical(() => read('credit_contracts', '&id=eq.' + sale.credit.id),
      rows => rows[0]?.status === 'active', 'Finance credit was not activated');
    const beforePayment = await summary();
    await creditRow.locator('.credit-table-actions .icon-btn').first().click();
    const paymentForm = page.locator('.credit-detail-modal-card .credit-payment-form');
    await paymentForm.getByLabel('Əsas məbləğ', { exact: true }).fill('150');
    await paymentForm.getByLabel('Gecikmə faizi', { exact: true }).fill('25');
    const response = await auditResponse(page, response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rpc/post_credit_payment'),
      () => paymentForm.locator('button[type=submit]').click());
    assert(response.ok(), 'Credit payment failed: ' + await response.text());
    const paymentId = await response.json();
    assert(await auditBackend.command('post_credit_payment', response.request().postDataJSON()) === paymentId,
      'Credit payment retry returned a different receipt');
    const [receipt] = await read('credit_payments', '&id=eq.' + paymentId);
    const receipts = await read('cash_transactions', '&reference_type=eq.credit_payment&reference_id=eq.' + paymentId);
    const [order] = await read('orders', '&id=eq.' + sale.order.id);
    const installments = await read('credit_installments', '&credit_id=eq.' + sale.credit.id);
    assert(receipt?.credit_id === sale.credit.id && Number(receipt.principal_amount) === 150
      && Number(receipt.penalty_amount) === 25 && Number(receipt.amount) === 175,
      'Credit receipt did not retain separate principal and penalty amounts');
    assert(receipts.length === 1 && receipts[0].direction === 'in' && Number(receipts[0].amount) === 175,
      'Credit receipt was missing or posted to cash twice');
    assert(Number(order.paid_amount) === 350, 'Penalty incorrectly increased the linked order principal');
    assert(round2(installments.reduce((sum, row) => sum + Number(row.principal_due) - Number(row.principal_paid), 0))
      === round2(Number(order.total) - 350), 'Credit installment debt differs from the order principal');
    const afterPayment = await summary();
    assert(round2(accountBalance(afterPayment, receipts[0].account_id)
      - accountBalance(beforePayment, receipts[0].account_id)) === 175, 'Credit payment did not increase server cash by principal plus penalty');
    await page.locator('.credit-detail-modal-head .icon-btn').click();
    await page.locator('.credit-detail-modal-card').waitFor({ state: 'hidden' });

    await selectModule(page, 5);
    await page.getByRole('button', { name: 'Əməliyyatlar', exact: true }).click();
    await page.getByLabel('Kassa əməliyyatlarında axtarış', { exact: true }).fill(sale.contract.id);
    await page.locator('main.main tr').filter({ hasText: receipts[0].transaction_no }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Hesablar', exact: true }).click();
    const marker = 'QA Ledger ' + crypto.randomUUID().slice(0, 8);
    const createAccount = async (name, opening) => {
      await page.getByRole('button', { name: '+ Yeni kassa', exact: true }).click();
      const form = page.locator('form').filter({ has: page.getByPlaceholder('Hesab adı', { exact: true }) });
      await form.getByPlaceholder('Hesab adı', { exact: true }).fill(name);
      await form.getByPlaceholder('Açılış qalığı', { exact: true }).fill(String(opening));
      await form.getByRole('button', { name: '+ Hesab', exact: true }).click();
      await form.waitFor({ state: 'hidden' });
      const [account] = await waitForCanonical(() => read('cash_accounts', '&name=eq.' + encodeURIComponent(name)),
        rows => rows.length === 1, 'Cash account was not persisted');
      return account;
    };
    const source = await createAccount(marker + ' source', 250);
    const target = await createAccount(marker + ' target', 0);
    const beforeTransfer = await summary();
    assert(accountBalance(beforeTransfer, source.id) === 250 && accountBalance(beforeTransfer, target.id) === 0,
      'Opening balances differ from the server ledger');
    await page.getByRole('button', { name: '↔ Pul transferi', exact: true }).click();
    const transferForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Transfer et', exact: true }) });
    await transferForm.locator('select').nth(0).selectOption(source.id);
    await transferForm.locator('select').nth(1).selectOption(target.id);
    await transferForm.getByPlaceholder('Məbləğ', { exact: true }).fill('40');
    await transferForm.getByPlaceholder('Qeyd', { exact: true }).fill(marker);
    const transferResult = await auditResponse(page, result => result.request().method() === 'POST'
      && new URL(result.url()).pathname.endsWith('/rpc/transfer_cash_atomic'),
      () => transferForm.getByRole('button', { name: 'Transfer et', exact: true }).click());
    assert(transferResult.ok(), 'Cash transfer failed: ' + await transferResult.text());
    const transfer = await transferResult.json();
    const replay = await auditBackend.command('transfer_cash_atomic', transferResult.request().postDataJSON());
    assert(replay.transfer_id === transfer.transfer_id, 'Transfer retry created another transfer');
    await transferForm.waitFor({ state: 'hidden' });
    const transferRows = await read('cash_transactions', '&reference=eq.TRANSFER:' + transfer.transfer_id);
    assert(transferRows.length === 2 && transferRows.every(row => row.category === 'internal_transfer' && Number(row.amount) === 40)
      && transferRows.some(row => row.account_id === source.id && row.direction === 'out')
      && transferRows.some(row => row.account_id === target.id && row.direction === 'in'),
      'Cash transfer did not preserve exactly one matching debit/credit pair');
    const afterTransfer = await summary();
    assert(accountBalance(afterTransfer, source.id) === 210 && accountBalance(afterTransfer, target.id) === 40,
      'Transfer balances were not read from the server ledger');
    for (const id of [source.id, target.id]) {
      const account = afterTransfer.accounts.find(row => row.id === id);
      assert(Number(account.inflow) === 0 && Number(account.outflow) === 0,
        'An internal transfer was incorrectly counted as external income or expense');
    }
    const sourceRow = page.locator('main.main tr').filter({ has: page.getByText(source.name, { exact: true }) });
    const targetRow = page.locator('main.main tr').filter({ has: page.getByText(target.name, { exact: true }) });
    const formatCash = amount => new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN' }).format(amount);
    assert((await sourceRow.innerText()).includes(formatCash(210)) && (await targetRow.innerText()).includes(formatCash(40)),
      'Cash account UI does not match the server ledger');
    assert(errors.length === 0, 'Finance integration produced browser errors: ' + errors.join(' | '));
    return { creditId: sale.credit.id, paymentId, deposit: 200, cashReceipt: 175,
      transferId: transfer.transfer_id, sourceBalance: 210, targetBalance: 40 };
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
    await createCustomer(page);
    const { customer } = fixtureByPage.get(page);
    const suffix = crypto.randomUUID().slice(0,8);
    const marker = `QA Invoice Cash ${suffix}`;
    const number = `INV-QA-${suffix}`;
    const read = (table,filter='') => auditBackend.readCanonical(table,'*',filter);
    await selectModule(page,5);
    await page.getByRole('button',{ name:'Hesablar',exact:true }).click();
    await page.getByRole('button',{ name:'+ Yeni kassa',exact:true }).click();
    const accountForm = page.locator('form').filter({ has:page.getByPlaceholder('Hesab adı', { exact:true }) });
    await accountForm.getByPlaceholder('Hesab adı',{ exact:true }).fill(marker);
    await accountForm.getByPlaceholder('Açılış qalığı',{ exact:true }).fill('0');
    await accountForm.getByRole('button',{ name:'+ Hesab',exact:true }).click();
    const [account] = await waitForCanonical(() => read('cash_accounts','&name=eq.'+encodeURIComponent(marker)),rows => rows.length===1,'Invoice account was not persisted');
    await selectModule(page,6);
    await page.getByRole('button',{ name:'+ Yeni faktura',exact:true }).click();
    const form = page.locator('form').filter({ has:page.getByPlaceholder('Faktura №',{ exact:true }) });
    await form.getByPlaceholder('Faktura №',{ exact:true }).fill(number);
    await form.getByLabel('Faktura müştərisi',{ exact:true }).selectOption(customer.id);
    await form.getByPlaceholder('Təsvir',{ exact:true }).fill('QA taxable service');
    await form.getByLabel('Faktura sətirinin sayı',{ exact:true }).fill('2');
    await form.getByLabel('Faktura sətirinin qiyməti',{ exact:true }).fill('100');
    await form.getByLabel('Faktura sətirinin ƏDV faizi',{ exact:true }).fill('18');
    const created = await auditResponse(page,
      r => r.request().method()==='POST' && new URL(r.url()).pathname.endsWith('/rpc/create_sales_invoice_atomic'),
      () => form.getByRole('button',{ name:'Yadda saxla',exact:true }).click());
    assert(created.ok(),'Invoice creation RPC failed: '+await created.text());
    const first = await created.json();
    const replay = await auditBackend.command('create_sales_invoice_atomic',created.request().postDataJSON());
    assert(first.invoice_id===replay.invoice_id,'Invoice retry created another invoice');
    const [invoice] = await waitForCanonical(() => read('sales_invoices','&id=eq.'+first.invoice_id),rows => rows.length===1,'Invoice was not persisted');
    assert(Number(invoice.subtotal)===200 && Number(invoice.vat_total)===36 && Number(invoice.total)===236,'Server invoice/VAT totals are wrong');
    await page.getByTestId('invoice-search').fill(number);
    const row = page.locator('main.main tr').filter({ has:page.getByText(number,{ exact:true }) });
    await row.getByRole('button',{ name:'Jurnala yaz',exact:true }).click();
    const [posted] = await waitForCanonical(() => read('sales_invoices','&id=eq.'+invoice.id),rows => rows[0]?.posted,'Invoice journal was not posted');
    const journal = await read('journal_entries','&id=eq.'+posted.journal_entry_id);
    const journalLines = await auditBackend.readCanonical('journal_lines','*,journal_entries!inner(tenant_id)',
      '&entry_id=eq.'+posted.journal_entry_id,'journal_entries.tenant_id');
    const [vatAccount] = await read('chart_of_accounts','&code=eq.2100');
    assert(journal.length===1 && journal[0].posted,'Invoice has no posted GL entry');
    assert(journalLines.reduce((sum,l) => sum+Number(l.debit)-Number(l.credit),0)===0,'Invoice journal is unbalanced');
    assert(journalLines.some(l => l.account_id===vatAccount.id && Number(l.credit)===36),'VAT liability was not posted');
    await row.getByRole('button',{ name:'Ödəniş',exact:true }).click();
    await page.getByLabel('Faktura ödəniş məbləği',{ exact:true }).fill('100');
    await page.getByLabel('Faktura ödəniş hesabı',{ exact:true }).selectOption(account.id);
    const response = await auditResponse(page,
      r => r.request().method()==='POST' && new URL(r.url()).pathname.endsWith('/rpc/record_invoice_payment_atomic'),
      () => page.getByRole('button',{ name:'Ödənişi qeyd et',exact:true }).click());
    assert(response.ok(),'Invoice payment RPC failed: '+await response.text());
    const payment = await response.json();
    const repeated = await auditBackend.command('record_invoice_payment_atomic',response.request().postDataJSON());
    assert(payment.payment_id===repeated.payment_id,'Invoice payment retry was not idempotent');
    const cash = await read('cash_transactions','&reference_type=eq.invoice_payment&reference_id=eq.'+payment.payment_id);
    assert(cash.length===1 && Number(cash[0].amount)===100 && cash[0].account_id===account.id,'Invoice receipt did not enter cash once');
    const paymentLines = await auditBackend.readCanonical('journal_lines','*,journal_entries!inner(tenant_id)',
      '&entry_id=eq.'+payment.journal_entry_id,'journal_entries.tenant_id');
    assert(paymentLines.length===2 && paymentLines.reduce((sum,l) => sum+Number(l.debit)-Number(l.credit),0)===0,'Receipt journal is missing or unbalanced');
    await waitForCanonical(() => read('sales_invoices','&id=eq.'+invoice.id),rows => Number(rows[0]?.paid_amount)===100,'Invoice paid amount was not updated');
    const summary = await auditBackend.command('cashbook_ledger_summary',{ _tenant_id:auditBackend.tenantId });
    assert(Number(summary.accounts.find(a => a.id===account.id)?.balance)===100,'Server cash balance is wrong');
    await row.getByRole('button',{ name:'Ləğv',exact:true }).click();
    await page.getByRole('dialog',{ name:'Təsdiq',exact:true }).getByRole('button',{ name:'Təsdiqlə',exact:true }).click();
    await waitForCanonical(() => read('sales_invoices','&id=eq.'+invoice.id),rows => rows[0]?.status==='cancelled','Invoice was not cancelled');
    const final = await auditBackend.command('cashbook_ledger_summary',{ _tenant_id:auditBackend.tenantId });
    assert(Number(final.accounts.find(a => a.id===account.id)?.balance)===0,'Invoice cancellation did not reverse cash');
    const reversals = await read('journal_entries','&source_type=in.(sales_invoice_cancellation,invoice_payment_reversal)&source_id=in.('+invoice.id+','+payment.payment_id+')');
    assert(reversals.length===2 && reversals.every(j => j.posted),'Invoice/VAT and receipt journals were not both reversed');
    assert(errors.length===0,'Invoice browser errors: '+errors.join(' | '));
    return { invoiceId:invoice.id,paymentId:payment.payment_id,vat:36,cashAfterCancellation:0,replayVerified:true };
  } finally {
    await context.close();
  }
}

async function auditWarehouseImport(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    await selectModule(page, 3);
    await page.getByRole('button', { name: '+ Yeni anbar', exact: true }).click();
    const warehouseForm = page.locator('form').filter({ has: page.getByPlaceholder('Kod', { exact: true }) });
    const suffix = crypto.randomUUID().slice(0, 8);
    const warehouseName = `QA Import ${suffix}`;
    await warehouseForm.getByPlaceholder('Kod', { exact: true }).fill(`IMP-${suffix}`);
    await warehouseForm.getByPlaceholder('Ad', { exact: true }).fill(warehouseName);
    await warehouseForm.getByPlaceholder('Ünvan', { exact: true }).fill('QA Address');
    await warehouseForm.getByRole('button', { name: '+ Anbar', exact: true }).click();
    const [warehouse] = await waitForCanonical(() => auditBackend.readCanonical('warehouses', '*', `&code=eq.IMP-${suffix}`),
      rows => rows.length === 1, 'Import warehouse was not persisted');

    await selectPath(page, '/anbar/mehsullar');
    await page.getByRole('button', { name: 'Əməliyyatlar', exact: true }).click();
    await page.locator('.warehouse-action-menu-popover').getByRole('button', { name: /Toplu import/ }).click();
    const importModal = page.locator('[role="dialog"]');
    const sku = `IMP-${suffix}-001`.toUpperCase();
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
    const response = await auditResponse(page, response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/rpc/import_warehouse_stock_atomic'),
      () => importModal.getByRole('button', { name: 'İmport et', exact: true }).click());
    assert(response.ok(), 'Warehouse import RPC failed: ' + await response.text());
    const result = await response.json();
    const replay = await auditBackend.command('import_warehouse_stock_atomic', response.request().postDataJSON());
    assert(result.request_id === replay.request_id && result.row_count === 1, 'Warehouse import replay was not idempotent');
    await importModal.waitFor({ state: 'hidden' });

    const [product] = await waitForCanonical(() => auditBackend.readCanonical('products', '*', `&sku=eq.${sku}`),
      rows => rows.length === 1, 'Imported catalog product was not persisted');
    const [item] = await waitForCanonical(() => auditBackend.readCanonical('stock_balances', '*',
      `&warehouse_id=eq.${warehouse.id}&product_id=eq.${product.id}`), rows => rows.length === 1 && Number(rows[0].on_hand) === 7,
      'Import did not increase warehouse stock');
    assert(warehouse, "Warehouse import test could not create the target warehouse");
    assert(Number(product.cost_price) === 600 && product.serial_tracked === true, "Import did not persist product metadata");
    assert(Number(item.on_hand) === 7, "Import did not increase warehouse stock");
    assert(errors.length === 0, `Warehouse import produced browser errors: ${errors.join(" | ")}`);
    return { warehouseId: warehouse.id, sku: product.sku, quantity: Number(item.on_hand) };
  } finally {
    await context.close();
  }
}

async function auditProductionCosting(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const warehouse = await createWarehouseWithStock(page);
    const fixture = fixtureByPage.get(page);
    const before = await readState(page);
    const raw = before.products.find(product => product.name === fixture.productName);
    const finishedSku = ('FIN-QA-' + crypto.randomUUID().slice(0, 8)).toUpperCase();
    await selectPath(page, '/anbar/mehsullar');
    await page.getByRole('button', { name: 'Əməliyyatlar', exact: true }).click();
    await page.locator('.warehouse-action-menu-popover').getByRole('button', { name: 'Məhsul yarat', exact: true }).click();
    const productForm = page.getByRole('dialog');
    await productForm.getByLabel('SKU', { exact: true }).fill(finishedSku);
    await productForm.getByLabel('Məhsul adı', { exact: true }).fill('QA Finished ' + finishedSku);
    await productForm.getByLabel('Satış qiyməti', { exact: true }).fill('5000');
    await productForm.getByRole('button', { name: 'Məhsul yarat', exact: true }).click();
    await productForm.waitFor({ state: 'hidden' });
    const prepared = await waitForState(state => state.products.some(product => product.sku === finishedSku), 'Finished product was not persisted');
    const finished = prepared.products.find(product => product.sku === finishedSku);
    const oldBatches = await auditBackend.readCanonical('production_batches');
    await selectModule(page, 13);
    const form = page.getByTestId('production-command');
    await form.getByLabel('Hazır məhsul', { exact: true }).selectOption(finished.id);
    await form.getByLabel('Anbar', { exact: true }).selectOption(warehouse.id);
    await form.getByLabel('Hazır məhsul miqdarı', { exact: true }).fill('2');
    await form.getByLabel('Xammal', { exact: true }).selectOption(raw.id);
    await form.getByLabel('Xammal miqdarı', { exact: true }).fill('4');
    await form.getByRole('button', { name: 'İstehsalı tamamla', exact: true }).click();
    await page.locator('tr[data-batch-id]').filter({ hasText: finished.name }).waitFor();
    const batches = await auditBackend.readCanonical('production_batches');
    const batch = batches.find(item => item.product_id === finished.id && !oldBatches.some(old => old.id === item.id));
    assert(batch && batch.warehouse_id === warehouse.id, 'Production batch was not persisted in its source warehouse');
    assert(Number(batch.quantity) === 2 && Number(batch.total_cost) === 4800 && Number(batch.unit_cost) === 2400, 'Material cost differs from actual consumed valuation');
    const after = await waitForState(state => stockTotal(state, warehouse.id, raw.name) === 1 && stockTotal(state, warehouse.id, finished.name) === 2, 'Production stock postings did not converge');
    const balance = after.warehouseStock[warehouse.id].find(item => item.productId === finished.id);
    assert(Number(balance.costPrice) === 2400, 'Finished stock valuation differs from posted material cost');
    const materials = await auditBackend.readCanonical('production_batch_materials', '*,production_batches!inner(tenant_id)', '&batch_id=eq.' + batch.id, 'production_batches.tenant_id');
    assert(materials.length === 1 && materials[0].product_id === raw.id && Number(materials[0].quantity) === 4, 'Canonical BOM consumption is missing');
    const journals = await auditBackend.readCanonical('journal_entries', '*', '&id=eq.' + batch.journal_entry_id);
    const lines = await auditBackend.readCanonical('journal_lines', '*,journal_entries!inner(tenant_id)', '&entry_id=eq.' + batch.journal_entry_id, 'journal_entries.tenant_id');
    assert(journals[0]?.posted && lines.length === 2 && lines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0) === 0, 'Production accounting was not balanced and posted');
    assert(after.auditLog.some(entry => entry.action === 'batch_posted' && entry.payload?.batch_id === batch.id), 'Production audit event is missing');
    assert(errors.length === 0, 'Production browser errors: ' + errors.join(' | '));
    return { batchId: batch.id, rawIssued: 4, producedQty: 2, unitCost: Number(batch.unit_cost), warehouseId: warehouse.id };
  } finally { await context.close(); }
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
    const before = await auditBackend.readCanonical('webhook_dispatches');
    await selectModule(page, 23);
    const firstResponse = await auditResponse(page,
      r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/functions/v1/webhook-dispatch'),
      () => page.getByTestId('webhook-http-test').click(), { timeout: 15000 });
    const firstResult = await firstResponse.json();
    assert(firstResult.delivered && firstResult.dispatch_id, 'HTTP command did not return a successful dispatch');
    const register = page.getByTestId('webhook-dispatch-register');
    await register.locator(`tr[data-dispatch-id="${firstResult.dispatch_id}"]`).filter({ hasText: 'delivered' }).waitFor();
    const dispatches = await auditBackend.readCanonical('webhook_dispatches');
    const dispatch = dispatches.find(item => item.status === 'delivered' && !before.some(old => old.id === item.id));
    assert(dispatch?.response_code === 200 && Number(dispatch.latency_ms) >= 0, 'Real signed HTTP delivery did not complete');
    const receipts = await auditBackend.readCanonical('webhook_receipts', '*', '&dispatch_id=eq.' + dispatch.id);
    assert(receipts.length === 1 && /^[a-f0-9]{64}$/.test(receipts[0].payload_hash), 'HTTP delivery has no durable receiver receipt');
    const endpointBefore = (await auditBackend.readCanonical('webhook_endpoints')).find(item => item.id === dispatch.endpoint_id);
    await page.getByRole('button', { name: 'Açarı yenilə', exact: true }).click();
    await page.getByText(endpointBefore.name + ' · v' + (Number(endpointBefore.key_version) + 1), { exact: true }).waitFor();
    const endpointAfter = (await auditBackend.readCanonical('webhook_endpoints')).find(item => item.id === dispatch.endpoint_id);
    assert(endpointAfter.key_version === endpointBefore.key_version + 1, 'Server signing key version did not rotate');
    const secondResponse = await auditResponse(page,
      r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/functions/v1/webhook-dispatch'),
      () => page.getByTestId('webhook-http-test').click(), { timeout: 15000 });
    const secondResult = await secondResponse.json();
    assert(secondResult.delivered && secondResult.dispatch_id !== firstResult.dispatch_id, 'Rotated key did not deliver a distinct dispatch');
    await register.locator(`tr[data-dispatch-id="${secondResult.dispatch_id}"]`).filter({ hasText: 'delivered' }).waitFor();
    const after = await auditBackend.readCanonical('webhook_dispatches');
    assert(after.filter(item => item.status === 'delivered' && !before.some(old => old.id === item.id)).length === 2, 'Rotated signing key did not complete a second real delivery');
    const audit = await auditBackend.readCanonical('audit_events');
    assert(audit.some(item => item.action === 'signing_key_rotated' && item.payload?.endpoint_id === endpointAfter.id)
      && audit.some(item => item.action === 'http_dispatch_finished' && item.payload?.dispatch_id === dispatch.id && item.payload.delivered),
      'HTTP delivery and rotation audit events are missing');
    assert(errors.length === 0, 'HTTP integration browser errors: ' + errors.join(' | '));
    return { dispatchId: dispatch.id, responseCode: dispatch.response_code, secretVersion: endpointAfter.key_version };
  } finally { await context.close(); }
}

async function createHrEmployee(page, values) {
  await page.getByRole('button', { name: 'Yeni əməkdaş', exact: true }).click();
  const modal = page.locator('[role="dialog"]');
  await modal.getByLabel('Ad Soyad', { exact: true }).fill(values.name);
  await modal.getByLabel('Vəzifə', { exact: true }).fill(values.position);
  await modal.getByLabel('Şöbə', { exact: true }).fill(values.department);
  await modal.getByLabel('Üst şöbə', { exact: true }).fill(values.departmentParent || '');
  const manager = values.managerName ? (await auditBackend.readCollections(['employees'])).map(row => row.data)
    .find(e => e.name === values.managerName) : null;
  if (values.managerName) assert(manager, 'Required HR manager was not persisted');
  await modal.getByLabel(/^Kimə tabedir/).selectOption(manager?.id || '');
  await modal.getByLabel(/^Səviyyə/).selectOption({ index: values.levelIndex ?? 3 });
  await modal.getByLabel('Maaş', { exact: true }).fill(String(values.salary));
  if (values.kpi != null) await modal.getByLabel('KPI', { exact: true }).fill(String(values.kpi));
  if (values.documentsComplete != null) await modal.getByLabel('Sənəd uyğunluğu, %', { exact: true }).fill(String(values.documentsComplete));
  if (values.leaveBalance != null) await modal.getByLabel('Məzuniyyət balansı', { exact: true }).fill(String(values.leaveBalance));
  await modal.locator('button[type="submit"]').click();
  await page.locator('[role="dialog"]').waitFor({ state: "hidden" });
  await waitForCanonical(() => auditBackend.readCollections(['employees']),
    rows => rows.some(row => row.data?.name === values.name), 'Employee was not persisted');
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
    const suffix = crypto.randomUUID().slice(0, 8);
    const directorName = `QA Director ${suffix}`;
    const managerName = `QA Sales Manager ${suffix}`;
    const specialistName = `QA B2B Specialist ${suffix}`;
    const leadName = `QA Sales Lead ${suffix}`;
    const departmentName = `QA New Department ${suffix}`;
    const executiveDepartment = `QA Executive ${suffix}`;
    const salesDepartment = `QA Sales ${suffix}`;
    const b2bDepartment = `QA B2B ${suffix}`;
    const vacancyRole = `QA Recruitment Role ${suffix}`;
    await selectModule(page, 14);
    await createHrEmployee(page, {
      name: directorName,
      position: "Direktor",
      department: executiveDepartment,
      salary: 3000,
    });
    await createHrEmployee(page, {
      name: managerName,
      position: "Satış rəhbəri",
      department: salesDepartment,
      departmentParent: executiveDepartment,
      managerName: directorName,
      levelIndex: 1,
      salary: 2200,
    });
    await createHrEmployee(page, {
      name: specialistName,
      position: "B2B mütəxəssisi",
      department: b2bDepartment,
      departmentParent: salesDepartment,
      managerName: managerName,
      levelIndex: 3,
      salary: 1300,
      leaveBalance: 14,
    });

    const state = await readState(page);
    const employees = (state.employees || []).filter(e => [directorName, managerName, specialistName].includes(e.name));
    assert(employees.length === 3, "HR employee creation did not persist all employees");
    assert(
      employees.every((employee) => employee.hrStatus === "Stabil" && Number(employee.documentsComplete) === 100),
      "New employee was incorrectly marked as awaiting information",
    );
    assert(
      employees.find((employee) => employee.name === specialistName)?.managerId ===
        employees.find((employee) => employee.name === managerName)?.id,
      "Employee manager relationship was not stored by ID",
    );

    const salesNode = page.locator(".hr-org-card").filter({ hasText: managerName });
    await salesNode.waitFor();
    const b2bNode = page.locator(".hr-org-card").filter({ hasText: specialistName });
    await b2bNode.waitFor();
    await salesNode.click();
    await b2bNode.waitFor({ state: "hidden" });
    await salesNode.click();
    await b2bNode.waitFor();

    const reportingPanel = page.locator(".hr-reporting-panel");
    const managerNode = reportingPanel.locator('.hr-employee-node').filter({
      has: page.getByText(managerName, { exact: true }),
    });
    if (await managerNode.getAttribute('aria-expanded') === 'false') await managerNode.click();
    await reportingPanel.locator('.hr-employee-node').filter({
      has: page.getByText(specialistName, { exact: true }),
    }).click();
    await page.locator(".hr-profile-head").filter({ hasText: specialistName }).waitFor();
    await page.locator(".hr-profile-edit").click();
    const editModal = page.locator('[role="dialog"]');
    await editModal.getByLabel('Vəzifə', { exact: true }).fill('Senior B2B Specialist');
    await editModal.getByLabel('Maaş', { exact: true }).fill('1750');
    await editModal.getByLabel('Sənəd uyğunluğu, %', { exact: true }).fill('60');
    await editModal.locator('button[type="submit"]').click();
    await editModal.waitFor({ state: "hidden" });
    const updatedState = await waitForHrState(s => s.employees.some(e => e.name === specialistName && e.position === 'Senior B2B Specialist' && Number(e.salary) === 1750), 'Employee edit was not persisted');
    const updatedEmployee = updatedState.employees.find((employee) => employee.name === specialistName);
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
    await page.locator('.hr-profile-tabs').getByRole('button', { name: /^Sənədlər/ }).click();
    await page.locator('[data-testid="hr-document-complete"]').click();
    await page.waitForTimeout(100);
    const documentState = await waitForHrState(s => s.employees.some(e => e.name === specialistName && Number(e.documentsComplete) === 100), 'Document completion was not persisted');
    const documentedEmployee = documentState.employees.find((employee) => employee.name === specialistName);
    assert(
      Number(documentedEmployee?.documentsComplete) === 100 && documentedEmployee?.documentReviewRequired === false,
      "Employee document completion action did not close document risk",
    );
    assert(
      documentState.auditLog?.some((row) => row.action === "Əməkdaş sənədləri yeniləndi"),
      "Employee document completion did not create an audit log entry",
    );
    await page.locator(".hr-person-row").filter({ hasText: managerName }).click();
    await page.locator(".hr-profile-head").filter({ hasText: managerName }).waitFor();
    await page.locator(".hr-profile-edit").click();
    const managerEditModal = page.locator('[role="dialog"]');
    await managerEditModal.getByLabel('Ad Soyad', { exact: true }).fill(leadName);
    await managerEditModal.locator('button[type="submit"]').click();
    await managerEditModal.waitFor({ state: "hidden" });
    const renamedState = await waitForHrState(s => s.employees.some(e => e.name === leadName), 'Employee rename was not persisted');
    const renamedManager = renamedState.employees.find((employee) => employee.name === leadName);
    assert(
      renamedState.employees.find((employee) => employee.name === specialistName)?.managerName === leadName,
      "Employee rename did not update direct reports' manager names",
    );
    await page.locator(".hr-structure-actions .secondary-btn").click();
    const departmentModal = page.locator('[role="dialog"]');
    await departmentModal.locator("input").nth(0).fill(departmentName);
    await departmentModal.locator("textarea").fill("QA department for hierarchy validation");
    await departmentModal.locator('button[type="submit"]').click();
    await departmentModal.waitFor({ state: "hidden" });
    const departmentState = await waitForHrState(s => s.departments?.some(d => d.name === departmentName),
      'HR department was not persisted');
    assert(
      departmentState.departments?.some((department) => department.name === departmentName),
      "Department creation did not persist the new department",
    );
    await page.locator(".hr-org-card").filter({ hasText: departmentName }).waitFor();

    await page.locator(".hr-person-row").filter({ hasText: leadName }).click();
    await page.locator(".hr-profile-head").filter({ hasText: leadName }).waitFor();
    await page.locator(".hr-profile-delete").click();
    const deleteModal = page.locator('[role="dialog"]');
    await deleteModal.locator('.hr-delete-reassignment select').selectOption(
      employees.find(employee => employee.name === directorName).id);
    await deleteModal.locator(".danger-outline").click();
    await deleteModal.waitFor({ state: "hidden" });
    const deletedState = await waitForHrState(s => !s.employees.some(e => e.id === renamedManager.id),
      'HR manager deletion was not persisted');
    assert(!deletedState.employees.some((employee) => employee.name === leadName), "Employee delete did not remove the employee");
    assert(
      deletedState.employees.find((employee) => employee.name === specialistName)?.managerName === directorName,
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

    const ledgerBeforePayroll = await auditBackend.command('cashbook_ledger_summary', { _tenant_id: auditBackend.tenantId });
    const hrTabs = page.locator(".hr-platform-toolbar .tabs button");
    await hrTabs.nth(3).click();
    await page.locator(".hr-platform-section tbody tr").filter({ hasText: specialistName }).locator(".hr-payroll-actions .text-btn").click();
    await page.waitForTimeout(100);
    const payrollState = await waitForHrState(s => s.employees.some(e => e.name === specialistName && e.payrollStatus === 'Ödənildi'), 'Payroll status was not persisted');
    const payrollEmployee = payrollState.employees.find((employee) => employee.name === specialistName);
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
    await leaveModal.getByLabel(/^Əməkdaş/).selectOption(updatedEmployee.id);
    const previousLeaveIds = new Set((await readHrState()).leaveRequests?.map(request => request.id) || []);
    await leaveModal.locator('button[type="submit"]').click();
    await leaveModal.waitFor({ state: "hidden" });
    const leaveState = await waitForHrState(s => s.leaveRequests?.some(request => !previousLeaveIds.has(request.id) && request.employeeId === updatedEmployee.id),
      'New HR leave request was not persisted');
    const leaveRequest = leaveState.leaveRequests.find(request => !previousLeaveIds.has(request.id) && request.employeeId === updatedEmployee.id);
    assert(leaveRequest, "Leave request did not persist");
    await page.locator(".hr-platform-section tbody tr").filter({ hasText: leaveRequest.employeeName }).locator(".hr-leave-actions .text-btn").first().click();
    await page.waitForTimeout(100);
    const approvedLeaveState = await waitForHrState(s => s.leaveRequests?.some(request => request.id === leaveRequest.id && request.status === 'Təsdiq edildi'),
      'HR leave approval was not persisted');
    assert(
      approvedLeaveState.leaveRequests?.find(request => request.id === leaveRequest.id)?.status === "Təsdiq edildi",
      "Leave approval did not persist the approved status",
    );
    assert(
      approvedLeaveState.auditLog?.some((row) => row.action === "Məzuniyyət statusu dəyişdi"),
      "Leave status update did not create an audit log entry",
    );

    await hrTabs.nth(4).click();
    await page.locator(".hr-operation-toolbar .secondary-btn").click();
    const vacancyModal = page.locator('[role="dialog"]');
    await vacancyModal.locator("input").nth(0).fill(vacancyRole);
    await vacancyModal.locator("input").nth(1).fill(departmentName);
    await vacancyModal.locator('button[type="submit"]').click();
    await vacancyModal.waitFor({ state: "hidden" });
    const vacancyState = await waitForHrState(s => s.vacancies?.some(vacancy => vacancy.role === vacancyRole),
      'Vacancy creation did not persist');
    assert(vacancyState.vacancies?.filter(vacancy => vacancy.role === vacancyRole).length === 1,
      'Vacancy creation reused a previous audit fixture');
    await page.locator(".hr-recruitment-card").filter({ hasText: vacancyRole }).waitFor();

    await selectModule(page, 24);
    await page.getByRole("button", { name: "Integrity yoxla" }).click();
    await page.waitForTimeout(75);
    const integrityState = await readHrState();
    assert(integrityState.integritySnapshot, "Integrity check did not create a snapshot");
    assert(
      !integrityState.integritySnapshot.issues?.some((issue) => issue.area === "HR"),
      "Healthy HR structure produced an integrity warning",
    );
    const ledgerAfterPayroll = await auditBackend.command('cashbook_ledger_summary', { _tenant_id: auditBackend.tenantId });
    assert(JSON.stringify(ledgerAfterPayroll) === JSON.stringify(ledgerBeforePayroll),
      'An HR-only payroll status marker changed the canonical cash ledger');
    assert(errors.length === 0, `HR structure produced browser errors: ${errors.join(" | ")}`);
    return { employees: employees.length, selectedEmployee: specialistName, updatedSalary: updatedEmployee.salary, department: departmentName };
  } finally {
    await context.close();
  }
}

async function auditSettingsPermissions() {
  const before = await auditBackend.readCanonical('orders','id');
  const evidence = await verifyRestrictedRoleAudit(process.env, auditBackend.session.user.id);
  const after = await auditBackend.readCanonical('orders','id');
  assert(JSON.stringify(after) === JSON.stringify(before), 'Denied role command created or changed a sale');
  return evidence;
}

async function auditReportsAnalytics(browser) {
  const { context, page, errors } = await createFlowPage(browser);
  try {
    const sale = await createCreditSale(page);
    await selectModule(page, 17);
    await page.locator('[data-testid="reports-control-panel"]').waitFor();
    await page.locator('[data-testid="report-module-panel"]').waitFor();
    await page.locator('[data-testid="report-risk-panel"]').waitFor();

    await page.locator('.reports-filter-bar').getByLabel('Dövr', { exact: true }).selectOption('Hamısı');
    const controlText = await page.locator('[data-testid="reports-control-panel"]').innerText();
    assert(controlText.includes("snapshot"), "Reports control panel does not show its snapshot date");
    assert(await page.locator('[data-testid="report-module-panel"] tbody tr').count() >= 6,
      "Reports module panel does not show the underlying module data volumes");

    const previousExportId = (await readState()).reportExports?.[0]?.id;
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="report-template-export"]').first().click(),
    ]);
    assert(download.suggestedFilename().endsWith('.csv'), 'Report export did not download a CSV file');
    const exportedCsv = await readFile(await download.path(), 'utf8');
    assert(exportedCsv.includes(sale.order.orderNo), 'Downloaded report did not contain the created sale');
    const state = await waitForState(s => s.reportExports?.[0]?.id !== previousExportId && s.reportExports?.[0]?.snapshot,
      'New report export snapshot was not persisted');
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
  const commentText = `QA support ${crypto.randomUUID()}`;
  const replyText = `QA reply ${crypto.randomUUID()}`;
  try {
    await createCreditSale(page);
    await selectModule(page, 18);
    await page.locator(".page-header .primary-btn").click();
    await page.locator('[data-testid="support-task-panel"]').waitFor();
    await page.locator('[data-testid="support-comment-input"]').fill(commentText);
    await page.locator('[data-testid="support-comment-submit"]').click();
    let state = await waitForState(s => s.supportTickets?.some(t => t.comments?.some(c => c.text === commentText)),
      'Support comment was not persisted');
    let ticket = state.supportTickets?.find(t => t.comments?.some(c => c.text === commentText));
    assert(ticket?.id, "Support action did not create a task");
    assert(ticket.orderId || ticket.creditId || ticket.fin, "Support task was not linked to an order, credit, or customer");
    assert(ticket.comments?.some((comment) => comment.text === commentText), "Support comment was not saved on the task");
    let conversation = state.conversations?.find((item) => item.ticketId === ticket.id);
    assert(conversation?.messages?.some((message) => message.text === commentText), "Support comment was not mirrored to messages");

    await selectModule(page, 21);
    await page.locator(`.conversation-row[data-conversation-id="${conversation.id}"]`).click();
    await page.locator(".chat-panel").waitFor();
    const chatText = await page.locator(".chat-panel").innerText();
    assert(chatText.includes(ticket.id), "Message thread does not show the linked support task");
    await page.getByPlaceholder('Mesaj yazın...', { exact: true }).fill(replyText);
    await page.getByRole('button', { name: 'Mesaj göndər', exact: true }).click();
    state = await waitForState(s => s.supportTickets?.some(t => t.id === ticket.id && t.comments?.some(c => c.text === replyText)),
      'Message reply was not persisted on its support task');
    ticket = state.supportTickets?.find((item) => item.id === ticket.id);
    conversation = state.conversations?.find((item) => item.ticketId === ticket.id);
    assert(ticket?.comments?.some((comment) => comment.text === replyText), "Message reply was not written back to the support task");
    assert(conversation?.messages?.some((message) => message.text === replyText), "Message reply was not saved on the thread");
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

assertE2eTarget(process.env);
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

const saveReport = async () => {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/business-flow-audit.json',
    `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
};
await saveReport();
let compatibilityError;
try { auditBackend = await createAuditBackend(process.env); } catch (error) { compatibilityError = error; }
if (compatibilityError) {
  report.failures = auditFlows.map(([name]) => ({ name, error: compatibilityError.message,
    code: compatibilityError.code, blocked: true }));
  await saveReport();
  console.error(`[audit] ${compatibilityError.code}: ${compatibilityError.message}`);
} else {
const auditServer = await ensureAuditServer();
let browser;
let incompatibleBackend = false;
try {
browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
for (const [name, run] of auditFlows) {
  currentFlowName = name;
  if (incompatibleBackend) {
    report.failures.push({ name, error: 'AUDIT_BACKEND_INCOMPATIBLE', blocked: true });
    await saveReport();
    continue;
  }
  console.log(`[audit] ${name} started`);
  try {
    const result = await runBoundedFlow(() => run(browser), flowTimeoutMs,
      () => Promise.all(browser.contexts().map((context) => context.close())));
    report.flows.push({ name, result });
    console.log(`[audit] ${name} passed`);
  } catch (error) {
    incompatibleBackend = error.code === 'AUDIT_BACKEND_INCOMPATIBLE';
    report.failures.push({ name, error: error.message });
    console.error(`[audit] ${name} failed: ${error.message}`);
  }
  await saveReport();
}
} finally {
  await browser?.close();
  auditServer?.kill();
}
}
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/business-flow-audit.json",
  `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report, null, 2));

if (report.flows.length !== 21 || report.failures.length > 0) {
  process.exitCode = 1;
}
