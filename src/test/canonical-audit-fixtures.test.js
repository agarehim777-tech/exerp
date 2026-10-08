// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('waits for rendered modules without requiring background network traffic to stop', async () => {
  const source = await readFile(new URL('../../tests/critical-workflows.spec.ts', import.meta.url), 'utf8');
  expect(source).not.toContain("waitForLoadState('networkidle')");
  expect(source).toContain('page.locator("main.main")');
  expect(source).toContain('page.locator(".page-header h1")');
  expect(source).toContain('expect(errors).toEqual([])');
  expect(source).toContain('insights rejects a tenant without membership');
});

it('keeps the delivery fixture behind invoice creation and posting commands', async () => {
  const source = await readFile(new URL('../../tests/delivery-reversal-lifecycle.spec.ts', import.meta.url), 'utf8');
  expect(source).toContain("rpc('create_sales_invoice_atomic', invoiceCommand)");
  expect(source).toContain("rpc('post_invoice_to_gl', posting)");
  expect(source).toContain('toBe(events[0].journal_entry_id)');
  expect(source).not.toMatch(/insert\(['"](?:sales_invoices|sales_invoice_lines|invoice_payments)['"]/);
  expect(source).toContain('Number(issued.paid_amount)).toBe(200)');
  expect(source).toContain('reversal_of=eq.${unrelated.id}');
});

it('does not treat simulated purchase or payroll cash as finance audit evidence', async () => {
  const source = await readFile(new URL('../../scripts/business-flow-audit.mjs', import.meta.url), 'utf8');
  const finance = source.slice(source.indexOf('async function auditFinanceModuleIntegration('),
    source.indexOf('async function auditReceivableCreditorWorkflow('));
  expect(finance).toContain("auditBackend.command('cashbook_ledger_summary'");
  expect(finance).toContain("read('cash_transactions'");
  expect(finance).toContain("auditBackend.command('post_credit_payment'");
  expect(finance).toContain("auditBackend.command('transfer_cash_atomic'");
  expect(finance).toContain('transferRows.length === 2');
  expect(finance).toContain('Number(account.inflow) === 0 && Number(account.outflow) === 0');
  expect(finance).not.toMatch(/finance-daily-close|finance-ledger-panel|cashImpact|Vendor PO|HR Payroll|Zavod sifarişi/);
});
