import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import CreditsPage, { StartCreditModal } from '../pages/CreditsPage.jsx';

vi.mock('../modules/credits/CreditInitialPayments.jsx', () => ({ CreditInitialPaymentsHistory: () => null }));
afterEach(cleanup);
const item = paid => ({ credit: { id: 'credit-1', total: 10000, months: 12,
  requiredInitial: 2000, initialPayment: 2000, initialPaid: paid }, plan: { months: 12 } });

it('exposes credit read failures and retries instead of presenting a successful empty portfolio', () => {
  const refresh = vi.fn();
  const view = render(<CreditsPage credits={[]} error={new Error('Credit query rejected')} onRefresh={refresh} />);
  expect(view.getByRole('alert')).toHaveTextContent('Credit query rejected');
  fireEvent.click(view.getByRole('button', { name: 'Yenidən yüklə' }));
  expect(refresh).toHaveBeenCalledOnce();
  view.rerender(<CreditsPage credits={[]} loading onRefresh={refresh} />);
  expect(view.queryByRole('alert')).toBeNull();
  expect(view.getByRole('status')).toHaveTextContent('Kredit məlumatları yüklənir...');
});

it('allows browser order fallback only under the explicit legacy-write flag', () => {
  const app = readFileSync('src/App.jsx', 'utf8');
  expect(app).toContain('!ENABLE_LEGACY_WRITES || dbOrdersLoaded ? dbOrders.map(dbOrderToLegacy) : state.orders');
  expect(app).toContain('error={dbOrdersError}');
  expect(app).toContain('onRefresh={refreshDbOrders}');
});

it('submits activation once and closes only after the server command succeeds', async () => {
  let finish;
  const start = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const close = vi.fn();
  const view = render(<StartCreditModal item={item(2000)} onStartCredit={start} onClose={close} />);
  const form = view.container.querySelector('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(start).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'Başladılır...' })).toBeDisabled();
  expect(view.getByLabelText('Kreditin başlanma tarixi')).toBeDisabled();
  await act(async () => finish(true));
  expect(close).toHaveBeenCalledOnce();
});

it('requires even the last cent before activation, matching the server deposit guard', () => {
  const start = vi.fn();
  const view = render(<StartCreditModal item={item(1999.99)} onStartCredit={start} onClose={vi.fn()} />);
  expect(view.getByLabelText('Qəbul ediləcək məbləğ')).toHaveValue(0.01);
  expect(view.getByRole('button', { name: 'Krediti başlat' })).toBeDisabled();
  fireEvent.submit(view.container.querySelector('form'));
  expect(start).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'Behi kassaya qəbul et' })).not.toBeDisabled();
});

it('accepts decimal deposits once and keeps activation blocked until refreshed server totals arrive', async () => {
  let finish;
  const collect = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const start = vi.fn();
  const props = { onPayInitial: collect, onStartCredit: start, onClose: vi.fn() };
  const view = render(<StartCreditModal item={item(200)} {...props} />);
  const amount = view.getByLabelText('Qəbul ediləcək məbləğ');
  expect(amount).toHaveValue(1800);
  fireEvent.change(amount, { target: { value: '100.55' } });
  fireEvent.click(view.getByRole('button', { name: 'Behi kassaya qəbul et' }));
  fireEvent.submit(view.container.querySelector('form'));
  expect(collect).toHaveBeenCalledOnce();
  expect(collect).toHaveBeenCalledWith('credit-1', 100.55);
  expect(start).not.toHaveBeenCalled();
  await act(async () => finish(true));
  expect(view.getByRole('button', { name: 'Krediti başlat' })).toBeDisabled();
  view.rerender(<StartCreditModal item={item(2000)} {...props} />);
  expect(view.getByRole('button', { name: 'Krediti başlat' })).not.toBeDisabled();
  expect(view.queryByLabelText('Qəbul ediləcək məbləğ')).toBeNull();
});

it('retains the selected date and displays a failed activation instead of closing the dialog', async () => {
  const start = vi.fn().mockRejectedValueOnce(new Error('Activation rejected')).mockResolvedValueOnce(false);
  const close = vi.fn();
  const view = render(<StartCreditModal item={item(2000)} onStartCredit={start} onClose={close} />);
  fireEvent.change(view.getByLabelText('Kreditin başlanma tarixi'), { target: { value: '2026-10-08' } });
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent('Activation rejected'));
  expect(view.getByLabelText('Kreditin başlanma tarixi')).toHaveValue('2026-10-08');
  expect(close).not.toHaveBeenCalled();
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent('Əməliyyat tamamlanmadı.'));
  expect(close).not.toHaveBeenCalled();
});
