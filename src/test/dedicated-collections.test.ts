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

it('has no browser copies of cash entries, finance accounts or credits', () => {
  // Retired: cash_transactions, cash_accounts and credit_contracts are the only sources.
  for (const name of ['cashEntries', 'financeAccounts', 'credits']) expect(() => definitionFor(name)).toThrow('Unknown collection');
  expect(() => definitionFor('unknown')).toThrow('Unknown collection');
});