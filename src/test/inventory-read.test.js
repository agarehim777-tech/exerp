import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requests: [], rows: {}, error: null, afterRead: null }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: table => {
  const request = { table, filters: [], orders: [], range: null };
  const chain = {
    select: (_, options) => { request.options = options; return chain; },
    eq: (key,value) => { request.filters.push([key,value]); return chain; },
    order: key => { request.orders.push(key); return chain; },
    gt: (key,value) => { request.cursor = [key,value]; return chain; },
    or: value => { request.after = value; return chain; },
    range: (from,to) => { request.range = [from,to]; return chain; },
    then: resolve => {
      mocks.requests.push(request);
      let rows = [...(mocks.rows[table] || [])].sort((a,b) => {
        for (const key of request.orders) {
          if (a[key] < b[key]) return -1;
          if (a[key] > b[key]) return 1;
        }
        return 0;
      });
      if (request.cursor) rows = rows.filter(row => row[request.cursor[0]] > request.cursor[1]);
      if (request.after) {
        const [, warehouse, product] = request.after.match(/warehouse_id\.gt\.([^,]+),and\(warehouse_id\.eq\.[^,]+,product_id\.gt\.([^)]+)\)/);
        rows = rows.filter(row => row.warehouse_id > warehouse || (row.warehouse_id === warehouse && row.product_id > product));
      }
      // Emulate an API capped at 100 despite a request for 500.
      const result = { data: rows.slice(request.range[0], request.range[0]+100), count: rows.length, error: mocks.error };
      mocks.afterRead?.(request);
      return Promise.resolve(result).then(resolve);
    },
  };
  return chain;
} } }));
import { readInventoryBase } from '../services/inventoryRead.js';
beforeEach(() => { mocks.requests = []; mocks.rows = {}; mocks.error = null; mocks.afterRead = null; });
it('reads past the API cap without dropping warehouses or composite stock balances', async () => {
  mocks.rows.warehouses = Array.from({length:225},(_,i)=>({id:`w-${i}`}));
  mocks.rows.stock_balances = Array.from({length:215},(_,i)=>({warehouse_id:'w',product_id:`p-${i}`}));
  const result = await readInventoryBase('tenant','*');
  expect(result.warehouses).toHaveLength(225);
  expect(result.balances).toHaveLength(215);
  for (const table of ['warehouses','stock_balances']) {
    const requests = mocks.requests.filter(row=>row.table===table);
    expect(requests.map(row=>row.range[0])).toEqual([0,0,0]);
    expect(requests.slice(1).every(row => row.cursor || row.after)).toBe(true);
    expect(requests.every(row=>row.filters.some(([key,value])=>key==='tenant_id' && value==='tenant'))).toBe(true);
    expect(requests.every(row=>row.options.count==='exact')).toBe(true);
    expect(requests[0].orders).toEqual(table==='warehouses' ? ['id'] : ['warehouse_id','product_id']);
  }
});
it('does not repeat warehouses when an insertion and rename happen between pages', async () => {
  mocks.rows.warehouses = Array.from({length:225},(_,i)=>({id:`w-${String(i).padStart(3,'0')}`, name:`Warehouse ${i}`}));
  mocks.afterRead = request => {
    if (request.table === 'warehouses' && !request.cursor) {
      mocks.rows.warehouses.unshift({id:'w-000-new', name:'AAA'});
      mocks.rows.warehouses[2].name = 'ZZZ renamed';
    }
  };
  const result = await readInventoryBase('tenant','*');
  expect(result.warehouses).toHaveLength(225);
  expect(new Set(result.warehouses.map(row => row.id)).size).toBe(225);
  expect(result.warehouses.some(row => row.id === 'w-224')).toBe(true);
});
it('fails closed if the server repeats an inventory identity', async () => {
  mocks.rows.warehouses = [{id:'w-1'}, {id:'w-1'}];
  await expect(readInventoryBase('tenant','*')).rejects.toThrow('repeated identity');
});
it('never returns partial data after a failure or an obsolete tenant request', async () => {
  mocks.error = new Error('Query failed');
  await expect(readInventoryBase('tenant','*')).rejects.toThrow('Query failed');
  mocks.error = null;
  expect(await readInventoryBase('tenant','*',()=>false)).toBeNull();
  await expect(readInventoryBase(null,'*')).rejects.toThrow('tenant');
});
