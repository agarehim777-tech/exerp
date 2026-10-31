// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { checkWebhookConfiguration } from '../shared/lib/apiWebhookCheck.js';

const secrets = [{ key: 'S1', status: 'Aktiv' }, { key: 'S2', status: 'Deaktiv' }];
const webhook = { id: 'WH-1', status: 'Aktiv', authType: 'HMAC', secretKey: 'S1', target: 'https://example.invalid/hook' };

it('reports a complete rule as ready without claiming any delivery result', () => {
  const check = checkWebhookConfiguration(webhook, secrets);
  expect(check).toEqual({ ready: true, result: 'Göndərişə hazırdır', error: '' });
  expect(check).not.toHaveProperty('responseCode');
  expect(check).not.toHaveProperty('latencyMs');
});

it('names every missing piece of the configuration', () => {
  const check = checkWebhookConfiguration({ ...webhook, status: 'Deaktiv', secretKey: 'S2', target: 'http://x' }, secrets);
  expect(check.ready).toBe(false);
  expect(check.error).toBe('Endpoint aktiv deyil; Secret/token aktiv deyil və ya tapılmadı; Hədəf ünvanı https:// ilə başlamır');
  expect(checkWebhookConfiguration({ ...webhook, authType: 'None', secretKey: '' }, []).ready).toBe(true);
});

it('the API page no longer invents response codes or latency', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('function runApiAction(');
  const body = app.slice(start, app.indexOf('function runNotificationDispatchAction(', start));
  expect(body).toContain('checkWebhookConfiguration(');
  expect(body).not.toMatch(/Math\.random|responseCode: success|latencyMs: success|: 200\b/);
});
