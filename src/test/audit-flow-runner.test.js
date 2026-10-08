// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { auditResponse, auditServerArguments, createAuditCustomerIdentity, legacyAuditCompatibilityError, runBoundedFlow, waitForAuditModule } from '../../scripts/audit-flow-runner.mjs';

afterEach(() => vi.useRealTimers());
it('allocates a fresh audit phone and FIN after a persisted identity collision', async () => {
  const read = vi.fn().mockResolvedValueOnce([{ id: 'existing' }]).mockResolvedValue([]);
  const uuid = vi.fn().mockReturnValueOnce('00000000-0000-4000-8000-000000000000')
    .mockReturnValue('abcdef00-0000-4000-8000-000000000001');
  expect(await createAuditCustomerIdentity(read, uuid)).toEqual({ fin: 'QABCDEF', phone: '0500000001' });
  expect(read.mock.calls[0][0]).toEqual({ fin: 'Q000000', phone: '0500000000' });
  expect(read).toHaveBeenCalledTimes(2);
});
it('fails a fixture allocation instead of disabling customer uniqueness checks', async () => {
  const read = vi.fn().mockResolvedValue([{ id: 'existing' }]);
  await expect(createAuditCustomerIdentity(read)).rejects.toThrow('isolated audit customer identity');
  expect(read).toHaveBeenCalledTimes(5);
});
it('runs CI business audits against the release build without dev transforms or HMR', () => {
  const url = new URL('http://localhost:5174/');
  expect(auditServerArguments(url, { CI: 'true' })).toEqual([
    'node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort',
  ]);
  expect(auditServerArguments(url, {})).not.toContain('preview');
});
it('registers response observation before clicking and returns the actual response', async () => {
  const events = [];
  const response = { ok: () => true };
  const page = { waitForResponse: vi.fn(async () => { events.push('listen'); return response; }) };
  expect(await auditResponse(page, () => true, () => events.push('click'), {timeout:100})).toBe(response);
  expect(events).toEqual(['listen','click']);
});
it('catches a response timeout while the action is still pending', async () => {
  const page = { waitForResponse: vi.fn(() => Promise.reject(new Error('Response timeout'))) };
  await expect(auditResponse(page, () => true, () => new Promise(() => {}))).rejects.toThrow('Response timeout');
});
it('keeps a later response rejection handled after the click fails', async () => {
  let failResponse;
  const page = { waitForResponse: vi.fn(() => new Promise((_,reject) => { failResponse = reject; })) };
  await expect(auditResponse(page, () => true, () => { throw new Error('Click failed'); })).rejects.toThrow('Click failed');
  failResponse(new Error('Late response timeout'));
  await new Promise(resolve => setImmediate(resolve));
});
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
