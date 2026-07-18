import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected to /login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /Daxil ol|Qeydiyyat/i })).toBeVisible();
});

test("login page renders email and password fields", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("Email")).toBeVisible();
  await expect(page.getByPlaceholder("Şifrə")).toBeVisible();
});
