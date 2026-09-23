import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useTenantRequestScope } from '../shared/hooks/useTenantRequestScope';
import { useDbReadBridge } from '../shared/hooks/useDbReadBridge';
import { useProducts } from '../shared/hooks/useProducts';

const requests = vi.hoisted(() => []);
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  from: () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const query = { select: () => query, eq: () => query, order: () => query,
      limit: () => { requests.push(resolve); return promise; } };
    return query;
  },
} }));
vi.mock('../shared/hooks/useRealtimeResync', () => ({ useRealtimeResync: () => {} }));

describe('tenant request boundary', () => {
  beforeEach(() => requests.splice(0));

  it('invalidates responses across A -> B -> A and unmount', () => {
    const { result, rerender, unmount } = renderHook(({ id }) => useTenantRequestScope(id), { initialProps: { id: 'A' } });
    const first = result.current.begin();
    rerender({ id: 'B' });
    expect(first()).toBe(false);
    rerender({ id: 'A' });
    expect(first()).toBe(false);
    const current = result.current.begin();
    expect(current()).toBe(true);
    unmount();
    expect(current()).toBe(false);
  });

  it('only accepts the newest request in each independent lane', () => {
    const { result } = renderHook(() => useTenantRequestScope('A'));
    const old = result.current.begin('base');
    const movements = result.current.begin('movements');
    const current = result.current.begin('base');
    expect(old()).toBe(false);
    expect(movements()).toBe(true);
    expect(current()).toBe(true);
  });

  it('hides previous products immediately and ignores late tenant responses', async () => {
    const { result, rerender } = renderHook(({ id }) => useProducts(id), { initialProps: { id: 'A' } });
    await act(async () => requests.shift()({ data: [{ id: 'a' }], error: null }));
    expect(result.current.products[0].id).toBe('a');
    let pending;
    act(() => { pending = result.current.refresh(); });
    const oldResponse = requests.shift();
    rerender({ id: 'B' });
    expect(result.current.products).toEqual([]);
    expect(result.current.loaded).toBe(false);
    await act(async () => requests.shift()({ data: [{ id: 'b' }], error: null }));
    await act(async () => { oldResponse({ data: [{ id: 'stale-a' }], error: null }); await pending; });
    expect(result.current.products[0].id).toBe('b');
  });

  it('keeps data on read failure but clears it on a successful empty response', async () => {
    const { result } = renderHook(() => useProducts('A'));
    await act(async () => requests.shift()({ data: [{ id: 'a' }], error: null }));
    let pending;
    act(() => { pending = result.current.refresh(); });
    await act(async () => { requests.shift()({ data: null, error: { message: 'offline' } }); await pending; });
    expect(result.current.products).toHaveLength(1);
    act(() => { pending = result.current.refresh(); });
    await act(async () => { requests.shift()({ data: [], error: null }); await pending; });
    expect(result.current.products).toEqual([]);
    expect(result.current.loaded).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('clears all loaded empty lists in the legacy read bridge', async () => {
    const rows = [];
    const inventory = { balances: rows, warehouses: rows, loaded: true };
    const { result } = renderHook(() => {
      const [state, setState] = useState({ customers: [{}], products: [{}], orders: [{}], stock: [{}], warehouses: [{}], warehouseStock: { old: [{}] } });
      useDbReadBridge({ tenantId: 'A', ready: true, customers: rows, customersLoaded: true, products: rows, productsLoaded: true, orders: rows, ordersLoaded: true, inventory, setState });
      return state;
    });
    await waitFor(() => expect(result.current).toEqual({ customers: [], products: [], orders: [], stock: [], warehouses: [], warehouseStock: {} }));
  });
});
