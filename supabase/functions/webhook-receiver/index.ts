import { webhookClients } from '../_shared/webhookClients.ts';
import { readWebhookBody, verifyWebhook } from '../_shared/webhookCrypto.js';
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  try {
    const body = await readWebhookBody(request); const input = JSON.parse(body);
    if (!/^[0-9a-f-]{36}$/i.test(input.dispatch_id || '')) return new Response(null, { status: 400 });
    const { admin } = webhookClients();
    const context = await admin.rpc('webhook_audit_receipt_context', { _dispatch_id: input.dispatch_id });
    if (context.error || !context.data || context.data.tenant_id !== input.tenant_id
      || !await verifyWebhook(context.data.secret, body, request.headers.get('x-erp-signature'))) return new Response(null, { status: 401 });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    const receipt = await admin.rpc('record_webhook_audit_receipt', { _dispatch_id: input.dispatch_id, _hash: hash });
    return Response.json({ received: !receipt.error }, { status: receipt.error ? 409 : 200 });
  } catch { return new Response(null, { status: 400 }); }
});
