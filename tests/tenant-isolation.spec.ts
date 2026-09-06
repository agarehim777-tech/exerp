import { test, expect } from "@playwright/test";
import { hasAuthenticatedE2E, restoreAuthenticatedSession } from "./auth-session";

/**
 * Tenant izolyasiyası və giriş nəzarəti üzrə e2e yoxlamalar.
 *
 * Sessiya olmadan işləyən hissə həmişə icra olunur (anon RLS yoxlaması).
 * Autentifikasiya tələb edən testlər E2E_TEST_USER/E2E_TEST_PASS və ya hazır
 * browser sessiyası olduqda işləyir, əks halda skip edilir.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY || "";

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
        expect([401, 403, 404]).toContain(response.status());
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
      await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await expect(page).not.toHaveURL(/\/login/);
    }
    expect(errors, `Runtime xətaları: ${errors.join(" | ")}`).toEqual([]);
  });

  test("başqa tenant-ın məlumatı sorğuda görünmür", async ({ page }) => {
    await restoreAuthenticatedSession(page);
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const result = await page.evaluate(
      async ([url, key, storageKey]) => {
        const raw = window.localStorage.getItem(storageKey as string);
        const token = raw ? JSON.parse(raw).access_token : null;
        const response = await fetch(`${url}/rest/v1/customers?select=tenant_id&limit=200`, {
          headers: { apikey: key as string, Authorization: `Bearer ${token}` },
        });
        return response.ok ? await response.json() : [];
      },
      [SUPABASE_URL, SUPABASE_KEY, STORAGE_KEY || `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`],
    );
    const tenants = new Set((result as Array<{ tenant_id: string }>).map((row) => row.tenant_id));
    // İstifadəçi yalnız üzv olduğu şirkət(lər)in datasını görməlidir
    expect(tenants.size).toBeLessThanOrEqual(1);
  });
});
