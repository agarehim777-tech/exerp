import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCollectionSync } from '../shared/hooks/useCollectionSync';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), eq: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { rpc: (_name, args) => mocks.save(args._changes), from: (table) => {
  mocks.eq('table', table);
  const query = { select: () => query, eq: (...args) => { mocks.eq(...args); return query; }, in: () => query, order: () => query,
    range: mocks.load, upsert: mocks.save };
  return query;
} } }));
const collections = ['employees'];
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue({ data: [], error: null, count: 0 });
  mocks.save.mockReset();
  mocks.eq.mockReset();
});
afterEach(() => vi.useRealTimers());

it('refresh reads changes made by another user after hydration', async () => {
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { state, sync };
  });
  await waitFor(() => expect(result.current.sync.ready).toBe(true));
  mocks.load.mockResolvedValue({ data: [{ record_key: 'remote', sort_position: 0, metadata: { id: 'remote' }, full_name: 'Remote' }], count: 1, error: null });
  await act(async () => result.current.sync.refresh());
  expect(result.current.state.employees[0].name).toBe('Remote');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('does not replace unsaved local edits when refresh cannot save them', async () => {
  mocks.save.mockResolvedValue({ error: new Error('offline') });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { state, setState, sync };
  });
  await waitFor(() => expect(result.current.sync.ready).toBe(true));
  vi.useFakeTimers();
  act(() => result.current.setState({ employees: [{ id: 'local', name: 'Keep' }] }));
  await act(async () => result.current.sync.refresh());
  expect(result.current.sync.phase).toBe('error');
  expect(result.current.state.employees[0].name).toBe('Keep');
  expect(mocks.load).toHaveBeenCalledTimes(1);
});

it('reads collections separately and publishes no partial state when a later collection fails', async () => {
  const names = ['employees', 'departments'];
  mocks.load.mockResolvedValueOnce({ data: [{ collection: 'departments', record_key: 'd1', position: 0, data: { id: 'd1' } }], count: 1 })
    .mockResolvedValueOnce({ error: { code: '57014', message: 'timeout' } });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [], departments: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections: names, state, setState });
    return { state, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('error'));
  expect(mocks.eq).toHaveBeenCalledWith('table', 'hr_departments');
  expect(mocks.eq).toHaveBeenCalledWith('table', 'employees');
  expect(result.current.sync.ready).toBe(false);
  expect(result.current.state).toEqual({ employees: [], departments: [] });
  expect(mocks.save).not.toHaveBeenCalled();
});

it('keeps collection commands blocked until initial hydration finishes and resets readiness on tenant changes', async () => {
  let finish;
  mocks.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ tenant }) => {
    const [state, setState] = useState({ employees: [] });
    return useCollectionSync({ tenantId: tenant, ready: true, collections, state, setState });
  }, { initialProps: { tenant: 'A' } });
  expect(result.current.ready).toBe(false);
  await act(async () => finish({ data: [], error: null, count: 0 }));
  expect(result.current.ready).toBe(true);
  rerender({ tenant: 'B' });
  expect(result.current.ready).toBe(false);
  await act(async () => finish({ data: [], error: null, count: 0 }));
  expect(result.current.ready).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('hydrates every collection record when the server caps pages below the requested size', async () => {
  const rows = Array.from({ length: 460 }, (_, index) => ({ collection: 'employees',
    record_key: `e${index}`, sort_position: index, metadata: { id: `e${index}` }, full_name: `Employee ${index}` }));
  mocks.load.mockImplementation(async (start, end) => ({
    data: rows.slice(start, Math.min(end + 1, start + 100)), count: rows.length, error: null,
  }));
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { state, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('saved'));
  expect(result.current.state.employees).toHaveLength(460);
  expect(result.current.state.employees.at(-1).id).toBe('e459');
  expect(mocks.load.mock.calls.map(([start]) => start)).toEqual([0, 100, 200, 300, 400]);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('does not hydrate or overwrite state after an incomplete collection response', async () => {
  mocks.load.mockResolvedValue({ data: [], count: 460, error: null });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [{ id: 'unsaved' }] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { state, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('error'));
  expect(result.current.state.employees).toEqual([{ id: 'unsaved' }]);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('retains failed edits for retry and acknowledges only successful writes', async () => {
  mocks.save.mockResolvedValueOnce({ error: { message: 'offline' } }).mockResolvedValue({ error: null });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { state, setState, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('saved'));
  vi.useFakeTimers();
  act(() => result.current.setState({ employees: [{ id: 'e1', name: 'New' }] }));
  await act(async () => vi.advanceTimersByTimeAsync(450));
  expect(result.current.sync.phase).toBe('error');
  expect(result.current.state.employees).toHaveLength(1);
  await act(async () => result.current.sync.retry());
  expect(result.current.sync.phase).toBe('saved');
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls[1][0]).toEqual(mocks.save.mock.calls[0][0]);
  await act(async () => result.current.sync.retry());
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

it('serializes newer edits behind an in-flight save', async () => {
  let finish;
  mocks.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ error: null });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { setState, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('saved'));
  vi.useFakeTimers();
  act(() => result.current.setState({ employees: [{ id: 'e1', name: 'First' }] }));
  await act(async () => vi.advanceTimersByTimeAsync(450));
  act(() => result.current.setState({ employees: [{ id: 'e1', name: 'Second' }] }));
  await act(async () => vi.advanceTimersByTimeAsync(450));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async () => finish({ error: null }));
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls[1][0][0].row.full_name).toBe('Second');
});

it('does not starve an employee write when unrelated inventory reads keep updating state', async () => {
  mocks.save.mockResolvedValue({ error: null });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [], warehouses: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { setState, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('saved'));
  vi.useFakeTimers();
  act(() => result.current.setState(current => ({ ...current, employees: [{ id: 'e1', name: 'Pending' }] })));
  for (let read = 0; read < 4; read += 1) {
    await act(async () => vi.advanceTimersByTimeAsync(100));
    act(() => result.current.setState(current => ({ ...current, warehouses: [{ id: `w${read}` }] })));
  }
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][0][0].row.full_name).toBe('Pending');
  expect(result.current.sync.phase).toBe('saved');
});

it('preserves edits during hydration without backfilling unchanged browser records', async () => {
  let finishRead;
  mocks.load.mockImplementation(() => new Promise(resolve => { finishRead = resolve; }));
  mocks.save.mockResolvedValue({ error: null });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [{ id: 'stale', name: 'Browser only' }] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections, state, setState });
    return { state, setState, sync };
  });
  act(() => result.current.setState(current => ({ employees: [{ id: 'new', name: 'Pending' }, ...current.employees] })));
  vi.useFakeTimers();
  await act(async () => finishRead({ data: [{ collection: 'employees', record_key: 'server',
    sort_position: 0, metadata: { id: 'server' }, full_name: 'Canonical' }], count: 1, error: null }));
  expect(result.current.state.employees.map(row => row.id)).toEqual(['server', 'new']);
  await act(async () => vi.advanceTimersByTimeAsync(450));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][0].map(change => change.row.record_key)).toEqual(['new']);
});

it('starts every collection read at once instead of one table after another', async () => {
  // Ten sequential reads kept Messages and Support at 0 for ~4.5 s after opening the app.
  const names = ['employees', 'departments', 'conversations', 'supportTickets'];
  const pending = [];
  mocks.load.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [], departments: [], conversations: [], supportTickets: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections: names, state, setState });
    return { state, sync };
  });
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(names.length));
  expect(result.current.sync.ready).toBe(false);
  await act(async () => { pending.forEach((resolve) => resolve({ data: [], error: null, count: 0 })); });
  await waitFor(() => expect(result.current.sync.ready).toBe(true));
});

it('saves each collection separately so a refused module does not roll back the others', async () => {
  // apply_collection_changes runs with the caller's RLS: one module without edit rights used to fail the whole batch.
  const names = ['employees', 'departments'];
  const { result } = renderHook(() => {
    const [state, setState] = useState({ employees: [], departments: [] });
    const sync = useCollectionSync({ tenantId: 'A', ready: true, collections: names, state, setState });
    return { state, setState, sync };
  });
  await waitFor(() => expect(result.current.sync.ready).toBe(true));
  mocks.save.mockImplementation(async (changes) => (changes[0].table === 'hr_departments'
    ? { error: { code: '42501', message: 'new row violates row-level security policy' } } : { error: null }));
  act(() => result.current.setState({ employees: [{ id: 'E1', name: 'Aysel' }], departments: [{ id: 'D1', name: 'Satış' }] }));
  await waitFor(() => expect(result.current.sync.phase).toBe('error'));
  expect(mocks.save.mock.calls.map(([changes]) => changes.map((change) => change.table))).toEqual(
    expect.arrayContaining([['employees'], ['hr_departments']]));
  // The allowed collection was acknowledged: a retry only resends the refused one.
  mocks.save.mockClear();
  await act(async () => result.current.sync.retry());
  expect(mocks.save.mock.calls.map(([changes]) => changes[0].table)).toEqual(['hr_departments']);
});
