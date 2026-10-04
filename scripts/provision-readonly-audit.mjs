import { randomBytes, randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertE2eTarget } from '../tests/e2e-target.mjs';

export async function provisionReadonlyAudit(env, { fetcher = fetch, exportEnv, mask = () => {} } = {}) {
  const tenantId = assertE2eTarget(env);
  const url = new URL(env.VITE_SUPABASE_URL).origin;
  const request = async (target, options = {}) => {
    const response = await fetcher(target, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`AUDIT_ACCOUNT_REQUEST_FAILED: HTTP ${response.status}`);
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  async function adminHeaders() {
    if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('AUDIT_ACCOUNT_PROVISION_TOKEN_REQUIRED');
    const keys = await request(`https://api.supabase.com/v1/projects/${env.E2E_SUPABASE_PROJECT_REF}/api-keys?reveal=true`,
      { headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
    const key = keys.find(item => item.type === 'secret' && item.api_key)
      || keys.find(item => item.name === 'service_role' && item.api_key);
    if (!key) throw new Error('AUDIT_ACCOUNT_ADMIN_KEY_UNAVAILABLE');
    mask(key.api_key);
    return { apikey: key.api_key, 'content-type': 'application/json',
      ...(key.type === 'secret' ? {} : { authorization: `Bearer ${key.api_key}` }) };
  }
  if (env.AUDIT_ACCOUNT_ACTION === 'cleanup') {
    if (!env.E2E_EPHEMERAL_USER_ID) return { cleanup: 'not-created' };
    if (!/^[0-9a-f-]{36}$/i.test(env.E2E_EPHEMERAL_USER_ID)) throw new Error('AUDIT_ACCOUNT_INVALID_ID');
    const headers = await adminHeaders();
    const user = await request(`${url}/auth/v1/admin/users/${env.E2E_EPHEMERAL_USER_ID}`, { headers });
    if (user.app_metadata?.audit_run !== env.GITHUB_RUN_ID || user.app_metadata?.audit_tenant !== tenantId) {
      throw new Error('AUDIT_ACCOUNT_CLEANUP_IDENTITY_MISMATCH');
    }
    await request(`${url}/rest/v1/tenant_members?tenant_id=eq.${tenantId}&user_id=eq.${user.id}&role=eq.viewer`,
      { method: 'DELETE', headers });
    await request(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers });
    return { cleanup: 'deleted' };
  }
  if (env.E2E_READONLY_USER && env.E2E_READONLY_PASS) {
    mask(env.E2E_READONLY_PASS);
    await exportEnv({ E2E_READONLY_USER: env.E2E_READONLY_USER, E2E_READONLY_PASS: env.E2E_READONLY_PASS });
    return { source: 'configured' };
  }
  if (env.E2E_READONLY_USER || env.E2E_READONLY_PASS) throw new Error('AUDIT_ACCOUNT_PARTIAL_CONFIGURATION');
  if (env.CI !== 'true' || !/^\d+$/.test(env.GITHUB_RUN_ID || '')) throw new Error('AUDIT_ACCOUNT_CI_REQUIRED');
  const headers = await adminHeaders();
  const password = randomBytes(32).toString('base64url');
  const email = `erp-audit-${env.GITHUB_RUN_ID}-${randomUUID().slice(0, 8)}@example.invalid`;
  mask(password);
  const user = await request(`${url}/auth/v1/admin/users`, { method: 'POST', headers,
    body: JSON.stringify({ email, password, email_confirm: true,
      app_metadata: { audit_run: env.GITHUB_RUN_ID, audit_tenant: tenantId } }) });
  if (!user.id) throw new Error('AUDIT_ACCOUNT_USER_NOT_CREATED');
  // Export ownership before membership so even a later step failure can clean up safely.
  await exportEnv({ E2E_EPHEMERAL_USER_ID: user.id });
  try {
    await request(`${url}/rest/v1/tenant_members`, { method: 'POST', headers,
      body: JSON.stringify({ tenant_id: tenantId, user_id: user.id, role: 'viewer' }) });
    await exportEnv({ E2E_READONLY_USER: email, E2E_READONLY_PASS: password });
  } catch (error) {
    await request(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers });
    await exportEnv({ E2E_EPHEMERAL_USER_ID: '' });
    throw error;
  }
  return { source: 'ephemeral', role: 'viewer' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await provisionReadonlyAudit(process.env, {
    exportEnv: async values => {
      if (!process.env.GITHUB_ENV) throw new Error('AUDIT_ACCOUNT_GITHUB_ENV_REQUIRED');
      await appendFile(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
    },
    mask: value => process.stdout.write(`::add-mask::${value}\n`),
  });
  console.log(JSON.stringify(result));
}
