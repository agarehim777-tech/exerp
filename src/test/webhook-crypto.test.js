// @vitest-environment node
import { expect, it } from 'vitest';
import { readWebhookBody, signWebhook, verifyWebhook } from '../../supabase/functions/_shared/webhookCrypto.js';

it('authenticates exact bytes and rejects changed bodies, keys and malformed signatures', async () => {
  const body = JSON.stringify({ dispatch_id: 'test', tenant_id: 'tenant' });
  const signature = await signWebhook('test-secret', body);
  expect(await verifyWebhook('test-secret', body, signature)).toBe(true);
  expect(await verifyWebhook('test-secret', `${body} `, signature)).toBe(false);
  expect(await verifyWebhook('other-secret', body, signature)).toBe(false);
  expect(await verifyWebhook('test-secret', body, 'bad')).toBe(false);
});

it('bounds webhook request bodies before parsing even without a content-length header', async () => {
  const request = body => new Request('https://example.invalid', { method: 'POST', body });
  expect(await readWebhookBody(request('small'))).toBe('small');
  await expect(readWebhookBody(request('x'.repeat(4097)))).rejects.toThrow('body_too_large');
});
