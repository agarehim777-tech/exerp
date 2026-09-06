import { expect, test } from "@playwright/test";
import { hasAuthenticatedE2E, restoreAuthenticatedSession } from "./auth-session";

test.describe("Kritik ERP axınları", () => {
  test.skip(!hasAuthenticatedE2E, "E2E test istifadəçisi konfiqurasiya edilməyib");

  test.beforeEach(async ({ page }) => {
    await restoreAuthenticatedSession(page);
  });

  for (const route of [
    "/satis/sifarisler",
    "/anbar/mehsullar",
    "/satinalma",
    "/maliyye/kassa",
    "/kredit",
    "/hr/emekdaslar",
  ]) {
    test(`${route} runtime xətası olmadan açılır`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[/?#]|$)`));
      await expect(page.locator("main.main")).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("HR əməkdaş forması ayrıca dialog kimi açılır", async ({ page }) => {
    await page.goto("/hr/emekdaslar", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/hr\/emekdaslar(?:[/?#]|$)/);
    await expect(page.getByRole("heading", { name: "İnsan Resursları" })).toBeVisible();
    await page.getByRole("button", { name: "Yeni əməkdaş", exact: true }).click();
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

    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/functions/v1/erp-insights")
        && response.request().method() === "POST",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Təhlil et", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const payload = await response.json();
    expect(Array.isArray(payload.insights)).toBe(true);
    expect(payload.insights.length).toBeGreaterThan(0);
    await expect(page.getByText("Failed to send a request to the Edge Function")).toHaveCount(0);
  });
});
