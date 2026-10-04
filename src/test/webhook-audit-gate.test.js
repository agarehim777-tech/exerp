// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { verifyWebhookAudit } from '../../scripts/verify-webhook-audit.mjs';

function fixture({ receipts = [{ payload_hash: 'a'.repeat(64) }], replayAttempts = 1 } = {}) {
  let reads = 0;
  return { tenantId: 'test-tenant',
    invokeEdge: vi.fn().mockResolvedValue({ delivered: true, dispatch_id: 'dispatch-1', response_code: 200 }),
    readCanonical: vi.fn(async table => table === 'webhook_receipts' ? receipts :
      [{ status: 'delivered', response_code: 200, attempts: ++reads === 1 ? 1 : replayAttempts }]),
  };
}
it('requires actual receiver evidence and verifies that replay did not send twice', async () => {
  const backend = fixture();
  expect(await verifyWebhookAudit(backend, 'test-key')).toMatchObject({ durableReceipt: true, replayVerified: true });
  expect(backend.invokeEdge).toHaveBeenNthCalledWith(2, 'webhook-dispatch', { tenant_id: 'test-tenant', request_key: 'test-key' });
});
it('fails a claimed HTTP success without its persisted receiver receipt', async () => {
  await expect(verifyWebhookAudit(fixture({ receipts: [] }))).rejects.toThrow('RECEIPT_MISSING');
});
it('fails a replay that sent another HTTP attempt', async () => {
  await expect(verifyWebhookAudit(fixture({ replayAttempts: 2 }))).rejects.toThrow('NOT_IDEMPOTENT');
});
