// @vitest-environment node
import { expect, it } from 'vitest';
import { isWebhookProjectUrl } from '../../supabase/functions/_shared/webhookTarget.js';

it('accepts only this project as the webhook destination: hosted or the local CLI gateway', () => {
  expect(isWebhookProjectUrl('https://tcqdhwtnjrwpfdxoijmv.supabase.co')).toBe(true);
  expect(isWebhookProjectUrl('http://kong:8000')).toBe(true);
});

it('rejects anything a misconfigured runtime or an attacker could point it at', () => {
  for (const url of [
    'http://tcqdhwtnjrwpfdxoijmv.supabase.co', 'https://tcqdhwtnjrwpfdxoijmv.supabase.co/', 'https://evil.example',
    'https://tcqdhwtnjrwpfdxoijmv.supabase.co.evil.example', 'http://kong:8000/', 'http://kong:8001', 'http://127.0.0.1:54321',
    '', undefined, null,
  ]) expect(isWebhookProjectUrl(url), String(url)).toBe(false);
});
