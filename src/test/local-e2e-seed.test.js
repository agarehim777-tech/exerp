// @vitest-environment node
import { expect, it } from 'vitest';
import { assertLocalSupabase, seedLocal, smokeCheck } from '../../scripts/local-e2e-seed.mjs';

it('refuses every hosted Supabase project, production and backup included', () => {
  for (const url of ['https://tcqdhwtnjrwpfdxoijmv.supabase.co', 'https://cvjctwgdyzhijhzhhjqd.supabase.co', 'http://example.com']) {
    expect(() => assertLocalSupabase(url)).toThrow('LOCAL_SEED_REFUSED');
  }
  expect(() => assertLocalSupabase('http://127.0.0.1:54321')).not.toThrow();
});

it('seeds tenant A through create_tenant, the E2E user as admin of A, and tenant B it cannot join', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    const { pathname } = new URL(url);
    calls.push(`${init.method} ${pathname}`);
    const body = init.body ? JSON.parse(init.body) : {};
    const reply = pathname === '/auth/v1/admin/users' ? { id: body.email.replace('@example.test', '-id'), email: body.email }
      : pathname === '/auth/v1/token' ? { access_token: 'token' }
      : pathname === '/rest/v1/rpc/create_tenant' ? 'tenant-a'
      : pathname === '/rest/v1/tenants' ? [{ id: 'tenant-b' }]
      : null;
    return { ok: true, status: 200, text: async () => (reply === null ? '' : JSON.stringify(reply)) };
  };
  const seed = await seedLocal({ apiUrl: 'http://127.0.0.1:54321', anonKey: 'anon', serviceKey: 'service', fetcher, password: 'pw' });
  expect(seed).toMatchObject({ email: 'e2e-admin@example.test', tenantId: 'tenant-a', otherTenantId: 'tenant-b',
    ownerId: 'e2e-owner-id', testerId: 'e2e-admin-id' });
  expect(calls).toEqual([
    'POST /auth/v1/admin/users', 'POST /auth/v1/admin/users', 'POST /auth/v1/admin/users', 'POST /auth/v1/token',
    'POST /rest/v1/rpc/create_tenant', 'POST /rest/v1/tenant_members', 'PATCH /rest/v1/profiles',
    'POST /rest/v1/tenants', 'POST /rest/v1/tenant_members', 'POST /rest/v1/customers',
  ]);
});

it('fails the smoke check when the E2E user can see the other tenant', async () => {
  const fetcher = async (url) => ({ json: async () => (url.includes('/auth/v1/token') ? { access_token: 't' } : [{ id: 'tenant-a' }, { id: 'tenant-b' }]) });
  await expect(smokeCheck({ apiUrl: 'http://127.0.0.1:54321', anonKey: 'anon', fetcher,
    seed: { email: 'e', password: 'p', tenantId: 'tenant-a', otherTenantId: 'tenant-b' } })).rejects.toThrow('other tenant');
});
