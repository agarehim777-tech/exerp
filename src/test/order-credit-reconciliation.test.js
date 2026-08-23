import { describe, expect, it } from 'vitest';
import { buildMissingCreditDraft } from '../shared/hooks/useOrders';

describe('missing sales credit reconciliation', () => {
  const partialOrder = {
    id: 'order-1005',
    order_no: 'SF-1005',
    customer_id: 'customer-1',
    order_date: '2026-08-22',
    total: 20000,
    paid_amount: 1000,
    status: 'confirmed',
    credit: null,
  };

  it('builds a credit contract draft for a partially paid orphan sale', () => {
    expect(buildMissingCreditDraft(partialOrder)).toEqual({
      orderId: 'order-1005',
      contractNo: 'İN-1005',
      customerId: 'customer-1',
      principal: 20000,
      initialPayment: 1000,
      requiredInitial: 1000,
      termMonths: 12,
      orderDate: '2026-08-22',
    });
  });

  it.each([
    ['fully paid', { ...partialOrder, paid_amount: 20000 }],
    ['already linked', { ...partialOrder, credit: { id: 'credit-1' } }],
    ['cancelled', { ...partialOrder, status: 'cancelled' }],
    ['no initial payment', { ...partialOrder, paid_amount: 0 }],
    ['no customer', { ...partialOrder, customer_id: null }],
  ])('does not create a draft when the sale is %s', (_label, order) => {
    expect(buildMissingCreditDraft(order)).toBeNull();
  });
});
