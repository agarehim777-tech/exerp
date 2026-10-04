// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { provisionReadonlyAudit } from '../../scripts/provision-readonly-audit.mjs';

const tenant = '11111111-1111-4111-8111-111111111111';
const user = '33333333-3333-4333-8333-333333333333';
const env = { CI: 'true', GITHUB_RUN_ID: '123', E2E_SUPABASE_PROJECT_REF: 'cvjctwgdyzhijhzhhjqd',
  VITE_SUPABASE_URL: 'https://cvjctwgdyzhijhzhhjqd.supabase.co', E2E_TENANT_ID: tenant,
  E2E_OTHER_TENANT_ID: '22222222-2222-4222-8222-222222222222', SUPABASE_ACCESS_TOKEN: 'test-pat' };
const json = value => new Response(JSON.stringify(value), { status: 200 });

it('creates only a staging viewer and masks all generated credentials', async () => {
  const exported = {}; const mask = vi.fn();
  const fetcher = vi.fn().mockResolvedValueOnce(json([{ type: 'secret', api_key: 'test-server-key' }]))
    .mockResolvedValueOnce(json({ id: user })).mockResolvedValueOnce(json(null));
  expect(await provisionReadonlyAudit(env, { fetcher, mask, exportEnv: async v => Object.assign(exported, v) }))
    .toEqual({ source: 'ephemeral', role: 'viewer' });
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ tenant_id: tenant, user_id: user, role: 'viewer' });
  expect(exported.E2E_READONLY_PASS.length).toBeGreaterThan(32);
  expect(mask).toHaveBeenCalledWith(exported.E2E_READONLY_PASS);
  expect(mask).toHaveBeenCalledWith('test-server-key');
  expect(exported).not.toHaveProperty('SUPABASE_SECRET_KEY');
});

it('never targets production or provisions outside a CI run', async () => {
  const fetcher = vi.fn();
  await expect(provisionReadonlyAudit({ ...env, E2E_SUPABASE_PROJECT_REF: 'tcqdhwtnjrwpfdxoijmv' }, { fetcher }))
    .rejects.toThrow('non-production');
  await expect(provisionReadonlyAudit({ ...env, CI: 'false' }, { fetcher })).rejects.toThrow('CI_REQUIRED');
  expect(fetcher).not.toHaveBeenCalled();
});

it('refuses to delete an account owned by another run', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json([{ type: 'secret', api_key: 'test-server-key' }]))
    .mockResolvedValueOnce(json({ id: user, app_metadata: { audit_run: '456', audit_tenant: tenant } }));
  await expect(provisionReadonlyAudit({ ...env, AUDIT_ACCOUNT_ACTION: 'cleanup', E2E_EPHEMERAL_USER_ID: user }, { fetcher }))
    .rejects.toThrow('IDENTITY_MISMATCH');
  expect(fetcher.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(false);
});

it('reuses explicitly configured credentials without acquiring an admin key', async () => {
  const fetcher = vi.fn(); const exportEnv = vi.fn();
  expect(await provisionReadonlyAudit({ ...env, E2E_READONLY_USER: 'viewer@example.invalid', E2E_READONLY_PASS: 'test-password' },
    { fetcher, exportEnv })).toEqual({ source: 'configured' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(exportEnv).toHaveBeenCalledWith({ E2E_READONLY_USER: 'viewer@example.invalid', E2E_READONLY_PASS: 'test-password' });
});
