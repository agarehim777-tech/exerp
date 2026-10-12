import type { Page } from "@playwright/test";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = process.env.E2E_TEST_USER || process.env.TEST_USER || "";
const password = process.env.E2E_TEST_PASS || process.env.TEST_PASS || "";
const configuredStorageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY || "";
const configuredSession = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "";
const hasFreshCredentials = Boolean(url && key && email && password);

function defaultStorageKey() {
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "";
  }
}

export const hasAuthenticatedE2E = Boolean(
  hasFreshCredentials || (process.env.CI !== 'true' && configuredStorageKey && configuredSession),
);

export async function restoreAuthenticatedSession(page: Page) {
  if (process.env.CI === 'true' && !hasFreshCredentials) throw new Error('E2E_FRESH_CREDENTIALS_REQUIRED');
  const storageKey = hasFreshCredentials ? defaultStorageKey() : configuredStorageKey;
  let sessionJson = hasFreshCredentials ? '' : configuredSession;

  if (!sessionJson) {
    if (!hasFreshCredentials) throw new Error('E2E_AUTH_CONFIG_REQUIRED');
    const response = await page.request.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key, "content-type": "application/json" },
      data: { email, password },
    });
    if (!response.ok()) throw new Error(`E2E_LOGIN_FAILED: ${response.status()}`);
    const session = await response.json();
    if (!session.access_token || !session.refresh_token || !session.user?.id) throw new Error('E2E_AUTH_RESPONSE_INVALID');
    sessionJson = JSON.stringify(session);
  }

  await page.addInitScript(
    ([name, value]) => window.localStorage.setItem(name, value),
    [storageKey, sessionJson],
  );
}
