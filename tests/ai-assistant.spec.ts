import { expect, test } from "@playwright/test";
import {
  authenticatedApi,
  hasLifecycleEnvironment,
  supabaseKey,
  supabaseUrl,
} from "./supabase-lifecycle";

const enabled = process.env.AI_E2E_ENABLED === "true";

test.skip(!hasLifecycleEnvironment || !enabled, "Authenticated AI E2E is not enabled");

test("@ai authenticated assistant executes a tenant-scoped tool", async ({ request }) => {
  const { tenantId, accessToken } = await authenticatedApi(request);
  const response = await request.post(`${supabaseUrl}/functions/v1/erp-chat`, {
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    data: {
      tenantId,
      messages: [{
        id: `ai-e2e-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: "Cəmi neçə müştərimiz var? Dəqiq sayı tapmaq üçün count_records alətindən istifadə et." }],
      }],
    },
    timeout: 60_000,
  });

  const stream = await response.text();
  expect(response.status(), stream).toBe(200);
  expect(stream).toContain("count_records");
  expect(stream).not.toMatch(/AI_PROVIDER_NOT_CONFIGURED|billing aktiv deyil|insufficient_quota/i);
});
