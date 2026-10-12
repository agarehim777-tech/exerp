// @vitest-environment node
import { expect, it } from 'vitest';
import { checkCoreBackend, coreRpcProbes, coreTables } from '../../scripts/core-backend-contract.mjs';

const url = 'https://project.invalid';
const response = status => new Response(status >= 400 ? 'permission denied' : '[]', { status });
const success = (address, init) => response(init?.method === 'POST' || address.includes('/operation_requests?') ? 403 : 200);

it('requires deployed HR, settlement, procurement, production and invoice capabilities without a bearer session', async () => {
  expect(coreTables).toEqual(expect.arrayContaining(['tenant_collection_records', 'receivable_settlements', 'kpi_periods', 'vendor_invoice_payments']));
  expect(coreRpcProbes.map(([name]) => name)).toEqual(expect.arrayContaining(['settle_receivable_atomic', 'run_kpi_period_atomic',
    'pay_vendor_invoice_atomic', 'post_material_production', 'create_sales_invoice_atomic', 'import_warehouse_stock_atomic']));
  const calls = [];
  const report = await checkCoreBackend(url, 'test-public', async (address, init) => {
    calls.push([address, init]); return success(address, init);
  });
  expect(report.ok).toBe(true);
  expect(calls).toHaveLength(coreTables.length + coreRpcProbes.length);
  for (const [address, init] of calls) {
    expect(init.headers.authorization).toBeUndefined();
    expect(init.headers.Authorization).toBeUndefined();
    if (init.method === 'POST') expect(JSON.parse(init.body)._tenant_id).toBe('00000000-0000-0000-0000-000000000000');
    else expect(new URL(address).searchParams.get('limit')).toBe('0');
  }
});

it('blocks release for each missing new table and RPC even when old contracts pass', async () => {
  for (const name of ['tenant_collection_records', 'receivable_settlements', 'kpi_periods', 'vendor_invoice_payments',
    'settle_receivable_atomic', 'run_kpi_period_atomic', 'pay_vendor_invoice_atomic']) {
    const report = await checkCoreBackend(url, 'test-public', (address, init) =>
      response(new URL(address).pathname.split('/').at(-1) === name ? 404 : success(address, init).status));
    expect(report.ok).toBe(false);
    expect(report.code).toBe('ERP_SCHEMA_MIGRATION_REQUIRED');
    expect(report.checks.filter(check => !check.ok)).toHaveLength(1);
  }
});

it('accepts protected tables without anonymous grants but rejects anonymous command execution', async () => {
  expect((await checkCoreBackend(url, 'test-public', async () => response(403))).ok).toBe(false);
  const report = await checkCoreBackend(url, 'test-public', (address, init) => {
    if (address.endsWith('/run_kpi_period_atomic')) return response(200);
    if (address.includes('/kpi_periods?')) return response(403);
    return success(address, init);
  });
  expect(report.ok).toBe(false);
  expect(report.checks.find(check => check.table === 'kpi_periods').ok).toBe(true);
  expect(report.checks.find(check => check.rpc === 'run_kpi_period_atomic').ok).toBe(false);
});

it('fails closed on configuration and network failures', async () => {
  await expect(checkCoreBackend('', 'key', success)).rejects.toThrow('CONFIG_REQUIRED');
  const report = await checkCoreBackend(url, 'test-public', async () => { throw new Error('offline'); });
  expect(report.ok).toBe(false);
  expect(report.checks.every(check => !check.ok)).toBe(true);
  expect(report.code).toBe('ERP_BACKEND_CONTRACT_FAILED');
});

it('rejects a staging URL in a production deploy before any database access', async () => {
  let probes = 0;
  const probe = (...args) => { probes += 1; return success(...args); };
  await expect(checkCoreBackend('https://staging.supabase.co', 'key', probe,
    { expectedProjectRef: 'production' })).rejects.toThrow('PROJECT_MISMATCH');
  expect(probes).toBe(0);
  await expect(checkCoreBackend('http://production.supabase.co', 'key', probe,
    { expectedProjectRef: 'production' })).rejects.toThrow('PROJECT_MISMATCH');
  expect(probes).toBe(0);
  expect((await checkCoreBackend('https://production.supabase.co/', 'key', probe,
    { expectedProjectRef: 'production' })).ok).toBe(true);
});
