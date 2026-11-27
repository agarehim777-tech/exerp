import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for pages that had none: accounting periods, the finance period close and the CRM deal board.
const mocks = vi.hoisted(() => ({
  auth: /** @type {{ activeMembership: { tenant_id: string, role: string } | null, activeTenantId: string | null }} */ ({ activeMembership: { tenant_id: 'T1', role: 'admin' }, activeTenantId: 'T1' }),
  periods: { periods: [], loading: false, create: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  locks: [],
  lock: vi.fn(),
  reopen: vi.fn(),
  pipelines: { activePipeline: null, stagesFor: () => [], seedDefault: vi.fn(async () => {}), pipelines: [] },
  deals: { deals: [], error: null, move: vi.fn(), create: vi.fn() },
}));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => mocks.auth }));
vi.mock('../shared/hooks/useAccountingPeriods.js', () => ({ useAccountingPeriods: () => mocks.periods }));
vi.mock('../shared/hooks/usePipelines.js', () => ({ usePipelines: () => mocks.pipelines }));
vi.mock('../shared/hooks/useDeals.js', () => ({ useDeals: () => mocks.deals }));
vi.mock('../shared/hooks/useCustomers.js', () => ({ useCustomers: () => ({ customers: [] }) }));
vi.mock('../services/coreOperations.js', () => ({
  listAccountingPeriodLocks: vi.fn(async () => mocks.locks),
  lockAccountingPeriod: (...args) => mocks.lock(...args),
  reopenAccountingPeriod: (...args) => mocks.reopen(...args),
}));

const { default: PeriodsPage } = await import('../modules/accounting/PeriodsPage.jsx');
const { AccountingPeriodPanel } = await import('../modules/finance/components/AccountingPeriodPanel.jsx');
const { default: CrmDealsPage } = await import('../modules/crm/CrmDealsPage.jsx');

beforeEach(() => {
  mocks.auth = { activeMembership: { tenant_id: 'T1', role: 'admin' }, activeTenantId: 'T1' };
  mocks.periods = { periods: [], loading: false, create: vi.fn(), setStatus: vi.fn(), remove: vi.fn() };
  mocks.locks = [];
  mocks.lock = vi.fn(async () => ({}));
  mocks.reopen = vi.fn(async () => ({}));
  mocks.pipelines = { activePipeline: null, stagesFor: () => [], seedDefault: vi.fn(async () => {}), pipelines: [] };
  mocks.deals = { deals: [], error: null, move: vi.fn(), create: vi.fn() };
});
afterEach(cleanup);

describe('accounting periods page', () => {
  it('counts open and locked periods and locks an open one', async () => {
    mocks.periods.periods = [
      { id: 'P1', name: 'Oktyabr 2026', start_date: '2026-10-01', end_date: '2026-10-31', status: 'open' },
      { id: 'P2', name: 'Sentyabr 2026', start_date: '2026-09-01', end_date: '2026-09-30', status: 'locked', locked_at: '2026-10-02T09:00:00Z' },
    ];
    mocks.periods.setStatus = vi.fn(async () => {});
    render(<PeriodsPage />);
    const stat = (label) => [...document.querySelectorAll('.ui-stat-card')]
      .find((card) => card.querySelector('span')?.textContent === label).querySelector('strong').textContent;
    expect([stat('Dövr sayı'), stat('Açıq')]).toEqual(['2', '1']);
    fireEvent.click(screen.getByRole('button', { name: 'Bağla' }));
    await waitFor(() => expect(mocks.periods.setStatus).toHaveBeenCalledWith('P1', 'locked'));
  });

  it('shows the server error and hides admin actions from members', async () => {
    mocks.periods.create = vi.fn(async () => { throw new Error('period_overlap'); });
    const { unmount } = render(<PeriodsPage />);
    fireEvent.click(screen.getByRole('button', { name: '+ Dövr yarat' }));
    expect(await screen.findByText('Xəta: period_overlap')).toBeTruthy();
    unmount();
    mocks.auth = { activeMembership: { tenant_id: 'T1', role: 'member' }, activeTenantId: 'T1' };
    render(<PeriodsPage />);
    expect(screen.queryByRole('button', { name: '+ Dövr yarat' })).toBeNull();
  });

  it('asks for a company when none is active', () => {
    mocks.auth = { activeMembership: null, activeTenantId: null };
    render(<PeriodsPage />);
    expect(screen.getByText('Aktiv şirkət seçilməyib.')).toBeTruthy();
  });
});

describe('finance period close panel', () => {
  it('needs a reason and confirmation, then locks up to the chosen date', async () => {
    const notify = vi.fn();
    render(<AccountingPeriodPanel tenantId="T1" canManage notify={notify}
      expenses={[{ date: '2026-01-05', status: 'Təsdiq gözləyir' }]} />);
    expect(screen.getByText('1 təsdiq gözləyən xərc var')).toBeTruthy();
    const closeButton = /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: /Bu tarixədək bağla/ }));
    expect(closeButton.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Məsələn/), { target: { value: 'Noyabr bağlanışı' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(closeButton.disabled).toBe(false);
    fireEvent.click(closeButton);
    await waitFor(() => expect(mocks.lock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'T1', periodStart: '1900-01-01', reason: 'Noyabr bağlanışı' })));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('bağlandı'), 'success');
  });

  it('explains a missing permission instead of the raw database error', async () => {
    mocks.lock = vi.fn(async () => { throw new Error('permission_denied'); });
    render(<AccountingPeriodPanel tenantId="T1" canManage notify={undefined} />);
    fireEvent.change(screen.getByPlaceholderText(/Məsələn/), { target: { value: 'Bağlanış' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Bu tarixədək bağla/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('Bu əməliyyat üçün şirkət administratoru icazəsi tələb olunur.');
  });

  it('keeps the action disabled without finance management rights', () => {
    render(<AccountingPeriodPanel tenantId="T1" canManage={false} notify={undefined} />);
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: /Bu tarixədək bağla/ })).disabled).toBe(true);
    expect(screen.getByText('Bu əməliyyat üçün Maliyyə idarəetməsi icazəsi tələb olunur.')).toBeTruthy();
  });
});

describe('CRM deal board', () => {
  it('seeds the default pipeline when the company has none', async () => {
    render(<CrmDealsPage />);
    expect(screen.getByText('Satış mərhələləri hazırlanır...')).toBeTruthy();
    await waitFor(() => expect(mocks.pipelines.seedDefault).toHaveBeenCalled());
  });

  it('shows stages with their deals and the deal load error', () => {
    mocks.pipelines = {
      activePipeline: { id: 'PL1', name: 'Satış' }, pipelines: [{ id: 'PL1' }], seedDefault: vi.fn(),
      stagesFor: () => [{ id: 'S1', name: 'Yeni', position: 1 }, { id: 'S2', name: 'Qazanıldı', position: 2, is_won: true }],
    };
    mocks.deals = { deals: [{ id: 'D1', title: 'Noutbuk sifarişi', stage_id: 'S1', status: 'open', amount: 1200 }],
      error: new Error('timeout'), move: vi.fn(), create: vi.fn() };
    render(<CrmDealsPage />);
    expect(screen.getByText('Noutbuk sifarişi')).toBeTruthy();
    expect(screen.getByText('Qazanıldı')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Sövdələşmələr yüklənmədi: timeout');
  });
});
