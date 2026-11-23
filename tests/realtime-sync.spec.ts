import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertE2eTarget } from './e2e-target.mjs';
import { hasLifecycleEnvironment, runId, supabaseKey, supabaseUrl } from './supabase-lifecycle';

// Live updates between two sessions: one session listens to postgres_changes on a table that only became part
// of the supabase_realtime publication in 20261123110000, the other session writes to it. Before that
// migration no event was ever sent for these tables, so other users' edits appeared only after a refresh.
test.skip(!hasLifecycleEnvironment, 'Authenticated environment with the realtime service is required');

const email = process.env.E2E_TEST_USER || process.env.TEST_USER || '';
const password = process.env.E2E_TEST_PASS || process.env.TEST_PASS || '';

async function signedInClient(): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

test('a warehouse created in one session reaches another session live', async () => {
  test.setTimeout(60_000);
  const tenantId = assertE2eTarget(process.env);
  const [listener, writer] = await Promise.all([signedInClient(), signedInClient()]);
  const code = runId('RT').slice(0, 30);
  let markSubscribed: () => void = () => {};
  const subscribed = new Promise<void>((resolve) => { markSubscribed = resolve; });
  const received = new Promise<Record<string, unknown>>((resolve) => {
    listener.channel(`e2e-warehouses-${code}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'warehouses', filter: `tenant_id=eq.${tenantId}` },
        (payload) => { if (payload.new?.code === code) resolve(payload.new); })
      .subscribe((status) => { if (status === 'SUBSCRIBED') markSubscribed(); });
  });
  await Promise.race([
    subscribed,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Realtime channel did not subscribe within 15 s')), 15_000)),
  ]);
  let createdId: string | null = null;
  try {
    const { data, error } = await writer.from('warehouses')
      .insert({ tenant_id: tenantId, code, name: `Realtime ${code}`, is_active: false }).select('id').single();
    if (error) throw error;
    createdId = data.id;
    const event = await Promise.race([
      received,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('No realtime event within 20 s')), 20_000)),
    ]);
    expect(event).toMatchObject({ id: createdId, code, tenant_id: tenantId });
  } finally {
    if (createdId) await writer.from('warehouses').delete().eq('id', createdId);
    await listener.removeAllChannels();
    await Promise.all([listener.auth.signOut(), writer.auth.signOut()]);
  }
});
