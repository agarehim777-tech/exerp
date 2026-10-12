// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const preview = JSON.stringify({ access_token: 'test-preview', user: { id: 'preview-admin' } });
beforeEach(() => {
  vi.resetModules();
  for (const name of ['E2E_TEST_USER', 'E2E_TEST_PASS', 'TEST_USER', 'TEST_PASS', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) vi.stubEnv(name, '');
  vi.stubEnv('CI', 'true');
  vi.stubEnv('LOVABLE_BROWSER_SUPABASE_STORAGE_KEY', 'foreign-preview-token');
  vi.stubEnv('LOVABLE_BROWSER_SUPABASE_SESSION_JSON', preview);
});
afterEach(() => vi.unstubAllEnvs());
const configureFresh = () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://staging.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
  vi.stubEnv('E2E_TEST_USER', 'qa@example.invalid');
  vi.stubEnv('E2E_TEST_PASS', 'test-only');
};

it('logs in with the dedicated account and matching storage key instead of a cached preview identity', async () => {
  configureFresh();
  const session = { access_token: 'test-fresh', refresh_token: 'test-refresh', user: { id: 'qa-admin' } };
  const post = vi.fn(async () => ({ ok: () => true, json: async () => session }));
  const page = { request: { post }, addInitScript: vi.fn() };
  const auth = await import('../../tests/auth-session.ts');
  expect(auth.hasAuthenticatedE2E).toBe(true);
  await auth.restoreAuthenticatedSession(page);
  expect(post).toHaveBeenCalledWith('https://staging.supabase.co/auth/v1/token?grant_type=password',
    expect.objectContaining({ data: { email: 'qa@example.invalid', password: 'test-only' } }));
  expect(page.addInitScript.mock.calls[0][1]).toEqual(['sb-staging-auth-token', JSON.stringify(session)]);
});

it('rejects preview-only CI but still allows explicitly configured local preview sessions', async () => {
  let auth = await import('../../tests/auth-session.ts');
  expect(auth.hasAuthenticatedE2E).toBe(false);
  await expect(auth.restoreAuthenticatedSession({})).rejects.toThrow('FRESH_CREDENTIALS_REQUIRED');
  vi.stubEnv('CI', 'false'); vi.resetModules();
  auth = await import('../../tests/auth-session.ts');
  const page = { request: { post: vi.fn() }, addInitScript: vi.fn() };
  expect(auth.hasAuthenticatedE2E).toBe(true);
  await auth.restoreAuthenticatedSession(page);
  expect(page.request.post).not.toHaveBeenCalled();
  expect(page.addInitScript.mock.calls[0][1]).toEqual(['foreign-preview-token', preview]);
});

it('does not fall back to preview on failed login or inject malformed auth responses', async () => {
  configureFresh();
  const auth = await import('../../tests/auth-session.ts');
  const page = { request: { post: vi.fn(async () => ({ ok: () => false, status: () => 401 })) }, addInitScript: vi.fn() };
  await expect(auth.restoreAuthenticatedSession(page)).rejects.toThrow('E2E_LOGIN_FAILED: 401');
  expect(page.addInitScript).not.toHaveBeenCalled();
  page.request.post.mockResolvedValue({ ok: () => true, json: async () => ({ access_token: 'partial' }) });
  await expect(auth.restoreAuthenticatedSession(page)).rejects.toThrow('AUTH_RESPONSE_INVALID');
  expect(page.addInitScript).not.toHaveBeenCalled();
});
