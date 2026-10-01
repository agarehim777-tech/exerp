import { expect, test } from '@playwright/test';
import { authenticatedApi, hasLifecycleEnvironment, runId } from './supabase-lifecycle';

test.skip(!hasLifecycleEnvironment, 'Authenticated lifecycle environment is required');
test.describe.configure({ mode: 'serial' });

test('@lifecycle concurrent sale requests create one order and one payment', async ({ request }) => {
  const { call, tenantId } = await authenticatedApi(request);
  const marker = runId('E2E-CONCURRENT-SALE');
  const customers = await call('get', `customers?tenant_id=eq.${tenantId}&select=id&limit=1`);
  expect(customers[0]?.id).toBeTruthy();
  const payload = {
    _tenant_id: tenantId, _request_key: `${marker}:create`, _order_no: marker,
    _customer_id: customers[0].id, _order_date: new Date().toISOString().slice(0, 10),
    _currency: 'AZN', _notes: 'CI parallel idempotency test',
    _items: [{ line_no: 1, description: marker, qty: 1, unit_price: 100, discount_pct: 0, vat_rate: 0 }],
    _credit: null, _bonus_allocations: [], _initial_payment: 25, _account_id: null,
  };
  try {
    const results = await Promise.allSettled([
      call('post', 'rpc/create_sales_order_complete', payload),
      call('post', 'rpc/create_sales_order_complete', payload),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    if (results[0].status !== 'fulfilled' || results[1].status !== 'fulfilled') throw new Error('Concurrent create failed');
    expect(results[0].value.order_id).toBe(results[1].value.order_id);
    const orders = await call('get', `orders?tenant_id=eq.${tenantId}&order_no=eq.${marker}&select=id,paid_amount`);
    expect(orders).toHaveLength(1);
    expect(Number(orders[0].paid_amount)).toBe(25);
    const payments = await call('get', `cash_transactions?tenant_id=eq.${tenantId}&reference=eq.${marker}&direction=eq.in&select=id,amount`);
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(25);
  } finally {
    const orders = await call('get', `orders?tenant_id=eq.${tenantId}&order_no=eq.${marker}&select=id`);
    for (const order of orders) await call('post', 'rpc/reverse_sales_order_v3', {
      _tenant_id: tenantId, _order_id: order.id, _reason: 'CI parallel test cleanup', _request_key: `${marker}:reverse:${order.id}`,
    });
  }
});

test('@lifecycle concurrent reservations cannot oversell the same balance', async ({ request }) => {
  const { call, tenantId } = await authenticatedApi(request);
  const marker = runId('E2E-CONCURRENT-STOCK');
  const orders: string[] = [];
  let productId = '';
  let warehouseId = '';
  try {
    const products = await call('post', 'products', { tenant_id: tenantId, sku: marker, name: marker }, { Prefer: 'return=representation' });
    productId = products[0].id;
    const warehouses = await call('post', 'warehouses', { tenant_id: tenantId, code: marker, name: marker }, { Prefer: 'return=representation' });
    warehouseId = warehouses[0].id;
    await call('post', 'rpc/receive_stock', { _tenant_id: tenantId, _warehouse_id: warehouseId,
      _product_id: productId, _quantity: 10, _unit_cost: 25 });
    const customers = await call('get', `customers?tenant_id=eq.${tenantId}&select=id&limit=1`);
    for (let index = 0; index < 2; index++) {
      const order = await call('post', 'rpc/create_sales_order_complete', {
        _tenant_id: tenantId, _request_key: `${marker}:${index}`, _order_no: `${marker}-${index}`,
        _customer_id: customers[0].id, _order_date: new Date().toISOString().slice(0, 10), _currency: 'AZN',
        _notes: 'CI reservation race', _items: [{ line_no: 1, description: marker, qty: 6, unit_price: 50, discount_pct: 0, vat_rate: 0 }],
        _credit: null, _bonus_allocations: [], _initial_payment: 0, _account_id: null,
      });
      orders.push(order.order_id);
    }
    const results = await Promise.allSettled(orders.map((orderId) => call('post', 'rpc/reserve_stock', {
      _tenant_id: tenantId, _warehouse_id: warehouseId, _product_id: productId,
      _order_id: orderId, _order_item_id: null, _quantity: 6,
    })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && String(failure.reason)).toContain('insufficient_available_stock');
    const balances = await call('get', `stock_balances?tenant_id=eq.${tenantId}&warehouse_id=eq.${warehouseId}&product_id=eq.${productId}&select=on_hand,reserved`);
    expect(Number(balances[0].on_hand)).toBe(10);
    expect(Number(balances[0].reserved)).toBe(6);
  } finally {
    if (productId && warehouseId) {
      const reservations = await call('get', `stock_reservations?tenant_id=eq.${tenantId}&warehouse_id=eq.${warehouseId}&product_id=eq.${productId}&status=eq.active&select=id`);
      for (const reservation of reservations) await call('post', 'rpc/release_stock_reservation', {
        _tenant_id: tenantId, _reservation_id: reservation.id,
      });
    }
    for (const orderId of orders) await call('post', 'rpc/reverse_sales_order_v3', {
      _tenant_id: tenantId, _order_id: orderId, _reason: 'CI reservation race cleanup', _request_key: `${marker}:reverse:${orderId}`,
    });
  }
});
