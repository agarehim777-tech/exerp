import { expect, test } from "@playwright/test";
import { hasAuthenticatedE2E, restoreAuthenticatedSession } from "./auth-session";
import { authenticatedApi, supabaseKey, supabaseUrl } from "./supabase-lifecycle";

test.describe("Kritik ERP axınları", () => {
  test.skip(!hasAuthenticatedE2E, "E2E test istifadəçisi konfiqurasiya edilməyib");

  test.beforeEach(async ({ page }) => {
    await restoreAuthenticatedSession(page);
  });

  for (const route of [
    "/satis/sifarisler",
    "/anbar/mehsullar",
    "/anbar/qaliqlar",
    "/satinalma",
    "/maliyye/kassa",
    "/kredit",
    "/hr/emekdaslar",
  ]) {
    test(`${route} runtime xətası olmadan açılır`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[/?#]|$)`));
      await expect(page.locator("main.main")).toBeVisible();
      await expect(page.locator(".page-header h1")).toBeVisible();
      if (route === '/anbar/qaliqlar') {
        await expect(page.getByRole('button', { name: '+ Yeni anbar', exact: true })).toBeVisible();
      }
      if (route === '/maliyye/kassa') {
        await expect(page.getByRole('button', { name: '+ Yeni kassa', exact: true })).toBeVisible();
      }
      expect(errors).toEqual([]);
    });
  }

  test("HR əməkdaş forması ayrıca dialog kimi açılır", async ({ page }) => {
    await page.goto("/hr/emekdaslar", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/hr\/emekdaslar(?:[/?#]|$)/);
    await expect(page.getByRole("heading", { name: "İnsan Resursları" })).toBeVisible();
    const createButton = page.getByRole("button", { name: "Yeni əməkdaş", exact: true });
    await expect(createButton).toBeEnabled();
    await createButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yeni əməkdaş" })).toBeVisible();
    await page.getByRole("button", { name: "Ləğv et", exact: true }).click();
  });

  test("satışdan kredit sifarişi forması açılır", async ({ page }) => {
    await page.goto("/satis/sifarisler", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/satis\/sifarisler(?:[/?#]|$)/);
    await expect(page.getByRole("heading", { name: "Satışlar" })).toBeVisible();
    const createButton = page.getByRole("button", { name: /Yeni (satış|sifariş)/i }).first();
    await expect(createButton).toBeVisible();
    await createButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("ağıllı tövsiyələr Edge Function vasitəsilə yaradılır", async ({ page }) => {
    await page.goto("/ai-tovsiyeler", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/ai-tovsiyeler(?:[/?#]|$)/);
    await expect(page.getByText("Ağıllı tövsiyələr", { exact: false }).first()).toBeVisible();

    const analyzeButton = page.getByRole("button", { name: "Təhlil et", exact: true });
    await expect(analyzeButton).toBeVisible();
    await expect(analyzeButton).toBeEnabled();
    const [response] = await Promise.all([page.waitForResponse(
      (response) => response.url().includes("/functions/v1/erp-insights")
        && response.request().method() === "POST",
      { timeout: 20_000 },
    ), analyzeButton.click()]);
    expect(response.status()).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload.insights)).toBe(true);
    expect(payload.insights.length).toBeGreaterThan(0);
    await expect(page.getByText("Failed to send a request to the Edge Function")).toHaveCount(0);
  });

  test("insights rejects unauthenticated requests", async ({ request }) => {
    const response = await request.post(`${supabaseUrl}/functions/v1/erp-insights`, {
      headers: { apikey: supabaseKey },
      data: { tenantId: process.env.E2E_TENANT_ID },
    });
    expect(response.status()).toBe(401);
  });

  test("insights rejects a tenant without membership", async ({ request }) => {
    const { accessToken } = await authenticatedApi(request);
    const response = await request.post(`${supabaseUrl}/functions/v1/erp-insights`, {
      headers: { apikey: supabaseKey, authorization: `Bearer ${accessToken}` },
      data: { tenantId: process.env.E2E_OTHER_TENANT_ID },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).insights).toBeUndefined();
  });
});
