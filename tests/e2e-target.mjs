const PRODUCTION_REF = 'tcqdhwtnjrwpfdxoijmv';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertE2eTarget(env) {
  const ref = env.E2E_SUPABASE_PROJECT_REF;
  if (!ref || ref === PRODUCTION_REF || !/^[a-z0-9]{20}$/.test(ref)) {
    throw new Error('E2E requires an explicit non-production Supabase project.');
  }
  const url = new URL(env.VITE_SUPABASE_URL || 'invalid');
  if (url.protocol !== 'https:' || url.hostname !== `${ref}.supabase.co`) {
    throw new Error('E2E URL does not match the configured test project.');
  }
  if (!UUID.test(env.E2E_TENANT_ID || '') || !UUID.test(env.E2E_OTHER_TENANT_ID || '') || env.E2E_TENANT_ID === env.E2E_OTHER_TENANT_ID) {
    throw new Error('E2E requires two distinct, explicit test tenant IDs.');
  }
  return env.E2E_TENANT_ID;
}
