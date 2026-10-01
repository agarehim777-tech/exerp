import { expect, test } from 'vitest';
import { stockBalanceKey } from '../shared/lib/stockBalanceIdentity.js';

test('canonical balances have distinct composite identities without an id column', () => {
  const row = { tenant_id: 'tenant', warehouse_id: 'warehouse', product_id: 'product' };
  expect(stockBalanceKey(row)).toBe(stockBalanceKey({ ...row, on_hand: 10 }));
  for (const field of ['tenant_id', 'warehouse_id', 'product_id']) {
    expect(stockBalanceKey({ ...row, [field]: 'other' })).not.toBe(stockBalanceKey(row));
    expect(stockBalanceKey({ ...row, [field]: null })).toBeNull();
  }
  expect(stockBalanceKey(undefined)).toBeNull();
});
