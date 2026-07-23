# App.jsx tam parçalanması — route-based lazy loading

Hazırda `src/App.jsx` **22,338 sətir** və **~25+ səhifə komponenti** (Dashboard, CRM, Sales, Warehouse, Finance, Invoices, Accounting, Tax, Credits, Receivables, Vendors, HR, KPI, Support, Messages, Notifications, Settings, Api, Platform, Projects, Production, Help, Onboarding, Deliveries...) yalnız `active === "..."` string switch-i ilə render olunur. Router yoxdur — hər şey tək state.

## Məqsəd

- Hər səhifə → öz faylı → `React.lazy()` ilə yüklənən ayrı chunk
- `active` state əvəzinə `react-router-dom` `<Routes>` və URL path-lar
- App.jsx yalnız **shell** (AppProviders, Sidebar, TopBar, Outlet) — hədəf **< 1,500 sətir**
- İlk bundle ölçüsü: `App-BJU_6pOi.js` 472 KB + `app-modules` 1.2 MB → hədəf **hər route < 200 KB gzip**

## Yanaşma

Böyük refactoru risklə balanslaşdırmaq üçün **3 fazaya bölürəm**, hər faza sonunda build+preview yoxlanır.

### Faza 1 — İnfrastruktur (bu sprint)

1. `src/pages/` qovluğu yarat, per-page fayl skeletləri
2. Router qat: `src/router.jsx` — bütün route-lar `React.lazy()` ilə
3. `App.jsx` içində `<Outlet />` göstərən shell komponenti çıxar (`AppShell.jsx`) — Sidebar + TopBar + kontekst provider-lər
4. Mövcud `active` state-i `useLocation()` → path mapping ilə əvəzlə (backward compat üçün adapter)
5. `src/main.jsx` routing tree-ni yenilə: `/`, `/crm`, `/satis`, `/anbar`, `/maliyyə`, `/muhasibat`, ...

### Faza 2 — Səhifə köçürməsi (batched)

Hər batch-də 4-5 səhifə App.jsx-dən öz faylına köçürülür + shared helper-lər `src/shared/` altına:

- **Batch A**: Dashboard, CRM (Customers/Deals/Activities/Tasks), Sales (Orders/Quotes/Shipments/Dashboard)
- **Batch B**: Warehouse, Deliveries, Vendors, VendorManagement, Procurement (mövcud)
- **Batch C**: Finance, Invoices, Accounting, Tax, Credits, Receivables
- **Batch D**: HR, KPI, Support, Messages(V2), Notifications, Api
- **Batch E**: Settings, Platform, Roles, AccessCheck, Help, Onboarding, Projects, Production

Hər səhifə üçün props yerinə `useAppData()` custom hook (mövcud kontekstdən oxuyur) — App.jsx-dəki nəhəng prop-drilling-i sonlandırır.

### Faza 3 — Təmizləmə

- App.jsx-dəki 200+ helper funksiya → `src/shared/lib/` altında domenlərə görə (`credits.js`, `invoices.js`, `accounting.js`, ...)
- Ölü kod və dublikat helper-lər silinir
- `manualChunks` vite config-də `per-route` chunk strategiyasına keçid

## Bu turda edəcəyim (Faza 1)

1. `src/router.jsx` — bütün route path → lazy component mapping
2. `src/AppShell.jsx` — sidebar/topbar/providers, `<Outlet />` render edir
3. `src/pages/` altında hər page üçün **wrapper faylı** — hələlik App.jsx-dən export edilən komponentləri re-export edir (əsas kod hərəkət etməyəcək, ancaq lazy split dərhal işləyəcək)
4. App.jsx-dəki bütün `function XxxPage(...)` → `export function` çevriləcək ki, import olunsun
5. `main.jsx` `<BrowserRouter>` altında `<AppShell>` + `<Routes>` render edir
6. `active` state → `useNavigate()`/`useLocation()` adapter (sidebar click-ləri URL-i dəyişəcək)

Faza 1 sonunda:
- Deep-link işləyir (`/crm-deals`, `/satis`, ...)
- Back/forward düymələri işləyir
- Hər səhifə ayrı chunk (initial bundle 200-300 KB gzip düşür)
- Kod hələ App.jsx-də qalır — Faza 2-də fiziki çıxarılacaq

Faza 2 və 3 sonrakı mesajlarda ardıcıl batch-lərlə.

## Texniki qeydlər

- Route path-lar hazırkı `active` açarları ilə eyni qalır (`/crm`, `/sales`, `/warehouse`...) — mövcud navigation state-ləri qırılmır
- `AuthProvider`, `TenantBootstrap`, `ErrorBoundary`, `Suspense` shell-də saxlanılır
- Sentry breadcrumbs-a route change event-i əlavə olunur
- Sidebar navigation `<NavLink>` istifadə edir (aktiv route highlight avtomatik)
- Vite `manualChunks` sadələşdirilir — Rollup route-based split-i özü tapır

Faza 1-i başlayım?