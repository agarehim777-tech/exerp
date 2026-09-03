import { describe, expect, it } from 'vitest';
import { buildOperationalHealth } from './operationalHealth.js';

describe('buildOperationalHealth', () => {
  it('detects orphan lifecycle records and reserved mismatches', () => {
    const report = buildOperationalHealth({
      orders: [{ id: 'o1', order_no: 'SF-1', status: 'cancelled' }],
      credits: [{ id: 'c1', order_id: 'o1', contract_no: 'IN-1', status: 'active' }],
      cashTransactions: [{ id: 'p1', reference_type: 'sales_order', reference_id: 'missing' }],
      reservations: [{ id: 'r1', order_id: 'missing', warehouse_id: 'w', product_id: 'p', quantity: 2, status: 'active' }],
      balances: [{ warehouse_id: 'w', product_id: 'p', reserved: 1 }],
    });
    expect(report.summary).toEqual({ total: 4, critical: 3, warnings: 1, healthy: false });
  });

  it('flags active invoices, deliveries and missing accounting reversal for cancelled sales', () => {
    const report = buildOperationalHealth({
      orders: [{ id: 'o1', order_no: 'SF-1', status: 'cancelled' }],
      invoices: [{ id: 'i1', invoice_no: 'INV-1', order_id: 'o1', status: 'issued' }],
      deliveries: [{ id: 'd1', delivery_no: 'DLV-1', order_id: 'o1', status: 'ready' }],
      accountingEvents: [{ id: 'a1', order_id: 'o1', event_type: 'delivery' }],
    });
    expect(report.issues.map((issue) => issue.domain)).toEqual(expect.arrayContaining(['Faktura', 'Çatdırılma', 'Mühasibat']));
  });

  it('reports a healthy lifecycle', () => {
    const report = buildOperationalHealth({
      orders: [{ id: 'o1', status: 'confirmed' }],
      credits: [{ id: 'c1', order_id: 'o1', status: 'active' }],
      reservations: [{ id: 'r1', order_id: 'o1', warehouse_id: 'w', product_id: 'p', quantity: 2, status: 'active' }],
      balances: [{ warehouse_id: 'w', product_id: 'p', reserved: 2 }],
    });
    expect(report.summary.healthy).toBe(true);
  });
});

