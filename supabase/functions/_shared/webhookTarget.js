// Webhook dispatch only ever posts to this project's own webhook-receiver (SSRF boundary).
// SUPABASE_URL is set by the runtime, never by a caller: a hosted project gets
// https://<project-ref>.supabase.co, and the Supabase CLI's local stack (CI E2E) gets the
// internal gateway http://kong:8000. Anything else means the runtime is misconfigured.
const HOSTED_PROJECT_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
const LOCAL_STACK_URL = 'http://kong:8000';

export function isWebhookProjectUrl(url) {
  return typeof url === 'string' && (HOSTED_PROJECT_URL.test(url) || url === LOCAL_STACK_URL);
}
