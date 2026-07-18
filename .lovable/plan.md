# Böyük Refaktor Planı

Bu 6 iş tək mesajda tamamlana bilməz — `src/App.jsx` ~21 000 sətirdir və hər bir maddə özlüyündə günlərlik işdir. Aşağıda **6 fazaya** bölünmüş yol xəritəsi var. Hər fazanı ayrıca təsdiqləməyiniz tövsiyə olunur; bir fazanın sonunda app işlək qalır və commit oluna bilər.

---

## Faza 1 — App.jsx-in modullara bölünməsi

**Hədəf struktur:**
```text
src/
├─ modules/
│  ├─ dashboard/    (DashboardPage + hooks + types)
│  ├─ crm/
│  ├─ sales/
│  ├─ warehouse/
│  ├─ deliveries/
│  ├─ finance/
│  ├─ invoices/
│  ├─ accounting/
│  ├─ tax/
│  ├─ credits/
│  ├─ receivables/
│  ├─ vendors/
│  ├─ projects/     (ROI)
│  ├─ production/
│  ├─ hr/
│  ├─ kpi/
│  ├─ contracts/
│  ├─ reports/      (var)
│  ├─ support/
│  ├─ help/
│  ├─ onboarding/   (var)
│  ├─ messages/
│  ├─ notifications/
│  ├─ api/
│  ├─ settings/
│  └─ platform/     (Şirkətlər)
├─ shared/
│  ├─ state/        (reducer, selectors, context)
│  ├─ hooks/
│  ├─ services/     (remote-api)
│  ├─ utils/
│  └─ types/
└─ components/ui/   (mövcud primitives)
```
- Hər modul: `{Module}Page.jsx`, `components/`, `hooks/`, `types.ts` (Faza 3-dən sonra).
- Ortaq state (indi `useReducer` App.jsx-də) → `shared/state/AppStateContext` + `useAppState()` hook.
- Yalnız köçürmə + import. Davranış dəyişmir.

## Faza 2 — React Router + URL navigation
- `react-router-dom` əlavə.
- `BrowserRouter` + `<Routes>`: `/`, `/crm`, `/sales`, `/warehouse/:tab?`, `/platform`, …
- `AppLayout` (sidebar + header + `<Outlet/>`), `NavLink` ilə aktiv route.
- `active` state silinir → `useLocation` / route paramları.
- Deep-link, back/forward, refresh işləyir.

## Faza 3 — TypeScript miqrasiyası
- `tsconfig.json`, `tsconfig.app.json` (strict, path alias `@/*`).
- Addım-addım: `shared/types/` → `shared/state/` → hər modul (`.jsx` → `.tsx`).
- `data.js` → `data.ts` (interfeys: Company, Customer, Order, Product, …).
- `remote-api.js` üçün response tipləri.
- `strict: true`, `noImplicitAny`, `exactOptionalPropertyTypes`.

## Faza 4 — Lovable Cloud (Supabase): real DB + auth + RLS

**Cədvəllər** (hazırkı modul sxeminə uyğun):
`companies`, `profiles`, `user_roles` (enum `app_role`), `customers`, `products`, `orders`, `order_items`, `warehouses`, `stock`, `vendors`, `purchase_orders`, `invoices`, `credits`, `receivables`, `finance_accounts`, `cash_entries`, `expenses`, `employees`, `departments`, `contracts`, `kpi_targets`, `audit_logs`, …

**Auth qərarları (təsdiq lazımdır):**
- Metod: email/parol + Google (default)?
- Profil cədvəli lazımdır (ad, şəkil, şirkət)? → **bəli** (multi-tenant üçün məcburi).
- Rollar: `Platform Super Admin`, `Company Admin`, `Manager`, `Employee`, … → ayrı `user_roles` cədvəli + `has_role()` security-definer.

**RLS nümunəsi (tenant izolyasiyası):**
```sql
CREATE POLICY "tenant read" ON public.orders FOR SELECT
  TO authenticated
  USING (company_id = public.current_company_id());
```
- `erp-server.mjs` (mock backend) tədricən Supabase client çağırışları ilə əvəzlənir.

## Faza 5 — Test qatı (Vitest + Playwright)
- Vitest + Testing Library: reducers, hook-lar, selectors, kritik komponentlər (auth, sifariş yaratma, hesab-faktura).
- Playwright E2E: login → şirkət yarat → sifariş → təhvil → faktura axını; permission matrisi.
- CI-də `bun test` + `playwright test --project=chromium`.

## Faza 6 — Route-level `React.lazy` + bundle optimallaşdırma
- Hər modul `const CrmPage = lazy(() => import("./modules/crm/CrmPage"))`.
- `<Suspense>` ilə skeleton.
- Manual chunks (icons, vendor, cloud client).
- Hədəf: ilk yükləmə **~180 KB gzip** (hal-hazırda 496KB / 122KB gzip əsas chunk).
- `rollup-plugin-visualizer` ilə ölçmə.

---

## Vaxt qiymətləndirməsi

| Faza | Ölçü | Risk |
|------|------|------|
| 1. Modulyarlaşdırma | ~15–20 mesaj | Orta (böyük state) |
| 2. Router | 2–3 mesaj | Az |
| 3. TypeScript | ~10–15 mesaj | Orta (tiplər) |
| 4. Cloud + RLS | ~8–12 mesaj | Yüksək (data miqrasiyası) |
| 5. Testlər | ~5–8 mesaj | Az |
| 6. Lazy + bundle | 2–3 mesaj | Az |

Cəmi: **40–60 mesajlıq iş**. Kredit və vaxt sərfi nəzərəçarpandır.

## Texniki detallar
- Hər faza sonunda `bun run build` yaşıl olmalıdır.
- Faza 1 dəyişikliyi yalnız fayl bölgüsüdür — funksionallıq dəyişmir, bu yoxlama meyarıdır.
- Faza 3-də incremental: `allowJs: true` ilə başlayıb tədricən `.tsx` çeviririk.
- Faza 4-də mövcud mock data seed script-i ilə Supabase-ə köçürülür.

## Təsdiq üçün suallar
1. Faza 1-dən başlayaq (App.jsx bölünməsi) — razısınız?
2. Faza 4 üçün auth metodu: **email/parol + Google** (default) qalsın?
3. Cari `erp-server.mjs` tam silinsin (Supabase-lə əvəzlənsin), yoxsa müvəqqəti paralel qalsın?
4. Data miqrasiyası: hazırkı mock data-nı Supabase-ə seed edim, yoxsa boş başlayaq?
