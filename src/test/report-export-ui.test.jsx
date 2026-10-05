import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ live: {}, tenant: 'tenant-a', csv: vi.fn(), pdf: vi.fn() }));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: mocks.tenant }) }));
vi.mock('../shared/hooks/useLiveReportData.js', () => ({ useLiveReportData: () => mocks.live }));
vi.mock('../shared/lib/reportDownload.js', () => ({ downloadReportCsv: mocks.csv, downloadReportPdf: mocks.pdf }));
vi.mock('../data.js', () => ({ reportTemplates: [{ title: 'Aylıq satış hesabatı', desc: '', cadence: 'Aylıq' }] }));
import { ReportsPage } from '../modules/reports/ReportsPage.jsx';

const build = vi.fn(data => ({ period: 'all', rows: data.expenses.length + data.productionPlans.length,
  score: 100, moduleRows: [], riskRows: [], riskCount: 0, creditBalance: 0, invoiceBalance: 0,
  productionCost: data.productionPlans.reduce((sum, row) => sum + row.totalCost, 0), expenses: data.expenses }));
beforeEach(() => {
  mocks.tenant = 'tenant-a';
  mocks.csv.mockReset(); mocks.pdf.mockReset(); build.mockClear();
  mocks.live = { loaded: true, loading: false, error: null, degraded: false, refresh: vi.fn(),
    expenses: [], vendors: [], purchaseOrders: [], cashEntries: [], invoices: [], productionPlans: [{ id: 'batch', totalCost: 150 }] };
});

it('does not audit or surface a stale PDF export after A -> B -> A and exports the management modules', async () => {
  let resolvePdf;
  mocks.pdf.mockImplementation(() => new Promise(resolve => { resolvePdf = resolve; }));
  const save = vi.fn().mockResolvedValue({ id: 'export' });
  const { rerender } = render(<ReportsPage {...props} onExport={save} />);
  fireEvent.click(screen.getByRole('button', { name: 'PDF', exact: true }));
  await waitFor(() => expect(mocks.pdf).toHaveBeenCalled());
  const guard = mocks.pdf.mock.calls[0][1].isCurrent;
  expect(guard()).toBe(true);
  mocks.tenant = 'tenant-b'; rerender(<ReportsPage {...props} onExport={save} />);
  mocks.tenant = 'tenant-a'; rerender(<ReportsPage {...props} onExport={save} />);
  expect(guard()).toBe(false);
  await act(async () => { resolvePdf(false); });
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByTestId('report-template-export')).toBeEnabled();
  fireEvent.click(screen.getAllByRole('button', { name: 'Excel', exact: true })[0]);
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(mocks.csv).toHaveBeenLastCalledWith(expect.objectContaining({
    columns: ['Modul', 'Göstərici', 'Say', 'Siqnal', 'Status'],
    rows: expect.arrayContaining([expect.arrayContaining(['İstehsalat'])]),
  }));
});
afterEach(cleanup);

const props = { snapshotDate: '2026-10-05', buildExecutiveInsights: () => [], buildReportPackage: build,
  expenses: [{ id: 'obsolete-expense', amount: 9900 }], productionPlans: [{ id: 'obsolete-batch', totalCost: 9999 }] };

it('exports the displayed filtered snapshot using canonical production rather than legacy props', async () => {
  const save = vi.fn().mockResolvedValue({ id: 'export' });
  render(<ReportsPage {...props} onExport={save} orders={[{ id: 'sale', orderNo: 'SF-QA', date: '2026-10-05', amount: 1200 }]} />);
  fireEvent.change(screen.getByLabelText('Dövr'), { target: { value: 'Hamısı' } });
  fireEvent.click(screen.getByTestId('report-template-export'));
  await waitFor(() => expect(save).toHaveBeenCalledWith('Aylıq satış hesabatı', 'Excel', expect.objectContaining({ period: 'Hamısı', productionCost: 150, expenses: [] })));
  expect(mocks.csv).toHaveBeenCalledWith(expect.objectContaining({ rows: expect.arrayContaining([expect.arrayContaining(['SF-QA'])]) }));
  expect(build.mock.calls.every(([data]) => !data.productionPlans.some(row => row.id === 'obsolete-batch'))).toBe(true);
});

it('blocks exports on an unacknowledged or failed load and surfaces an unsuccessful server save', async () => {
  const save = vi.fn().mockResolvedValue(null);
  mocks.live.loaded = false;
  const { rerender } = render(<ReportsPage {...props} onExport={save} />);
  expect(screen.getByTestId('report-template-export')).toBeDisabled();
  mocks.live.loaded = true; mocks.live.error = new Error('offline');
  rerender(<ReportsPage {...props} onExport={save} />);
  expect(screen.getByTestId('report-template-export')).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('offline');
  mocks.live.error = null;
  rerender(<ReportsPage {...props} onExport={save} />);
  fireEvent.click(screen.getByTestId('report-template-export'));
  await screen.findByText(/Audit qeydi serverdə saxlanmadı/);
  expect(screen.getByTestId('report-template-export')).toBeEnabled();
});
