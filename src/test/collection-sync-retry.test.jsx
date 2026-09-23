import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCollectionSync } from '../shared/hooks/useCollectionSync';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, in: () => query, order: () => query,
    range: mocks.load, upsert: mocks.save };
  return query;
} } }));
const collections = ['employees'];
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.save.mockReset();
});
afterEach(() => vi.useRealTimers());

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
  expect(mocks.save.mock.calls[1][0][0].data.name).toBe('Second');
});
