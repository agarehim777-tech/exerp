// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { stagingAdminHeaders } from '../../scripts/staging-admin-key.mjs';

const local = { E2E_LOCAL: '1', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', SERVICE_ROLE_KEY: 'local-service-key' };

it('uses the local service key in local mode without calling the Management API', async () => {
  const request = vi.fn();
  const mask = vi.fn();
  expect(await stagingAdminHeaders(local, request, mask)).toEqual({
    apikey: 'local-service-key', authorization: 'Bearer local-service-key', 'content-type': 'application/json' });
  expect(request).not.toHaveBeenCalled();
  expect(mask).toHaveBeenCalledWith('local-service-key');
});

it('refuses a local service key with a hosted URL or without a key', async () => {
  await expect(stagingAdminHeaders({ ...local, VITE_SUPABASE_URL: 'https://tcqdhwtnjrwpfdxoijmv.supabase.co' }, vi.fn()))
    .rejects.toThrow('E2E_LOCAL requires a local Supabase URL');
  await expect(stagingAdminHeaders({ ...local, SERVICE_ROLE_KEY: '' }, vi.fn())).rejects.toThrow('LOCAL_SERVICE_KEY_REQUIRED');
});

it('keeps the Management API path for hosted staging', async () => {
  const request = vi.fn(async () => [{ type: 'secret', api_key: 'hosted-secret' }]);
  const headers = await stagingAdminHeaders({ SUPABASE_ACCESS_TOKEN: 'token', E2E_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst' }, request);
  expect(request.mock.calls[0][0]).toBe('https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/api-keys?reveal=true');
  expect(headers.apikey).toBe('hosted-secret');
});
