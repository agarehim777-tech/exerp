import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requests: [], rows: {}, error: null }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: table => {
  const request = { table, filters: [], orders: [], range: null };
  const chain = {
    select: (_, options) => { request.options = options; return chain; },
    eq: (key,value) => { request.filters.push([key,value]); return chain; },
    order: key => { request.orders.push(key); return chain; },
    range: (from,to) => { request.range = [from,to]; return chain; },
    then: resolve => {
      mocks.requests.push(request);
      const rows = mocks.rows[table] || [];
      // Emulate an API capped at 100 despite a request for 500.
      return Promise.resolve({ data: rows.slice(request.range[0], request.range[0]+100), count: rows.length, error: mocks.error }).then(resolve);
    },
  };
  return chain;
} } }));
import { readInventoryBase } from '../services/inventoryRead.js';
beforeEach(() => { mocks.requests = []; mocks.rows = {}; mocks.error = null; });
it('reads past the API cap without dropping warehouses or composite stock balances', async () => {
  mocks.rows.warehouses = Array.from({length:225},(_,i)=>({id:`w-${i}`}));
  mocks.rows.stock_balances = Array.from({length:215},(_,i)=>({warehouse_id:'w',product_id:`p-${i}`}));
  const result = await readInventoryBase('tenant','*');
  expect(result.warehouses).toHaveLength(225);
  expect(result.balances).toHaveLength(215);
  for (const table of ['warehouses','stock_balances']) {
    const requests = mocks.requests.filter(row=>row.table===table);
    expect(requests.map(row=>row.range[0])).toEqual([0,100,200]);
    expect(requests.every(row=>row.filters.some(([key,value])=>key==='tenant_id' && value==='tenant'))).toBe(true);
    expect(requests.every(row=>row.options.count==='exact')).toBe(true);
    expect(requests[0].orders).toEqual(table==='warehouses' ? ['name','id'] : ['warehouse_id','product_id']);
  }
});
it('never returns partial data after a failure or an obsolete tenant request', async () => {
  mocks.error = new Error('Query failed');
  await expect(readInventoryBase('tenant','*')).rejects.toThrow('Query failed');
  mocks.error = null;
  expect(await readInventoryBase('tenant','*',()=>false)).toBeNull();
  await expect(readInventoryBase(null,'*')).rejects.toThrow('tenant');
});
