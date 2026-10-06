import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ calls:[], fail:false }));
vi.mock('../integrations/supabase/client',() => ({ supabase:{ from: table => {
  const call = { table, filters:[],order:[] };
  const query = { select: (_columns,options) => { call.count=options?.count; return query; },
    eq:(...args) => { call.filters.push(args); return query; },neq:(...args) => { call.filters.push(args); return query; },
    order:column => { call.order.push(column); return query; },range:(start,end) => {
      mocks.calls.push({ ...call,start,end });
      if (mocks.fail && start>0) return Promise.resolve({ error:{ message:'read failed' } });
      const total = table==='projects' ? 0 : 225;
      return Promise.resolve({ data:Array.from({ length:Math.max(0,Math.min(100,end-start+1,total-start)) },(_,i) => ({ id:`${table}-${start+i}` })),count:total });
    } };
  return query;
} } }));
import { readBillingSources, readSalesInvoicePage } from '../services/billingRead.js';
beforeEach(() => { mocks.calls=[]; mocks.fail=false; });

it('reads all source pages under a lower server cap with stable ordering and tenant filters',async () => {
  const result = await readBillingSources('tenant-a',() => true);
  expect(result.orders).toHaveLength(225);
  expect(result.invoices).toHaveLength(225);
  expect(result.projects).toEqual([]);
  for (const call of mocks.calls) {
    expect(call.filters).toContainEqual(['tenant_id','tenant-a']);
    expect(call.order).toContain('id');
    expect(call.count).toBe('exact');
  }
  expect(mocks.calls.filter(row => row.table==='orders').map(row => row.start)).toEqual([0,100,200]);
});

it('respects load-more limits and never exposes partial data after error or tenant invalidation',async () => {
  expect(await readSalesInvoicePage('tenant-a',201,() => true)).toHaveLength(201);
  mocks.fail=true;
  await expect(readSalesInvoicePage('tenant-a',201,() => true)).rejects.toMatchObject({ message:'read failed' });
  mocks.fail=false;
  let current=true;
  const pending = readSalesInvoicePage('tenant-a',201,() => current);
  current=false;
  expect(await pending).toBeNull();
});
