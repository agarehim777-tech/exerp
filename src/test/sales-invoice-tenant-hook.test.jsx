import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read:vi.fn(), sources:vi.fn() }));
vi.mock('../services/billingRead.js',() => ({ readSalesInvoicePage:mocks.read,readBillingSources:mocks.sources }));
vi.mock('../shared/hooks/useRealtimeResync.js',() => ({ useRealtimeResync:() => false }));
import { useSalesInvoices } from '../shared/hooks/useSalesInvoices.js';
import { useBillingSources } from '../shared/hooks/useBillingSources.js';
afterEach(cleanup);

it('hides invoices immediately on tenant change and ignores the first A response after A -> B -> A',async () => {
  let resolveOld;
  mocks.read.mockReset().mockImplementationOnce(() => new Promise(resolve => { resolveOld=resolve; }))
    .mockResolvedValueOnce([{ id:'invoice-b' }]).mockResolvedValue([{ id:'current-a' }]);
  const { result,rerender } = renderHook(({ tenant }) => useSalesInvoices(tenant),{ initialProps:{ tenant:'a' } });
  rerender({ tenant:'b' });
  expect(result.current.invoices).toEqual([]);
  await waitFor(() => expect(result.current.invoices[0]?.id).toBe('invoice-b'));
  rerender({ tenant:'a' });
  await waitFor(() => expect(result.current.invoices[0]?.id).toBe('current-a'));
  await act(async () => { resolveOld([{ id:'stale-a' }]); });
  expect(result.current.invoices[0].id).toBe('current-a');
  mocks.read.mockResolvedValue([]);
  await act(async () => { await result.current.refresh(); });
  expect(result.current.invoices).toEqual([]);
  rerender({ tenant:null });
  expect(result.current.invoices).toEqual([]);
});

it('does not let stale billing sources reopen or repopulate a different tenant form',async () => {
  let resolveOld;
  const data = id => ({ orders:[{ id }],projects:[],invoices:[] });
  mocks.sources.mockReset().mockImplementationOnce(() => new Promise(resolve => { resolveOld=resolve; }))
    .mockResolvedValue(data('order-b'));
  const { result,rerender } = renderHook(({ tenant }) => useBillingSources(tenant),{ initialProps:{ tenant:'a' } });
  rerender({ tenant:'b' });
  await waitFor(() => expect(result.current.orders[0]?.id).toBe('order-b'));
  await act(async () => { resolveOld(data('stale-a')); });
  expect(result.current.orders[0].id).toBe('order-b');
  mocks.sources.mockRejectedValue({ message:'server read failed' });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.orders).toEqual([]);
  expect(result.current.error.message).toBe('server read failed');
});
