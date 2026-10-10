import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), post: vi.fn() }));
vi.mock('../services/financialSettlement.js', () => ({
  loadReceivableLedger: (...args) => mocks.read(...args),
  loadKpiLedger: (...args) => mocks.read(...args),
  createReceivableSettlement: tenant => payload => mocks.post(tenant, payload),
  createKpiPeriodCommand: tenant => payload => mocks.post(tenant, payload),
  settlementError: error => error,
}));
import { useReceivableLedger } from '../shared/hooks/useFinancialSettlement.js';
beforeEach(() => { mocks.read.mockReset(); mocks.post.mockReset(); });
afterEach(cleanup);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

it('hides data immediately on tenant changes and ignores late reads from an earlier visit', async () => {
  const late = deferred();
  mocks.read.mockImplementation(tenant => tenant === 'A' ? late.promise : Promise.resolve({ items: ['B'] }));
  const { result, rerender } = renderHook(({ tenant }) => useReceivableLedger(tenant), { initialProps: { tenant: 'A' } });
  rerender({ tenant: 'B' });
  await waitFor(() => expect(result.current.data?.items).toEqual(['B']));
  await act(async () => late.resolve({ items: ['private A'] }));
  expect(result.current.data.items).toEqual(['B']);
});
it('coalesces double clicks, rejects a different command while busy and refreshes the authoritative receipt', async () => {
  mocks.read.mockResolvedValue({ items: [] });
  const pending = deferred(); mocks.post.mockReturnValue(pending.promise);
  const { result } = renderHook(() => useReceivableLedger('A'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  let first, second;
  await act(async () => {
    first = result.current.execute({ source_id: 'one' });
    second = result.current.execute({ source_id: 'one' });
    await expect(result.current.execute({ source_id: 'two' })).rejects.toThrow('SETTLEMENT_COMMAND_BUSY');
  });
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ payment_id: 'receipt' }));
  expect(await first).toEqual({ payment_id: 'receipt' });
  expect(await second).toEqual({ payment_id: 'receipt' });
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(result.current.busy).toBe(false);
});
it('does not surface a late write failure or success in another tenant', async () => {
  mocks.read.mockResolvedValue({ items: [] });
  const pending = deferred(); mocks.post.mockReturnValue(pending.promise);
  const { result, rerender } = renderHook(({ tenant }) => useReceivableLedger(tenant), { initialProps: { tenant: 'A' } });
  await waitFor(() => expect(result.current.ready).toBe(true));
  let command;
  await act(async () => { command = result.current.execute({ source_id: 'private A' }); });
  rerender({ tenant: 'B' });
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => pending.reject(new Error('Private A failure')));
  expect(await command).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(false);
});
it('shows failed current writes without pretending they succeeded and permits retry', async () => {
  mocks.read.mockResolvedValue({ items: [] });
  mocks.post.mockRejectedValueOnce(new Error('Payment rejected')).mockResolvedValue({ payment_id: 'retry' });
  const { result } = renderHook(() => useReceivableLedger('A'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => { await expect(result.current.execute({ source_id: 'one' })).rejects.toThrow('Payment rejected'); });
  expect(result.current.error.message).toBe('Payment rejected');
  await act(async () => { expect(await result.current.execute({ source_id: 'one' })).toEqual({ payment_id: 'retry' }); });
  expect(result.current.error).toBeNull();
});
