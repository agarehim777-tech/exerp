import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CreditsTab } from '../modules/crm/CustomerDrawer.jsx';

it('keeps distinct contract links and reads the persisted installment amounts', () => {
  const onOpenCredit = vi.fn();
  const onOpenSalesOrder = vi.fn();
  render(<CreditsTab onOpenCredit={onOpenCredit} onOpenSalesOrder={onOpenSalesOrder} credits={[{
    id: 'credit-one', order_id: 'order-one', contract_no: 'IN-1', principal: 1200, initial_payment: 200,
    payments: [{ principal_amount: 100 }, { principal_amount: 500, reversed_at: '2026-10-01' }],
    installments: [{ id: 'month-one', installment_no: 1, due_date: '2026-11-01', principal_due: 100, principal_paid: 50 }],
  }, { id: 'credit-two', contract_no: 'IN-2', principal: 700, status: 'draft' }]} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Kreditə bax' })[1]);
  expect(onOpenCredit).toHaveBeenCalledWith('credit-two');
  fireEvent.click(screen.getByRole('button', { name: 'Sifarişə bax' }));
  expect(onOpenSalesOrder).toHaveBeenCalledWith('order-one');
  expect(screen.getByText('900.00 ₼')).toBeInTheDocument();
  expect(screen.getByText('50.00 ₼')).toBeInTheDocument();
  expect(screen.getByText('Kreditin ödəniş cədvəli hələ aktivləşdirilməyib.')).toBeInTheDocument();
});
