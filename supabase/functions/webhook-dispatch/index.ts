import { webhookClients } from '../_shared/webhookClients.ts';
import { readWebhookBody, signWebhook } from '../_shared/webhookCrypto.js';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: cors });
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
    const { caller, admin, url } = webhookClients(authorization);
    const { data: identity, error: loginError } = await caller.auth.getUser(authorization.slice(7));
    if (loginError || !identity.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
    const input = JSON.parse(await readWebhookBody(request));
    const prepared = await caller.rpc('prepare_webhook_audit', { _tenant_id: input.tenant_id, _request_key: input.request_key });
    if (prepared.error) return Response.json({ error: prepared.error.message }, { status: 403, headers: cors });
    const claimed = await admin.rpc('claim_webhook_audit', { _dispatch_id: prepared.data.dispatch_id, _actor_id: identity.user.id });
    if (claimed.error) return Response.json({ error: claimed.error.message }, { status: 409, headers: cors });
    if (claimed.data.delivered) return Response.json(claimed.data, { headers: cors });
    const body = JSON.stringify(claimed.data.payload);
    const started = performance.now(); let code = 0; let failure: string | null = null;
    try {
      // The destination is fixed to this project, never a caller-supplied URL (SSRF boundary).
      const response = await fetch(`${url}/functions/v1/webhook-receiver`, { method: 'POST', redirect: 'error',
        signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json',
          'x-erp-signature': await signWebhook(claimed.data.secret, body) }, body });
      code = response.status; await response.body?.cancel();
      if (!response.ok) failure = 'http_failure';
    } catch { failure = 'network_failure'; }
    const finished = await admin.rpc('finish_webhook_audit', { _dispatch_id: claimed.data.dispatch_id,
      _attempt_id: claimed.data.attempt_id, _code: code, _latency: Math.round(performance.now() - started), _error: failure });
    if (finished.error) return Response.json({ error: 'dispatch_result_not_saved' }, { status: 503, headers: cors });
    return Response.json(finished.data, { status: finished.data.delivered ? 200 : 502, headers: cors });
  } catch { return Response.json({ error: 'invalid_webhook_request' }, { status: 400, headers: cors }); }
});
