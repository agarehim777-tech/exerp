// Seeds a fresh local Supabase (started by `supabase start` in CI) for database-backed E2E:
// - the E2E user, who creates tenant A through the app's own create_tenant RPC (owner);
// - a second user who owns tenant B, so tenant-isolation tests have a tenant the E2E user cannot see.
// Refuses any URL that is not a local Supabase, so it can never touch a hosted project.
import { appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

export function assertLocalSupabase(url) {
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(hostname)) {
    throw new Error(`LOCAL_SEED_REFUSED: ${hostname} is not a local Supabase`);
  }
}

export async function seedLocal({ apiUrl, anonKey, serviceKey, fetcher = fetch, password = randomBytes(12).toString('hex') }) {
  assertLocalSupabase(apiUrl);
  const call = async (path, { method = 'GET', key = serviceKey, token = key, body, prefer } = {}) => {
    const response = await fetcher(`${apiUrl}${path}`, {
      method,
      headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`LOCAL_SEED_FAILED ${method} ${path}: HTTP ${response.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  const createUser = (email) => call('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true } });
  const signIn = async (email) => (await call('/auth/v1/token?grant_type=password', { method: 'POST', key: anonKey, body: { email, password } })).access_token;

  const owner = await createUser('e2e-owner@example.test');
  const tester = await createUser('e2e-admin@example.test');
  const other = await createUser('e2e-other@example.test');

  // First tenant creator becomes platform admin (create_tenant); that is the app's real bootstrap path.
  const ownerToken = await signIn(owner.email);
  const tenantId = await call('/rest/v1/rpc/create_tenant', { method: 'POST', key: anonKey, token: ownerToken,
    body: { _name: 'E2E Şirkət A', _slug: 'e2e-a' } });

  // The E2E user must not be an owner or platform admin (tests/supabase-lifecycle.ts and
  // supabase-audit-backend.mjs refuse those), so it joins tenant A as admin.
  await call('/rest/v1/tenant_members', { method: 'POST', body: { tenant_id: tenantId, user_id: tester.id, role: 'admin' } });
  await call(`/rest/v1/profiles?id=eq.${tester.id}`, { method: 'PATCH', body: { active_tenant_id: tenantId } });

  // Tenant B belongs only to the other user. Created with the service role so the E2E user never joins it.
  const [tenantB] = await call('/rest/v1/tenants', { method: 'POST', prefer: 'return=representation',
    body: { name: 'E2E Şirkət B', slug: 'e2e-b', created_by: other.id } });
  await call('/rest/v1/tenant_members', { method: 'POST', body: { tenant_id: tenantB.id, user_id: other.id, role: 'owner' } });

  return { email: tester.email, password, tenantId, otherTenantId: tenantB.id, ownerId: owner.id, testerId: tester.id };
}

// The E2E user must see tenant A and must not see tenant B.
export async function smokeCheck({ apiUrl, anonKey, seed, fetcher = fetch }) {
  const tokenResponse = await fetcher(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: seed.email, password: seed.password }),
  });
  const { access_token: token } = await tokenResponse.json();
  const response = await fetcher(`${apiUrl}/rest/v1/tenants?select=id`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` } });
  const visible = (await response.json()).map((row) => row.id);
  if (!visible.includes(seed.tenantId)) throw new Error('LOCAL_SMOKE_FAILED: E2E user cannot see its own tenant');
  if (visible.includes(seed.otherTenantId)) throw new Error('LOCAL_SMOKE_FAILED: E2E user can see the other tenant');
  return visible;
}

if (process.argv[1]?.endsWith('local-e2e-seed.mjs')) {
  const env = process.env;
  const apiUrl = env.API_URL;
  const anonKey = env.ANON_KEY;
  const serviceKey = env.SERVICE_ROLE_KEY;
  if (!apiUrl || !anonKey || !serviceKey) throw new Error('LOCAL_SEED_ENV_REQUIRED: API_URL, ANON_KEY, SERVICE_ROLE_KEY');
  const seed = await seedLocal({ apiUrl, anonKey, serviceKey });
  const visible = await smokeCheck({ apiUrl, anonKey, seed });
  console.log(JSON.stringify({ ok: true, tenantId: seed.tenantId, otherTenantId: seed.otherTenantId, visibleTenants: visible.length }));
  if (env.GITHUB_ENV) {
    console.log(`::add-mask::${seed.password}`);
    await appendFile(env.GITHUB_ENV, [
      `E2E_LOCAL=1`, `VITE_SUPABASE_URL=${apiUrl}`, `VITE_SUPABASE_PUBLISHABLE_KEY=${anonKey}`,
      `E2E_TEST_USER=${seed.email}`, `E2E_TEST_PASS=${seed.password}`,
      `E2E_TENANT_ID=${seed.tenantId}`, `E2E_OTHER_TENANT_ID=${seed.otherTenantId}`, '',
    ].join('\n'));
  }
}
