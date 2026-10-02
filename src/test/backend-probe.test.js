// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { probeBackend } from '../../scripts/backend-probe.mjs';

it('recovers a temporary network reset with a fresh bounded request', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('ECONNRESET')).mockResolvedValueOnce(new Response('', { status: 200 }));
  const sleep = vi.fn();
  expect((await probeBackend('https://example.invalid', {}, { fetcher, sleep })).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][1].signal).not.toBe(fetcher.mock.calls[1][1].signal);
  expect(sleep).toHaveBeenCalledWith(250);
});

it('does not retry missing schema, bad input, or authorization errors', async () => {
  for (const status of [400, 401, 403, 404]) {
    const fetcher = vi.fn().mockResolvedValue(new Response('error', { status }));
    expect((await probeBackend('https://example.invalid', {}, { fetcher, sleep: vi.fn() })).status).toBe(status);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});

it('keeps persistent server and network errors failing after three attempts', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response('unavailable', { status: 503 }));
  expect((await probeBackend('https://example.invalid', {}, { fetcher, sleep: vi.fn() })).status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(3);
  const network = vi.fn().mockRejectedValue(new TypeError('offline'));
  await expect(probeBackend('https://example.invalid', {}, { fetcher: network, sleep: vi.fn() })).rejects.toThrow('offline');
  expect(network).toHaveBeenCalledTimes(3);
});
