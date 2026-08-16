import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY || "";
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "";

async function restoreSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, SESSION_JSON],
  );
}

test.describe("Kritik ERP axınları", () => {
  test.skip(!STORAGE_KEY || !SESSION_JSON, "E2E test sessiyası konfiqurasiya edilməyib");

  test.beforeEach(async ({ page }) => {
    await restoreSession(page);
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
    await page.getByRole("button", { name: "Yeni əməkdaş", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yeni əməkdaş" })).toBeVisible();
    await page.getByRole("button", { name: "Ləğv et", exact: true }).click();
  });

  test("satışdan kredit sifarişi forması açılır", async ({ page }) => {
    await page.goto("/satis/sifarisler", { waitUntil: "domcontentloaded" });
    const createButton = page.getByRole("button", { name: /Yeni sifariş/i }).first();
    await expect(createButton).toBeVisible();
    await createButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
