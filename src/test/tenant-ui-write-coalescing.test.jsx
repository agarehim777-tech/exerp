import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useTenantUiPersistence } from '../shared/hooks/useTenantUiPersistence.js';

const mocks = vi.hoisted(() => ({ upsert: vi.fn(async () => ({ error: null })) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { state: {} }, error: null }) }) }), upsert: mocks.upsert }),
} }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); mocks.upsert.mockImplementation(async () => ({ error: null })); });
const hydrateState = value => value;

it('does not postpone or repeat snapshot writes when only canonical operational rows change', async () => {
  vi.useFakeTimers();
  const options = { tenantId: 'tenant-a', userId: 'user-a', setState: vi.fn(), hydrateState,
    localKey: 'test-ui', schemaVersion: 3 };
  const { rerender } = renderHook(({ state }) => useTenantUiPersistence({ ...options, state }),
    { initialProps: { state: { theme: 'light', orders: [] } } });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  rerender({ state: { theme: 'light', orders: [{ id: 'confirmed' }], products: [{ id: 'product' }] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
  expect(mocks.upsert.mock.calls[0][0].state).toEqual({ theme: 'light' });
  rerender({ state: { theme: 'light', orders: [], warehouses: [{ id: 'warehouse' }] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
  rerender({ state: { theme: 'dark', orders: [] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(mocks.upsert).toHaveBeenCalledTimes(2);
  expect(mocks.upsert.mock.calls[1][0].state).toEqual({ theme: 'dark' });
});

it('serializes in-flight snapshots and drains only the newest queued edit', async () => {
  vi.useFakeTimers();
  let release;
  mocks.upsert.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const options = { tenantId: 'tenant-a', userId: 'user-a', setState: vi.fn(), hydrateState,
    localKey: 'test-ui', schemaVersion: 3 };
  const { rerender } = renderHook(({ state }) => useTenantUiPersistence({ ...options, state }),
    { initialProps: { state: { conversations: [{ text: 'original' }] } } });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
  rerender({ state: { conversations: [{ text: 'second' }] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  rerender({ state: { conversations: [{ text: 'latest reply' }] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
  await act(async () => { release({ error: null }); await Promise.resolve(); });
  expect(mocks.upsert).toHaveBeenCalledTimes(2);
  expect(mocks.upsert.mock.calls[1][0].state).toEqual({ conversations: [{ text: 'latest reply' }] });
});

it('does not drain queued edits after leaving a tenant', async () => {
  vi.useFakeTimers();
  let release;
  mocks.upsert.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const options = { userId: 'user-a', setState: vi.fn(), hydrateState, localKey: 'test-ui', schemaVersion: 3 };
  const { rerender } = renderHook(({ tenantId, state }) => useTenantUiPersistence({ ...options, tenantId, state }),
    { initialProps: { tenantId: 'tenant-a', state: { theme: 'light' } } });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  rerender({ tenantId: 'tenant-a', state: { theme: 'dark' } });
  rerender({ tenantId: null, state: {} });
  await act(async () => { release({ error: null }); await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.upsert).toHaveBeenCalledTimes(1);
});
