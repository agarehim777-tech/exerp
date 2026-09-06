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
    "/credits",
    "/hr/emekdaslar",
  ]) {
    test(`${route} runtime xətası olmadan açılır`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("HR əməkdaş forması ayrıca dialog kimi açılır", async ({ page }) => {
    await page.goto("/hr/emekdaslar", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "İnsan Resursları" })).toBeVisible();
    await page.getByRole("button", { name: "Yeni əməkdaş", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yeni əməkdaş" })).toBeVisible();
    await page.getByRole("button", { name: "Ləğv et", exact: true }).click();
  });

  test("satışdan kredit sifarişi forması açılır", async ({ page }) => {
    await page.goto("/satis/sifarisler", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Satışlar" })).toBeVisible();
    const createButton = page.getByRole("button", { name: /Yeni (satış|sifariş)/i }).first();
    await expect(createButton).toBeVisible();
    await createButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
