// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { legacyAuditCompatibilityError, runBoundedFlow, waitForAuditModule } from '../../scripts/audit-flow-runner.mjs';

afterEach(() => vi.useRealTimers());
it('waits for the requested route, active navigation and lazy module without network idle', async () => {
  const events = [];
  const page = {
    waitForURL: vi.fn(async predicate => {
      expect(predicate(new URL('https://example.test/finance'))).toBe(true);
      expect(predicate(new URL('https://example.test/other'))).toBe(false);
      events.push('route');
    }),
    locator: vi.fn(selector => ({
      getByText: (label, options) => ({ waitFor: async state => events.push([selector, label, options, state]) }),
      waitFor: async state => events.push([selector, state]),
    })),
    waitForLoadState: vi.fn(),
  };
  await waitForAuditModule(page, '/finance', 'Kassa & Xərclər');
  expect(events).toEqual([
    'route',
    ['.sidebar .nav-list .nav-item.active', 'Kassa & Xərclər', { exact: true }, { state: 'visible' }],
    ['main.main', { state: 'visible' }],
    ['main.main .page-suspense-loader', { state: 'hidden' }],
  ]);
  expect(page.waitForLoadState).not.toHaveBeenCalled();
});
it('rejects Supabase targets before legacy browser login or mutations', () => {
  expect(legacyAuditCompatibilityError({ VITE_SUPABASE_URL: 'https://staging.supabase.co' }).code)
    .toBe('AUDIT_BACKEND_INCOMPATIBLE');
  expect(legacyAuditCompatibilityError({})).toBeNull();
});
it('clears the deadline and cleans up successful flows', async () => {
  vi.useFakeTimers();
  const cleanup = vi.fn();
  await expect(runBoundedFlow(() => 42, 100, cleanup)).resolves.toBe(42);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('cleans up timed-out and rejected flows', async () => {
  vi.useFakeTimers();
  const cleanup = vi.fn();
  const pending = expect(runBoundedFlow(() => new Promise(() => {}), 100, cleanup)).rejects.toThrow('Flow exceeded');
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(cleanup).toHaveBeenCalledOnce();
  await expect(runBoundedFlow(() => { throw new Error('failure'); }, 100, cleanup)).rejects.toThrow('failure');
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
