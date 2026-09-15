import type { APIRequestContext } from "@playwright/test";

export const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
export const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = process.env.E2E_TEST_USER || process.env.TEST_USER || "";
const password = process.env.E2E_TEST_PASS || process.env.TEST_PASS || "";

export const hasLifecycleEnvironment = Boolean(supabaseUrl && supabaseKey && email && password);

export async function authenticatedApi(request: APIRequestContext) {
  const login = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: supabaseKey, "content-type": "application/json" },
    data: { email, password },
  });
  if (!login.ok()) throw new Error(`Lifecycle login failed (${login.status()}): ${await login.text()}`);
  const session = await login.json();
  const headers = {
    apikey: supabaseKey,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
  };
  const call = async (method: "get" | "post" | "patch" | "delete", path: string, data?: unknown, extraHeaders = {}) => {
    const response = await request[method](`${supabaseUrl}/rest/v1/${path}`, { headers: { ...headers, ...extraHeaders }, data });
    if (!response.ok()) throw new Error(`${method.toUpperCase()} ${path} failed (${response.status()}): ${await response.text()}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const memberships = await call("get", "memberships?select=tenant_id,role&limit=1");
  if (!memberships?.[0]?.tenant_id) throw new Error("E2E istifadəçisinin aktiv şirkət üzvlüyü yoxdur.");
  return { call, tenantId: memberships[0].tenant_id as string };
}

export const runId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;