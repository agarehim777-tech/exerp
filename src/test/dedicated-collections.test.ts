import { expect, it } from 'vitest';
import { definitionFor, fromDedicatedRow, toDedicatedRow } from '../shared/adapters/dedicatedCollections';

it('stores salary in an employee column and preserves supplementary fields across reload', () => {
  const source = { tenant_id: 'tenant-a', collection: 'employees', record_key: 'EMP-1', position: 2,
    data: { id: 'EMP-1', name: 'Ayan', salary: 750, kpi: 85 } };
  const saved = toDedicatedRow(source);
  expect(saved).toMatchObject({ tenant_id: 'tenant-a', full_name: 'Ayan', salary: 750, sort_position: 2 });
  expect(saved.metadata).toEqual({ id: 'EMP-1', kpi: 85 });
  expect(fromDedicatedRow(saved, 'employees')).toEqual(source);
});

it('stores account balances and credit debt in separate domain columns', () => {
  expect(definitionFor('financeAccounts').table).toBe('finance_account_records');
  expect(definitionFor('credits').table).toBe('finance_credit_records');
  expect(toDedicatedRow({ tenant_id: 'a', collection: 'credits', record_key: 'c', position: 0,
    data: { total: 10000, initialPayment: 1000, balance: 9000, months: 12 } }))
    .toMatchObject({ total: 10000, initial_payment: 1000, balance: 9000, months: 12 });
  expect(() => definitionFor('unknown')).toThrow('Unknown collection');
});