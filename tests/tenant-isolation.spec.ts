import { test, expect } from "@playwright/test";
import { hasAuthenticatedE2E, restoreAuthenticatedSession } from "./auth-session";
import { authenticatedApi } from "./supabase-lifecycle";

/**
 * Tenant izolyasiyası və giriş nəzarəti üzrə e2e yoxlamalar.
 *
 * Sessiya olmadan işləyən hissə həmişə icra olunur (anon RLS yoxlaması).
 * Autentifikasiya tələb edən testlər E2E_TEST_USER/E2E_TEST_PASS və ya hazır
 * browser sessiyası olduqda işləyir, əks halda skip edilir.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

const TENANT_TABLES = [
  "customers",
  "orders",
  "products",
  "sales_invoices",
  "stock_movements",
  "credit_contracts",
  "inventory_units",
  "journal_entries",
];

test.describe("RLS — anonim giriş", () => {
  test.skip(!SUPABASE_URL || !SUPABASE_KEY, "Backend konfiqurasiyası yoxdur");

  for (const table of TENANT_TABLES) {
    test(`anonim istifadəçi ${table} cədvəlindən sətir oxuya bilmir`, async ({ request }) => {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=5`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (response.ok()) {
        // RLS aktivdirsə icazəsiz sorğu boş massiv qaytarmalıdır
        expect(await response.json()).toEqual([]);
      } else {
        // və ya birbaşa 401/403 verməlidir
        expect([401, 403]).toContain(response.status());
      }
    });
  }
});

test.describe("Marşrut mühafizəsi", () => {
  const protectedPaths = ["/", "/anbar/mehsullar", "/maliyye/jurnal", "/kredit", "/platform"];

  for (const path of protectedPaths) {
    test(`${path} sessiyasız /login-ə yönləndirir`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 15_000 });
      await expect(page).toHaveURL(/\/login/);
    });
  }
});

test.describe("Sessiya ilə tenant izolyasiyası", () => {
  test.skip(!hasAuthenticatedE2E, "E2E test istifadəçisi mövcud deyil");

  test("aktiv şirkət seçilib və əsas modullar xətasız açılır", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await restoreAuthenticatedSession(page);
    for (const path of ["/", "/anbar/mehsullar", "/maliyye/jurnal", "/kredit"]) {
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForTimeout(1500);
      await expect(page).not.toHaveURL(/\/login/);
    }
    expect(errors, `Runtime xətaları: ${errors.join(" | ")}`).toEqual([]);
  });

  test("başqa tenant-ın məlumatı sorğuda görünmür", async ({ request }) => {
    const api = await authenticatedApi(request);
    const otherTenant = process.env.E2E_OTHER_TENANT_ID!;
    const memberships = await api.call("get", "tenant_members?select=tenant_id");
    expect(memberships.some((row: { tenant_id: string }) => row.tenant_id === otherTenant)).toBe(false);
    const ownRows = await api.call("get", `customers?select=id,tenant_id&tenant_id=eq.${api.tenantId}&limit=200`);
    expect(ownRows.length, "Seed at least one customer in the dedicated test tenant").toBeGreaterThan(0);
    expect(ownRows.every((row: { tenant_id: string }) => row.tenant_id === api.tenantId)).toBe(true);
    for (const table of TENANT_TABLES) {
      // authenticatedApi throws on HTTP failures; a missing table is not a passing RLS test.
      const foreignRows = await api.call("get", `${table}?select=id,tenant_id&tenant_id=eq.${otherTenant}&limit=5`);
      expect(foreignRows, `Cross-tenant read: ${table}`).toEqual([]);
    }
  });
});
