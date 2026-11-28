import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const importOpeningBalances = vi.fn();
vi.mock('../services/openingImport.js', () => ({ importOpeningBalances: (...args) => importOpeningBalances(...args) }));
const { OpeningBalanceImport } = await import('../modules/onboarding/OpeningBalanceImport.jsx');

const customersCsv = 'Ad soyad / Şirkət;FİN;Telefon\nƏli Məmmədov;5ABC123;+994501112233\nBakı MMC;;\n';
const chooseFile = (view, label, text) => fireEvent.change(view.getByLabelText(label), {
  target: { files: [{ name: 'list.csv', text: async () => text }] },
});

beforeEach(() => importOpeningBalances.mockReset());

it('previews a customer file, imports it once and reports created and skipped rows', async () => {
  importOpeningBalances.mockResolvedValue({ row_count: 2, created: 1, skipped: 1 });
  const onImported = vi.fn();
  const notify = vi.fn();
  const view = render(<OpeningBalanceImport tenantId="t-1" notify={notify} onImported={onImported} />);
  chooseFile(view, 'Müştərilər CSV faylı', customersCsv);
  await waitFor(() => expect(view.getByRole('button', { name: 'İdxal et (2 sətir)' })).toBeEnabled());
  expect(view.getByText('Əli Məmmədov')).toBeInTheDocument();
  fireEvent.click(view.getByRole('button', { name: 'İdxal et (2 sətir)' }));
  await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('Müştərilər: 1 yeni qeyd yaradıldı, 1 artıq sistemdə olduğu üçün keçildi.'));
  const [tenantId, kind, rows, requestKey] = importOpeningBalances.mock.calls[0];
  expect([tenantId, kind]).toEqual(['t-1', 'customers']);
  expect(rows).toEqual([
    { line: 2, name: 'Əli Məmmədov', fin: '5ABC123', phone: '+994501112233' },
    { line: 3, name: 'Bakı MMC' },
  ]);
  expect(requestKey).toMatch(/[0-9a-f-]{36}/);
  expect(onImported).toHaveBeenCalledWith('customers');
  expect(notify).toHaveBeenCalledTimes(1);
});

it('blocks a file with errors, keeps the request key after a failed import and checks the permission', async () => {
  const view = render(<OpeningBalanceImport tenantId="t-1" can={(permission) => permission !== 'credits.manage'} />);
  fireEvent.click(view.getByRole('tab', { name: /Aktiv kreditlər/ }));
  expect(view.getByText('Bu siyahını idxal etmək üçün icazəniz yoxdur.')).toBeInTheDocument();
  expect(view.getByLabelText('Aktiv kreditlər CSV faylı')).toBeDisabled();

  fireEvent.click(view.getByRole('tab', { name: /Kassa və bank/ }));
  chooseFile(view, 'Kassa və bank hesabları CSV faylı', 'Kod;Ad;Açılış qalığı\nK1;Kassa;-5\n');
  await waitFor(() => expect(view.getByText('Sətir 2: "Açılış qalığı" mənfi olmayan rəqəm olmalıdır.')).toBeInTheDocument());
  expect(view.getByRole('button', { name: /^İdxal et/ })).toBeDisabled();

  let fail;
  importOpeningBalances.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }))
    .mockResolvedValueOnce({ row_count: 1, created: 1, skipped: 0 });
  chooseFile(view, 'Kassa və bank hesabları CSV faylı', 'Kod;Ad;Açılış qalığı\nK1;Kassa;5\n');
  await waitFor(() => expect(view.getByRole('button', { name: 'İdxal et (1 sətir)' })).toBeEnabled());
  fireEvent.click(view.getByRole('button', { name: 'İdxal et (1 sətir)' }));
  expect(view.getByRole('button', { name: 'İdxal edilir...' })).toBeDisabled();
  await act(async () => fail(new Error('Sətir 2: bu kodla hesab artıq var.')));
  expect(view.getByRole('status')).toHaveTextContent('Sətir 2: bu kodla hesab artıq var.');
  fireEvent.click(view.getByRole('button', { name: 'İdxal et (1 sətir)' }));
  await waitFor(() => expect(importOpeningBalances).toHaveBeenCalledTimes(2));
  expect(importOpeningBalances.mock.calls[1][3]).toBe(importOpeningBalances.mock.calls[0][3]);
});
