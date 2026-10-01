import { expect, test } from '@playwright/test';
import { authenticatedApi, hasLifecycleEnvironment, runId } from './supabase-lifecycle';

test.describe.configure({ mode: 'serial' });
test.skip(!hasLifecycleEnvironment, 'Authenticated Supabase lifecycle environment is required');

for (const method of ['weighted_average', 'fifo']) {
  for (const path of ['status', 'mark', 'complete']) {
    test(`@lifecycle ${method}/${path}: delivery and cancellation update every linked module once`, async ({ request }) => {
      const { call, tenantId } = await authenticatedApi(request);
      const marker = runId('E2E-HANDOVER');
      const insert = async (table: string, data: object) => (await call('post', `${table}?select=*`,
        { tenant_id: tenantId, ...data }, { Prefer: 'return=representation' }))[0];
      const rows = (table: string, filter: string) => call('get', `${table}?tenant_id=eq.${tenantId}&${filter}`);
      const rpc = (name: string, data: object) => call('post', `rpc/${name}`, data);
      const previous = await rows('inventory_accounting_settings', 'select=valuation_method');
      let orderId = ''; let accountId = ''; let productId = ''; let warehouseId = ''; let otherWarehouseId = '';
      try {
        await call('post', 'inventory_accounting_settings?on_conflict=tenant_id',
          { tenant_id: tenantId, valuation_method: method }, { Prefer: 'resolution=merge-duplicates' });
        const customer = await insert('customers', { name: marker });
        const product = await insert('products', { sku: marker, name: marker }); productId = product.id;
        const warehouse = await insert('warehouses', { code: marker, name: marker }); warehouseId = warehouse.id;
        const account = await insert('cash_accounts', { code: marker, account_no: marker, name: marker, opening_balance: 0 }); accountId = account.id;
        const receive = (id: string, cost: number) => rpc('receive_stock', {
          _tenant_id: tenantId, _warehouse_id: id, _product_id: product.id, _quantity: 10,
          _unit_cost: cost, _reference_type: 'e2e_receipt', _reference_id: null, _note: marker,
        });
        if (path === 'complete') {
          const other = await insert('warehouses', { code: `${marker}-OTHER`, name: `${marker}-OTHER` }); otherWarehouseId = other.id;
          await receive(other.id, 99);
        }
        await receive(warehouse.id, 25);
        const command = {
          _tenant_id: tenantId, _request_key: `${marker}:create`, _order_no: marker, _customer_id: customer.id,
          _order_date: new Date().toISOString().slice(0, 10), _currency: 'AZN', _notes: marker,
          _items: [{ product_id: product.id, line_no: 1, description: marker, qty: 2, unit_price: 1000, discount_pct: 0, vat_rate: 0 }],
          _credit: { contract_no: marker, principal: 2000, initial_payment: 200, required_initial: 1000, term_months: 12 },
          _bonus_allocations: [], _initial_payment: 200, _account_id: account.id,
        };
        const sale = await rpc('create_sales_order_complete', command); orderId = sale.order_id;
        expect(await rpc('create_sales_order_complete', command)).toEqual(sale);
        const reservation = await rpc('reserve_stock', { _tenant_id: tenantId, _warehouse_id: warehouse.id,
          _product_id: product.id, _order_id: orderId, _order_item_id: null, _quantity: 2 });
        await expect(call('patch', `orders?id=eq.${orderId}&tenant_id=eq.${tenantId}`, { status: 'cancelled' }))
          .rejects.toThrow('sales_cancellation_requires_reversal_command');
        const unrelated = await insert('cash_transactions', { account_id: account.id, direction: 'in', amount: 17,
          category: 'sales_payment', reference_id: crypto.randomUUID(), reference: `${marker}-OTHER`, description: `Unrelated ${marker}` });
        let deliver: () => Promise<unknown>;
        let deliveryId = '';
        if (path === 'complete') {
          const delivery = await insert('deliveries', { delivery_no: marker, order_id: orderId, warehouse_id: warehouse.id, status: 'ready' }); deliveryId = delivery.id;
          await insert('delivery_items', { delivery_id: delivery.id, product_id: product.id, reservation_id: reservation, quantity: 2 });
          deliver = () => rpc('complete_delivery', { _tenant_id: tenantId, _delivery_id: delivery.id, _recipient_name: 'CI recipient', _recipient_document: marker });
        } else if (path === 'mark') {
          deliver = () => rpc('mark_sales_order_delivered', { _order_id: orderId });
        } else {
          deliver = () => rpc('process_sales_order_status', { _order_id: orderId, _status: 'delivered' });
        }
        await deliver(); await deliver();
        const balance = async () => (await rows('stock_balances', `warehouse_id=eq.${warehouse.id}&product_id=eq.${product.id}&select=on_hand,reserved`))[0];
        expect(Number((await balance()).on_hand)).toBe(8);
        expect(Number((await balance()).reserved)).toBe(0);
        if (otherWarehouseId) expect(Number((await rows('stock_balances', `warehouse_id=eq.${otherWarehouseId}&product_id=eq.${product.id}&select=on_hand`))[0].on_hand)).toBe(10);
        const events = await rows('order_accounting_events', `order_id=eq.${orderId}&event_type=eq.delivery&select=journal_entry_id,cogs`);
        expect(events).toHaveLength(1); expect(Number(events[0].cogs)).toBe(50);
        const invoice = await insert('sales_invoices', { invoice_no: marker, order_id: orderId, customer_id: customer.id,
          status: 'issued', posted: true, journal_entry_id: events[0].journal_entry_id, total: 2000, subtotal: 2000, vat_total: 0 });
        const cancel = { _tenant_id: tenantId, _order_id: orderId, _reason: marker, _request_key: `${marker}:reverse` };
        const reversed = await rpc('reverse_sales_order_v3', cancel);
        expect(await rpc('reverse_sales_order_v3', cancel)).toEqual(reversed);
        expect(Number((await balance()).on_hand)).toBe(10);
        if (method === 'fifo') expect(Number((await rows('inventory_cost_layers', `warehouse_id=eq.${warehouse.id}&product_id=eq.${product.id}&select=remaining_qty`))[0].remaining_qty)).toBe(10);
        expect((await rows('credit_contracts', `id=eq.${sale.credit_id}&select=status`))[0].status).toBe('cancelled');
        expect(await rows('stock_reservations', `order_id=eq.${orderId}&status=eq.active&select=id`)).toEqual([]);
        if (deliveryId) expect((await rows('deliveries', `id=eq.${deliveryId}&select=status`))[0].status).toBe('cancelled');
        expect((await rows('sales_invoices', `id=eq.${invoice.id}&select=status`))[0].status).toBe('cancelled');
        expect(await rows('cash_transactions', `reversal_of=eq.${unrelated.id}&select=id`)).toEqual([]);
        const cash = await rows('cash_transactions', `account_id=eq.${account.id}&select=amount,direction`);
        expect(cash.reduce((total: number, tx: { amount: number; direction: string }) => total + Number(tx.amount) * (tx.direction === 'in' ? 1 : -1), 0)).toBe(17);
        const posted = await rows('order_accounting_events', `order_id=eq.${orderId}&select=event_type,journal_entry_id`);
        expect(posted).toHaveLength(2);
        for (const event of posted) {
          const lines = await call('get', `journal_lines?entry_id=eq.${event.journal_entry_id}&select=debit,credit`);
          expect(lines.reduce((sum: number, line: { debit: number; credit: number }) => sum + Number(line.debit) - Number(line.credit), 0)).toBe(0);
        }
        await expect(deliver()).rejects.toThrow(/cancelled_order_is_terminal|delivery_order_cancelled/);
        await expect(call('patch', `credit_contracts?tenant_id=eq.${tenantId}&id=eq.${sale.credit_id}`, { status: 'active' })).rejects.toThrow('cancelled_order_is_terminal');
        await expect(insert('cash_transactions', { account_id: account.id, direction: 'in', amount: 1,
          category: 'sales_payment', reference_id: orderId, reference: marker })).rejects.toThrow('cancelled_order_is_terminal');
      } finally {
        if (orderId) await rpc('reverse_sales_order_v3', { _tenant_id: tenantId, _order_id: orderId, _reason: marker, _request_key: `${marker}:cleanup` });
        for (const [table, id] of [['cash_accounts', accountId], ['products', productId], ['warehouses', warehouseId], ['warehouses', otherWarehouseId]]) {
          if (id) await call('patch', `${table}?tenant_id=eq.${tenantId}&id=eq.${id}`, { is_active: false });
        }
        await call('patch', `inventory_accounting_settings?tenant_id=eq.${tenantId}`, { valuation_method: previous[0]?.valuation_method ?? 'weighted_average' });
      }
    });
  }
}
