import { describe, expect, it } from 'vitest';
import { buildOperationalHealth } from '../shared/lib/operationalHealth.js';

const order = { id: 'sale', order_no: 'SF-1', status: 'cancelled' };
const receipt = { id: 'receipt', category: 'sales_payment', reference_type: 'sales_order', reference_id: 'sale' };

describe('operational health cash reversal links', () => {
  it('recognizes a compensating ledger entry without reversed_at', () => {
    const report = buildOperationalHealth({ orders: [order], cashTransactions: [
      receipt, { id: 'reversal', category: 'transaction_reversal', reversal_of: receipt.id },
    ] });
    expect(report.summary.healthy).toBe(true);
  });

  it('still reports an unreversed receipt on a cancelled sale', () => {
    const report = buildOperationalHealth({ orders: [order], cashTransactions: [receipt] });
    expect(report.issues.map(issue => issue.id)).toEqual(['cash-orphan-receipt']);
  });

  it('does not use an unrelated reversal to suppress an orphan receipt', () => {
    const report = buildOperationalHealth({ cashTransactions: [
      receipt, { id: 'reversal', category: 'transaction_reversal', reversal_of: 'another-receipt' },
    ] });
    expect(report.summary.critical).toBe(1);
    expect(report.issues[0].id).toBe('cash-orphan-receipt');
  });
});
