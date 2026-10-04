export async function verifyWebhookAudit(backend, requestKey = 'ci-http:' + crypto.randomUUID()) {
  const payload = { tenant_id: backend.tenantId, request_key: requestKey };
  const first = await backend.invokeEdge('webhook-dispatch', payload);
  if (!first?.delivered || first.response_code !== 200 || !first.dispatch_id) {
    throw new Error('SIGNED_HTTP_DELIVERY_NOT_CONFIRMED');
  }
  const rows = await backend.readCanonical('webhook_dispatches', '*', '&id=eq.' + first.dispatch_id);
  const receipts = await backend.readCanonical('webhook_receipts', '*', '&dispatch_id=eq.' + first.dispatch_id);
  if (rows.length !== 1 || rows[0].status !== 'delivered' || rows[0].response_code !== 200 ||
      receipts.length !== 1 || !/^[a-f0-9]{64}$/.test(receipts[0].payload_hash)) {
    throw new Error('SIGNED_HTTP_RECEIPT_MISSING');
  }
  const replay = await backend.invokeEdge('webhook-dispatch', payload);
  const after = await backend.readCanonical('webhook_dispatches', '*', '&id=eq.' + first.dispatch_id);
  if (!replay?.delivered || replay.dispatch_id !== first.dispatch_id || after.length !== 1 ||
      Number(after[0].attempts) !== Number(rows[0].attempts)) {
    throw new Error('SIGNED_HTTP_REPLAY_NOT_IDEMPOTENT');
  }
  return { dispatchId: first.dispatch_id, responseCode: first.response_code, durableReceipt: true, replayVerified: true };
}
