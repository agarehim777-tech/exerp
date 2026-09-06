import type { Page } from "@playwright/test";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = process.env.E2E_TEST_USER || process.env.TEST_USER || "";
const password = process.env.E2E_TEST_PASS || process.env.TEST_PASS || "";
const configuredStorageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY || "";
const configuredSession = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "";

function defaultStorageKey() {
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "";
  }
}

export const hasAuthenticatedE2E = Boolean(
  (configuredStorageKey && configuredSession) || (url && key && email && password),
);

export async function restoreAuthenticatedSession(page: Page) {
  let storageKey = configuredStorageKey || defaultStorageKey();
  let sessionJson = configuredSession;

  if (!sessionJson) {
    const response = await page.request.post(`${url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: key, "content-type": "application/json" },
      data: { email, password },
    });
    if (!response.ok()) throw new Error(`E2E login failed (${response.status()}): ${await response.text()}`);
    sessionJson = JSON.stringify(await response.json());
  }

  await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.evaluate(
    ([name, value]) => window.localStorage.setItem(name, value),
    [storageKey, sessionJson],
  );
}
