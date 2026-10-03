import { beforeEach, expect, it, vi } from 'vitest';
const { from, results, queries } = vi.hoisted(() => ({ from: vi.fn(), results: [], queries: [] }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from } }));
import { ensureMainCashAccount } from '../services/cashAccounts.js';

beforeEach(() => {
  results.length = 0; queries.length = 0; from.mockReset();
  from.mockImplementation(table => {
    const calls = [['from', table]]; queries.push(calls);
    const chain = {};
    for (const method of ['select','eq','ilike','order','limit','insert','update']) {
      chain[method] = (...args) => { calls.push([method, ...args]); return chain; };
    }
    for (const method of ['maybeSingle','single']) chain[method] = async () => results.shift();
    return chain;
  });
});
const empty = { data: null, error: null };
const tenant = '11111111-1111-4111-8111-111111111111';

it('creates the canonical code and scopes every lookup by tenant and currency', async () => {
  results.push(empty, empty, empty, { data: { id: 'new-account' }, error: null });
  expect(await ensureMainCashAccount(tenant, ' usd ')).toEqual({ id: 'new-account' });
  for (const calls of queries.slice(0, 3)) {
    expect(calls).toContainEqual(['eq','tenant_id',tenant]);
    expect(calls).toContainEqual(['eq','currency','USD']);
  }
  const payload = queries[3].find(call => call[0] === 'insert')[1];
  expect(payload).toMatchObject({ tenant_id: tenant, code: 'MAIN-11111111-USD', account_no: 'MAIN-11111111', currency: 'USD', opening_balance: 0 });
});

it('reuses an existing account without a write', async () => {
  results.push({ data: { id: 'existing' }, error: null });
  expect(await ensureMainCashAccount(tenant)).toEqual({ id: 'existing' });
  expect(queries).toHaveLength(1);
});

it('reactivates only the selected tenant/currency account without recreating it', async () => {
  results.push(empty, empty, { data: { id: 'inactive' }, error: null }, { data: { id: 'inactive' }, error: null });
  expect(await ensureMainCashAccount(tenant, 'EUR')).toEqual({ id: 'inactive' });
  expect(queries[3]).toContainEqual(['eq', 'id', 'inactive']);
  expect(queries[3]).toContainEqual(['eq', 'tenant_id', tenant]);
  expect(queries[3].find(call => call[0] === 'update')[1]).toMatchObject({ is_active: true, currency: 'EUR' });
  expect(queries.flat().some(call => call[0] === 'insert')).toBe(false);
});

it('resolves a concurrent unique-key insert without a second insert', async () => {
  results.push(empty, empty, empty, { data: null, error: { code: '23505' } }, { data: { id: 'winner' }, error: null });
  expect(await ensureMainCashAccount(tenant)).toEqual({ id: 'winner' });
  expect(queries.flat().filter(call => call[0] === 'insert')).toHaveLength(1);
});

it('preserves permission errors and rejects invalid scope before querying', async () => {
  await expect(ensureMainCashAccount(null)).rejects.toThrow('tenantId');
  await expect(ensureMainCashAccount(tenant, 'INVALID')).rejects.toThrow('Valyuta');
  expect(from).not.toHaveBeenCalled();
  const error = { code: '42501', message: 'permission denied' };
  results.push({ data: null, error });
  await expect(ensureMainCashAccount(tenant)).rejects.toBe(error);
  expect(queries).toHaveLength(1);
});
