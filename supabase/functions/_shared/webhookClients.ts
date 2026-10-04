import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
export function webhookClients(authorization?: string) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const secrets = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const publicKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
  const secret = secrets.default || Object.values(secrets)[0] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publishable = publicKeys.default || Object.values(publicKeys)[0] || Deno.env.get('SUPABASE_ANON_KEY');
  if (!secret || !publishable || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) throw new Error('webhook_runtime_unavailable');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return { url, admin: createClient(url, secret as string, options),
    caller: createClient(url, publishable as string, { ...options, global: { headers: { Authorization: authorization || '' } } }) };
}
