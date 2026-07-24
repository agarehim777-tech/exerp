
# Batch A: Dashboard, Warehouse, Finance → src/pages/ (lazy chunks)

## Vəziyyət

`src/App.jsx` (22,340 sətir) daxilində:
- `DashboardPage` — sətir 11541–11736 (~196 sətir, 10 prop)
- `WarehousePage` — sətir 13709–14124 (~416 sətir, 15+ prop)
- `FinancePage` — sətir 14408–15009 (~602 sətir, 20+ prop)

Bu komponentlər App.jsx-də lokal təyin olunan UI helper-lərdən (`MetricCard`, `money`, `Section`, `Table` və s.) və 200+ helper funksiyadan asılıdır. **Sadə "wrapper faylı yarat və re-export et" yanaşması** chunk-splitting-ə fayda vermir, çünki bütün kod hələ App.jsx-də qalır və Rollup ayrı chunk yaratmır.

## Yanaşma — 2 addım

### Addım 1: Shared kitabxana çıxarışı (prerequisite)

`src/shared/lib/` altında ayrıla bilən helper qrupları:
- `src/shared/ui/primitives.jsx` — `MetricCard`, `Section`, `Table`, `StatusPill`, `Toolbar`, ... (App.jsx-də inline təyin olunmuş atomik UI komponentləri)
- `src/shared/format/money.js` — `money`, `percent`, `date` format-erləri
- `src/shared/lib/warehouse.js` — `buildProductLookup`, `getReorderPoint`, `isLowStockItem`, `buildWarehouseWmsRows` (App.jsx 1172–1250)
- `src/shared/lib/finance.js` — `buildFinanceScenario`, `hasExpenseCashImpact`, `buildCurrencyExposureRows` (App.jsx 1376–1547)
- `src/shared/lib/dashboard.js` — `buildTodayActionRows`, `buildExecutiveInsights` (App.jsx 1963–2092)

App.jsx içindən bu helper-lər silinir və `import` ilə əvəzlənir.

### Addım 2: Səhifə komponentlərinin köçürülməsi

- `src/pages/DashboardPage.jsx` — `export default function DashboardPage(props)`; ancaq shared/ import-ları
- `src/pages/WarehousePage.jsx` — eyni
- `src/pages/FinancePage.jsx` — eyni

App.jsx-də mövcud lokal təyinatlar silinir, əvəzinə üç `lazy()` import əlavə olunur:

```jsx
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const WarehousePage = lazy(() => import("./pages/WarehousePage.jsx"));
const FinancePage = lazy(() => import("./pages/FinancePage.jsx"));
```

Prop-drilling saxlanılır (indi olduğu kimi) — hər üç səhifə hazırkı JSX-dəki eyni prop-larla çağırılır. `useAppData()` hook-a keçid Faza 2-nin sonrakı batch-ində.

## Risk və doğrulama

- **Risk**: helper-lərin bəziləri App.jsx daxilindəki başqa səhifələr tərəfindən də istifadə olunur → çıxarış zamanı hamısını import etmək lazımdır. Fayl silinmədən əvvəl `rg` ilə hər helper-in bütün istifadə yerləri yoxlanılır.
- **Doğrulama**:
  1. `bun run build` — səhv olmadan tamamlansın
  2. `dist/assets/` altında `DashboardPage-*.js`, `WarehousePage-*.js`, `FinancePage-*.js` ayrı chunk-lar mövcud olsun
  3. Preview-da `/`, `/anbar/mehsullar`, `/maliyye/jurnal` route-ları açılıb data göstərsin

## Gözlənilən nəticə

- App.jsx ~1,200 sətir azalır (təxminən 21,100-ə düşür)
- 3 yeni route chunk (~50–150 KB gzip hər biri)
- Initial `App-*.js` bundle-i ~100 KB azalır (helper-lər ayrılır)
- Batch B–E eyni pattern ilə davam etdirilə bilər

Təsdiqlə, başlayım?
