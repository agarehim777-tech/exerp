import { describe, expect, it } from 'vitest';
import {
  stripDbBackedCollections,
  stripOperationalCollections,
  withoutDbBackedData,
  withoutOperationalData,
} from '../shared/state/tenantPersistence.js';

describe('tenant UI persistence boundary', () => {
  it('never hydrates operational collections from snapshots', () => {
    const result = withoutOperationalData({ customers: [{ id: 'c1' }], warehouseStock: { w1: [{}] }, theme: 'dark' });
    expect(result.customers).toEqual([]);
    expect(result.warehouseStock).toEqual({});
    expect(result.theme).toBe('dark');
  });

  it('never persists operational Supabase collections', () => {
    const result = stripOperationalCollections({
      customers: [{ id: 'customer-1' }],
      orders: [{ id: 'order-1' }],
      cashEntries: [{ id: 'cash-1' }],
      credits: [{ id: 'credit-1' }],
      settings: { theme: 'light' },
      notifications: [{ id: 'ui-only' }],
    });

    expect(result).toEqual({
      settings: { theme: 'light' },
      notifications: [{ id: 'ui-only' }],
    });
  });

  it('removes transitional modules from the Supabase tenant snapshot', () => {
    expect(stripDbBackedCollections({
      orders: [{ id: 'db-order' }],
      employees: [{ id: 'snapshot-employee' }],
      settings: { theme: 'light' },
    })).toEqual({ settings: { theme: 'light' } });
  });

  it('resets every operational module during snapshot hydration', () => {
    const result = withoutDbBackedData({
      orders: [{ id: 'db-order' }],
      customers: [{ id: 'db-customer' }],
      employees: [{ id: 'emp-1' }],
      expenses: [{ id: 'exp-1' }],
      cashEntries: [{ id: 'cash-1' }],
      credits: [{ id: 'credit-1' }],
      settings: { theme: 'light' },
    });

    expect(result.orders).toEqual([]);
    expect(result.customers).toEqual([]);
    expect(result.employees).toEqual([]);
    expect(result.expenses).toEqual([]);
    expect(result.cashEntries).toEqual([]);
    expect(result.credits).toEqual([]);
    expect(result.warehouseStock).toEqual({});
    expect(result.settings).toEqual({ theme: 'light' });
  });
});
