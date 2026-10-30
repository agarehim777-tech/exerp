// Reads the staging project's server key through the Management API so CI scripts never store it.
// `request` must throw errors ending in `HTTP <status>` for non-2xx responses.
export async function stagingAdminHeaders(env, request, mask = () => {}) {
  if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('AUDIT_ACCOUNT_PROVISION_TOKEN_REQUIRED');
  let keys;
  try {
    keys = await request(`https://api.supabase.com/v1/projects/${env.E2E_SUPABASE_PROJECT_REF}/api-keys?reveal=true`,
      { headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } });
  } catch (error) {
    if (error.message.endsWith('HTTP 401')) {
      throw new Error('AUDIT_ACCOUNT_MANAGEMENT_TOKEN_REJECTED: update staging SUPABASE_ACCESS_TOKEN or configure E2E_READONLY_USER and E2E_READONLY_PASS');
    }
    if (error.message.endsWith('HTTP 403')) {
      throw new Error('AUDIT_ACCOUNT_MANAGEMENT_SCOPE_REQUIRED: token needs staging project API-key and key-secret read permissions');
    }
    throw error;
  }
  const key = keys.find(item => item.type === 'secret' && item.api_key)
    || keys.find(item => item.name === 'service_role' && item.api_key);
  if (!key) throw new Error('AUDIT_ACCOUNT_ADMIN_KEY_UNAVAILABLE');
  mask(key.api_key);
  return { apikey: key.api_key, 'content-type': 'application/json',
    ...(key.type === 'secret' ? {} : { authorization: `Bearer ${key.api_key}` }) };
}
