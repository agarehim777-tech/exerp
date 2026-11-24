import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { changedSnapshotKeys, snapshotKeyJson, useTenantUiPersistence } from '../shared/hooks/useTenantUiPersistence.js';

// Snapshot writes go through save_tenant_state_patch with only the changed top-level keys.
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: { saved: [], denied: [] }, error: null })),
  snapshot: {},
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { state: mocks.snapshot }, error: null }) }) }) }),
  rpc: mocks.rpc,
} }));
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.clearAllMocks(); mocks.snapshot = {};
  mocks.rpc.mockImplementation(async () => ({ data: { saved: [], denied: [] }, error: null }));
});
const hydrateState = value => value;
const patches = () => mocks.rpc.mock.calls.map(([name, args]) => {
  expect(name).toBe('save_tenant_state_patch');
  return args._patch;
});

it('sends nothing on load and then only the keys the user changed', async () => {
  vi.useFakeTimers();
  mocks.snapshot = { theme: 'light', supportTickets: [{ id: 'T1' }] };
  const options = { tenantId: 'tenant-a', userId: 'user-a', setState: vi.fn(), hydrateState, localKey: 'test-ui', schemaVersion: 3 };
  const { rerender } = renderHook(({ state }) => useTenantUiPersistence({ ...options, state }),
    { initialProps: { state: { theme: 'light', supportTickets: [{ id: 'T1' }] } } });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.rpc).not.toHaveBeenCalled();

  // Operational rows have their own tables: changing them never writes the snapshot.
  rerender({ state: { theme: 'light', supportTickets: [{ id: 'T1' }], orders: [{ id: 'O1' }] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.rpc).not.toHaveBeenCalled();

  rerender({ state: { theme: 'light', supportTickets: [{ id: 'T1' }, { id: 'T2' }] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(patches()).toEqual([{ supportTickets: [{ id: 'T1' }, { id: 'T2' }] }]);
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ _tenant_id: 'tenant-a', _schema_version: 3 });

  // The saved value becomes the new baseline: the same state is not sent again.
  rerender({ state: { theme: 'light', supportTickets: [{ id: 'T1' }, { id: 'T2' }] } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('keeps one patch in flight and merges later edits into the next one', async () => {
  vi.useFakeTimers();
  let release;
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  mocks.snapshot = { conversations: [{ text: 'original' }], theme: 'light' };
  const options = { tenantId: 'tenant-a', userId: 'user-a', setState: vi.fn(), hydrateState, localKey: 'test-ui', schemaVersion: 3 };
  const { rerender } = renderHook(({ state }) => useTenantUiPersistence({ ...options, state }),
    { initialProps: { state: { conversations: [{ text: 'original' }], theme: 'light' } } });
  await act(async () => { await Promise.resolve(); });
  rerender({ state: { conversations: [{ text: 'second' }], theme: 'light' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  rerender({ state: { conversations: [{ text: 'latest reply' }], theme: 'light' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  rerender({ state: { conversations: [{ text: 'latest reply' }], theme: 'dark' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  await act(async () => { release({ data: { saved: ['conversations'], denied: [] }, error: null }); await Promise.resolve(); });
  expect(patches()).toEqual([
    { conversations: [{ text: 'second' }] },
    { conversations: [{ text: 'latest reply' }], theme: 'dark' },
  ]);
});

it('does not drain queued edits after leaving a tenant', async () => {
  vi.useFakeTimers();
  let release;
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const options = { userId: 'user-a', setState: vi.fn(), hydrateState, localKey: 'test-ui', schemaVersion: 3 };
  const { rerender } = renderHook(({ tenantId, state }) => useTenantUiPersistence({ ...options, tenantId, state }),
    { initialProps: { tenantId: 'tenant-a', state: { theme: 'light' } } });
  await act(async () => { await Promise.resolve(); });
  rerender({ tenantId: 'tenant-a', state: { theme: 'dark' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  rerender({ tenantId: 'tenant-a', state: { theme: 'light' } });
  rerender({ tenantId: null, state: {} });
  await act(async () => { release({ data: { saved: ['theme'], denied: [] }, error: null }); await vi.advanceTimersByTimeAsync(1000); });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('retries a failed patch and reports keys the server refused as a warning', async () => {
  vi.useFakeTimers();
  mocks.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'network' } }));
  mocks.rpc.mockImplementationOnce(async () => ({ data: { saved: ['supportTickets'], denied: ['settings'] }, error: null }));
  const onError = vi.fn();
  const onWarning = vi.fn();
  const options = { tenantId: 'tenant-a', userId: 'user-a', setState: vi.fn(), hydrateState, localKey: 'test-ui', schemaVersion: 3, onError, onWarning };
  const { rerender } = renderHook(({ state }) => useTenantUiPersistence({ ...options, state }),
    { initialProps: { state: { supportTickets: [], settings: { a: 1 } } } });
  await act(async () => { await Promise.resolve(); });
  rerender({ state: { supportTickets: [{ id: 'T1' }], settings: { a: 2 } } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(onError).toHaveBeenCalledTimes(1);
  // The next change re-sends the failed keys together with the new one.
  rerender({ state: { supportTickets: [{ id: 'T1' }, { id: 'T2' }], settings: { a: 2 } } });
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(patches()[1]).toEqual({ supportTickets: [{ id: 'T1' }, { id: 'T2' }], settings: { a: 2 } });
  expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ message: 'tenant_state_denied: settings' }));
});

it('diffs top-level keys by JSON value', () => {
  const saved = snapshotKeyJson({ a: [1], b: { x: 1 }, c: null });
  expect(changedSnapshotKeys({ a: [1], b: { x: 2 }, c: undefined, d: 'new' }, saved)).toEqual({ b: { x: 2 }, d: 'new' });
});
