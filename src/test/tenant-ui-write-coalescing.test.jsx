import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useTenantUiPersistence } from '../shared/hooks/useTenantUiPersistence.js';

const mocks = vi.hoisted(() => ({ upsert: vi.fn(async () => ({ error: null })) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { state: {} }, error: null }) }) }), upsert: mocks.upsert }),
} }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
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
