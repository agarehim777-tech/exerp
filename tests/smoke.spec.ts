import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected to /login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("login modal renders email and password fields", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Daxil ol" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByPlaceholder("ad@sirket.az")).toBeVisible();
  await expect(page.locator("#xp-p")).toBeVisible();
});
