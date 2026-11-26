import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each table answers with rows or an error; every query is recorded with its filters.
const db = vi.hoisted(() => ({ tables: {}, queries: [], inserts: [] }));

vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeMembership: { tenant_id: 'tenant-a' }, activeTenantId: 'tenant-a' }) }));
vi.mock('../services/readAllRows.js', () => ({
  readAllRows: async (build) => build(),
}));
vi.mock('../integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: () => {},
      from: (table) => {
        const query = { table, filters: [] };
        db.queries.push(query);
        const builder = {
          select: () => builder, order: () => builder, limit: () => builder, like: () => builder,
          range: () => builder, gte: () => builder, lte: () => builder,
          eq: (column, value) => { query.filters.push([column, value]); return builder; },
          insert: (row) => { db.inserts.push([table, row]); return builder; },
          single: async () => ({ data: { id: 'new' }, error: null }),
          then: (resolve, reject) => Promise.resolve(db.tables[table] || { data: [], error: null }).then(resolve, reject),
        };
        return builder;
      },
    },
  };
});

import { useChartOfAccounts, useJournalEntries } from '../shared/hooks/useAccounting.js';
import { useDeals } from '../shared/hooks/useDeals.js';
import { useShipments } from '../shared/hooks/useShipments.js';
import CustomerMessengerPanel from '../modules/notifications/CustomerMessengerPanel.jsx';

const failure = { data: null, error: { message: 'icazə yoxdur' } };

beforeEach(() => {
  db.tables = {};
  db.queries = [];
  db.inserts = [];
});

describe('read errors are returned instead of empty lists', () => {
  it('chart of accounts and journal entries', async () => {
    db.tables = { chart_of_accounts: failure, journal_entries: failure };
    const accounts = renderHook(() => useChartOfAccounts());
    const journal = renderHook(() => useJournalEntries());
    await waitFor(() => expect(accounts.result.current.error).toEqual({ message: 'icazə yoxdur' }));
    await waitFor(() => expect(journal.result.current.error).toEqual({ message: 'icazə yoxdur' }));
    expect(accounts.result.current.accounts).toEqual([]);
  });

  it('deals clear the error once a read succeeds', async () => {
    db.tables = { crm_deals: failure };
    const { result } = renderHook(() => useDeals('tenant-a', 'pipe-1'));
    await waitFor(() => expect(result.current.error?.message).toBe('icazə yoxdur'));
    db.tables = { crm_deals: { data: [{ id: 'D1' }], error: null } };
    await act(() => result.current.refresh());
    expect(result.current.error).toBeNull();
    expect(result.current.deals).toEqual([{ id: 'D1' }]);
  });

  it('shipments report the list error and never number a shipment from a failed read', async () => {
    db.tables = { sales_shipments: failure };
    const { result } = renderHook(() => useShipments('tenant-a'));
    await waitFor(() => expect(result.current.error?.message).toBe('icazə yoxdur'));
    await expect(result.current.create({ order_id: 'O1', carrier: '', tracking_no: '', notes: '' })).rejects.toEqual({ message: 'icazə yoxdur' });
    expect(db.inserts).toEqual([]);
  });

  it('shipments continue numbering after the last one', async () => {
    const year = new Date().getFullYear();
    db.tables = { sales_shipments: { data: [{ shipment_no: `SH-${year}-0041` }], error: null } };
    const { result } = renderHook(() => useShipments('tenant-a'));
    await act(() => result.current.create({ order_id: 'O1', carrier: '', tracking_no: '', notes: '' }));
    expect(db.inserts[0][1]).toMatchObject({ shipment_no: `SH-${year}-0042`, order_id: 'O1' });
  });
});

describe('customer messenger', () => {
  it('reads all customers and the chosen customer’s own orders, and shows read errors', async () => {
    db.tables = {
      customers: { data: [{ id: 'C1', name: 'Aysel' }, { id: 'C2', name: 'Rəşad' }], error: null },
      orders: { data: [], error: null },
      notification_deliveries: failure,
    };
    const { container } = render(<CustomerMessengerPanel />);
    await screen.findByText('Məlumat yüklənmədi: icazə yoxdur');
    const orderQueries = () => db.queries.filter((q) => q.table === 'orders');
    await waitFor(() => expect(orderQueries()).toHaveLength(1));
    expect(orderQueries()[0].filters).toEqual([['tenant_id', 'tenant-a']]);

    const [customerSelect] = container.querySelectorAll('select');
    await waitFor(() => expect(customerSelect.querySelectorAll('option').length).toBeGreaterThan(2));
    fireEvent.change(customerSelect, { target: { value: 'C2' } });
    await waitFor(() => expect(orderQueries()).toHaveLength(2));
    expect(orderQueries()[1].filters).toEqual([['tenant_id', 'tenant-a'], ['customer_id', 'C2']]);
  });
});
