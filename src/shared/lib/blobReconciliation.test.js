import { describe, it, expect } from 'vitest';
import {
  flattenBlobSerials,
  mapBlobSerialStatus,
  reconcileSerials,
  reconcileReservations,
  reconcileProduction,
  reconcileNotificationRules,
  buildReconciliationReport,
  reconciliationToCsv,
} from './blobReconciliation.js';

const warehouseStock = {
  'wh-1': [
    {
      product: 'iPhone 15',
      total: 3,
      reserved: 1,
      serials: [
        { imei: 'AAA111', status: 'Rezervdə' },
        { imei: 'BBB222', status: 'Anbarda' },
      ],
    },
  ],
};

describe('blobReconciliation', () => {
  it('flattens serials with warehouse context', () => {
    const rows = flattenBlobSerials(warehouseStock);
    expect(rows).toHaveLength(2);
    expect(rows[0].warehouseId).toBe('wh-1');
  });

  it('maps blob statuses to db statuses', () => {
    expect(mapBlobSerialStatus('Rezervdə')).toBe('reserved');
    expect(mapBlobSerialStatus('Satılıb')).toBe('sold');
    expect(mapBlobSerialStatus('Anbarda')).toBe('available');
  });

  it('detects missing and mismatched serials', () => {
    const res = reconcileSerials({
      warehouseStock,
      units: [{ imei: 'AAA111', status: 'available' }, { imei: 'CCC333', status: 'available' }],
    });
    const kinds = res.issues.map((i) => i.kind).sort();
    expect(kinds).toEqual(['missing_in_blob', 'missing_in_db', 'status_mismatch']);
    expect(res.blobCount).toBe(2);
    expect(res.dbCount).toBe(2);
  });

  it('compares reserved quantities', () => {
    const res = reconcileReservations({
      stockReservations: [
        { product_id: 'p1', quantity: 1, status: 'active', order: { order_no: 'SF-1001' } },
        { product_id: 'p1', quantity: 4, status: 'fulfilled' },
      ],
      stockBalances: [{ product_id: 'p1', reserved: 1 }],
      productNameById: { p1: 'iPhone 15' },
    });
    expect(res.mismatchCount).toBe(0);
    expect(res.totalActiveReserved).toBe(1);
    expect(res.totalBalanceReserved).toBe(1);
    expect(res.rows[0].orderNos).toEqual(['SF-1001']);
  });

  it('flags reserved differences', () => {
    const res = reconcileReservations({
      stockReservations: [{ product_id: 'p1', quantity: 1, status: 'active' }],
      stockBalances: [{ product_id: 'p1', reserved: 0 }],
      productNameById: { p1: 'iPhone 15' },
    });
    expect(res.mismatchCount).toBe(1);
    expect(res.rows[0].diff).toBe(-1);
  });

  it('does not treat legacy blob or inventory units as reservation truth', () => {
    const res = reconcileReservations({
      warehouseStock,
      units: [{ product_id: 'p1', quantity: 3, status: 'reserved' }],
      stockReservations: [],
      stockBalances: [],
      productNameById: { p1: 'iPhone 15' },
    });
    expect(res.mismatchCount).toBe(0);
    expect(res.rows).toEqual([]);
  });

  it('reconciles production plans', () => {
    const res = reconcileProduction({
      productionPlans: [{ id: 'PP-1', name: 'Plan 1', status: 'Aktiv' }],
      workflowRecords: [{ module: 'production', record_no: 'PP-1', status: 'draft', title: 'Plan 1' }],
    });
    expect(res.issues[0].kind).toBe('status_mismatch');
  });

  it('flags active notification rules without deliveries', () => {
    const res = reconcileNotificationRules({
      notificationRules: [{ id: 'RULE-A', name: 'A', status: 'Aktiv' }],
      deliveries: [],
      sendLog: [{ ruleId: 'RULE-A' }],
    });
    expect(res.rows[0].severity).toBe('error');
    expect(res.unmigratedCount).toBe(1);
  });

  it('builds a full report and csv', () => {
    const report = buildReconciliationReport({
      warehouseStock,
      units: [],
      productionPlans: [],
      workflowRecords: [],
      notificationRules: [],
      deliveries: [],
    });
    expect(report.summary.healthy).toBe(false);
    expect(reconciliationToCsv(report)).toContain('serial');
  });
});
