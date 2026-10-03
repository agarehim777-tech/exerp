import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CreditPaymentForm } from '../shared/lib/appDomain.jsx';

const props = { credit: { id: 'credit-42' }, paymentState: { nextInstallment: { amount: 83.33 } } };

it('blocks simultaneous submissions and reuses the receipt after an uncertain failure', async () => {
  let finish;
  const save = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(true);
  const { container, getByRole, getByLabelText } = render(<CreditPaymentForm {...props} onReceivePayment={save} />);
  const form = container.querySelector('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(save).toHaveBeenCalledTimes(1);
  expect(getByRole('button')).toBeDisabled();
  await act(async () => finish(false));
  expect(getByLabelText('Əsas məbləğ')).toHaveValue(83.33);
  fireEvent.submit(form);
  await waitFor(() => expect(getByLabelText('Əsas məbləğ')).toHaveValue(null));
  expect(save.mock.calls[1][1].receiptNo).toBe(save.mock.calls[0][1].receiptNo);
  expect(save.mock.calls[0][1].principalAmount).toBe(83.33);
});

it('preserves a failed payment and gives a changed payload a new receipt', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(true);
  const { container, getByRole, getByLabelText } = render(<CreditPaymentForm {...props} onReceivePayment={save} />);
  fireEvent.submit(container.querySelector('form'));
  await waitFor(() => expect(getByRole('alert')).toHaveTextContent('Network unavailable'));
  expect(getByLabelText('Əsas məbləğ')).toHaveValue(83.33);
  fireEvent.change(getByLabelText('Əsas məbləğ'), { target: { value: '133.33' } });
  fireEvent.submit(container.querySelector('form'));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][1].receiptNo).not.toBe(save.mock.calls[0][1].receiptNo);
  expect(save.mock.calls[1][1].principalAmount).toBe(133.33);
});
