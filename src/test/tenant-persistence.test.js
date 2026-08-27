import { describe, expect, it } from 'vitest';
import { stripDbBackedCollections, stripOperationalCollections } from '../shared/state/tenantPersistence.js';

describe('tenant UI persistence boundary', () => {
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

  it('keeps transitional modules in the Supabase tenant snapshot', () => {
    expect(stripDbBackedCollections({
      orders: [{ id: 'db-order' }],
      employees: [{ id: 'snapshot-employee' }],
      settings: { theme: 'light' },
    })).toEqual({
      employees: [{ id: 'snapshot-employee' }],
      settings: { theme: 'light' },
    });
  });
});
