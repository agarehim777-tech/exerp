import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StartCreditModal as PageStartCreditModal } from '../pages/CreditsPage.jsx';
import { QuickCollectModal, StartCreditModal } from '../modules/credits/components/CreditActionModals.jsx';

const item = {
  credit: { id: 'CR-1', customer: 'Aysel', status: 'Aktiv', startedAt: '2026-10-01' },
  plan: { total: 600, balance: 250, monthly: 100.4, months: 6, installments: [] },
  paymentState: { nextInstallment: { amount: 100.4, due: '2026-12-01' } },
};

it('keeps StartCreditModal importable from CreditsPage', () => {
  expect(PageStartCreditModal).toBe(StartCreditModal);
});

it('collects a rounded installment with one receipt per opening and closes', () => {
  const receive = vi.fn();
  const close = vi.fn();
  const { container } = render(<QuickCollectModal item={item} onReceivePayment={receive} onClose={close} />);
  const [principal, penalty] = container.querySelectorAll('input[type="number"]');
  expect(principal).toHaveValue(100);
  fireEvent.change(penalty, { target: { value: '4.6' } });
  fireEvent.submit(container.querySelector('form'));
  expect(receive).toHaveBeenCalledWith('CR-1', { principalAmount: 100, penaltyAmount: 5, receiptNo: expect.stringMatching(/^KRD/) });
  expect(close).toHaveBeenCalledOnce();
});

it('does nothing when both amounts are zero', () => {
  const receive = vi.fn();
  const close = vi.fn();
  const { container } = render(<QuickCollectModal item={item} onReceivePayment={receive} onClose={close} />);
  const [principal] = container.querySelectorAll('input[type="number"]');
  fireEvent.change(principal, { target: { value: '0' } });
  fireEvent.submit(container.querySelector('form'));
  expect(receive).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByText(/Aysel/)).toBeInTheDocument();
});
