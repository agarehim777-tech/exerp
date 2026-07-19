# İdeal CRM Modulu

Cari `CrmPage` sadəcə müştəri cədvəlidir. Onu tam CRM-ə çeviririk: Lead → Deal pipeline, aktivlik tarixi, tapşırıqlar, 360° müştəri profili və müasir Attio/Folk üslubunda interfeys.

## 1. Data qatı (Supabase migration)

Yeni cədvəllər (hamısı `tenant_id` + RLS + `owner_id`):
- **`crm_pipelines`** — pipeline şablonları (default: Satış)
- **`crm_stages`** — pipeline mərhələləri (Yeni, Kvalifikasiya, Təklif, Danışıq, Qazanıldı, İtirildi) + `probability`, `sort_order`, `color`
- **`crm_deals`** — sövdələşmələr: title, customer_id, stage_id, amount, currency, expected_close, owner_id, status
- **`crm_activities`** — timeline: type (call/meeting/email/note), subject, body, customer_id, deal_id, occurred_at, owner_id
- **`crm_tasks`** — tapşırıqlar: title, due_at, done, priority, assigned_to, customer_id, deal_id
- **`crm_tags`** və **`crm_customer_tags`** — çox-çox teq sistemi

`customers` cədvəlinə əlavələr: `owner_id`, `tax_id` (VÖEN), `segment` (individual/business/vip), `lifetime_value` (computed view), `last_activity_at`.

Unique index: `(tenant_id, fin)` və `(tenant_id, tax_id)` — duplikat qarşısı.

RLS: tenant üzvləri oxuyur; edit `owner_id = auth.uid()` VƏ YA `has_module_access(tenant, 'crm', 'edit')`.

Helper funksiyalar:
- `crm_pipeline_summary(pipeline_id)` — hər mərhələ üzrə deal sayı və məbləği
- `customer_360(customer_id)` — profile + son 20 aktivlik + açıq deal-lar + sifariş ümumisi

## 2. Hooks qatı

Yeni fayllar `src/shared/hooks/`:
- `useDeals.js` — list/create/update/move (stage dəyişmə), realtime
- `useActivities.js` — customer/deal üzrə timeline
- `useTasks.js` — mənə aid + tarixə görə
- `usePipelines.js` — pipeline/stage konfiqurasiyası
- `useCustomer360.js` — bir müştərinin tam profili (RPC ilə)

Zod validasiyası: FIN (7 char), VÖEN (10 digit), telefon `+994XXXXXXXXX`, e-poçt.

## 3. UI qatı — yeni CRM modulu

Sidebar-da **CRM** genişlənir:
- **Müştərilər** (mövcud, redizayn olunur)
- **Sövdələşmələr** (Kanban) — YENİ
- **Aktivliklər** — YENİ
- **Tapşırıqlar** — YENİ

### 3.1 Müştərilər səhifəsi (redizayn)
- Üstdə 4 stat kartı: Ümumi / Yeni bu ay / Aktiv (30 gün) / VIP
- Sətrlərdə: rəngli inisial avatarı, ad + segment çipi, əlaqə, teqlər, sahib, son aktivlik "3 gün əvvəl", açıq deal sayı
- Sətrə klik → sağdan sürüşən **CustomerDrawer** (bax 3.5)
- Toolbar: fuzzy axtarış, segment filter, teq filter, sahib filter, "Yeni müştəri" CTA
- Empty state: SVG illüstrasiya + CTA
- Mobil: cədvəl → kart görünüşünə keçir

### 3.2 Deal Kanban səhifəsi (YENİ)
- Yuxarıda pipeline seçici + ümumi məbləğ
- Hər mərhələ = sütun, başlıqda: ad, deal sayı, cəm məbləğ, `probability` badge
- Kart: title, müştəri, məbləğ, expected_close, owner avatarı, teqlər
- Drag-and-drop (`@dnd-kit`) — mərhələ dəyişir, DB update + realtime
- "Qazanıldı" sütununa atanda toast + confetti (framer-motion)
- Sütun başlığına klik → kart yarat modal

### 3.3 Aktivliklər səhifəsi
- Timeline görünüşü, filter (növ, tarix, sahib)
- Sürətli əlavə: "Zəng etdim: ..." tək sətir input

### 3.4 Tapşırıqlar səhifəsi
- 3 sütun: Bu gün / Bu həftə / Sonra
- Checkbox ilə tamamla, `due_at` gec olanları qırmızı flag
- Müştəri/deal linki

### 3.5 CustomerDrawer (360° görünüş)
Sağdan açılan panel (`Sheet`), tab-lar:
- **Ümumi:** əlaqə blokları, teqlər (əlavə/sil), sahib dəyişdirmə, düzəliş formu
- **Sövdələşmələr:** açıq/qapalı deal-lar mini kanban
- **Aktivlik:** timeline + sürətli əlavə (zəng/görüş/qeyd)
- **Tapşırıqlar:** aid tapşırıqlar
- **Sifarişlər:** mövcud `orders` bu müştəri üzrə, cəm və status
- Yuxarıda: böyük avatar, LTV, son aktivlik, "Zəng et" / "Email göndər" / "Task əlavə et" düymələri

## 4. Görünüş sistemi
- Yeni CSS token-ları: `--crm-stage-1..6` mərhələ rəngləri, `--crm-priority-high/med/low`
- Framer-motion: kart hover lift, drawer slide-in spring, stage move layout animation
- Avatar: inisialdan HSL-hash rəng — determinist
- Teq çipləri: pastel bg, tünd text, ovalpə
- Mövcud "Emerald Prestige" temasına uyğun

## 5. Testlər (minimum)
- Vitest: `usePipelines`, deal move, tag toggle
- Playwright: müştəri yarat → deal yarat → mərhələ dəyiş → drawer aç

## Fayl xülasəsi

**Yeni migration** (1):
- `crm_pipelines`, `crm_stages`, `crm_deals`, `crm_activities`, `crm_tasks`, `crm_tags`, `crm_customer_tags` + RPC-lər + `customers` üçün ALTER + seed default pipeline funksiyası

**Yeni hook-lar** (5): `useDeals`, `useActivities`, `useTasks`, `usePipelines`, `useCustomer360`

**Yeni komponentlər** `src/modules/crm/`:
- `CrmCustomersPage.jsx` (redizayn)
- `CrmDealsPage.jsx` (Kanban)
- `CrmActivitiesPage.jsx`
- `CrmTasksPage.jsx`
- `CustomerDrawer.jsx`
- `DealCard.jsx`, `StageColumn.jsx`, `ActivityItem.jsx`, `TaskItem.jsx`, `Avatar.jsx`, `TagChip.jsx`

**Dəyişənlər:**
- `src/App.jsx` — köhnə `CrmPage`-i yeni `CrmCustomersPage` ilə əvəz + 3 yeni route + sidebar alt-menyu
- `src/styles.css` — CRM token-ları
- `package.json` — `@dnd-kit/core`, `@dnd-kit/sortable` əlavə

## Təsdiq edildikdə icra sırası
1. Migration (təsdiq gözləyir)
2. Hook-lar + drawer + müştərilər redizaynı (tez dəyər)
3. Deal Kanban + drag-drop
4. Aktivlik + Tapşırıqlar
5. Testlər + polish

Təsdiqlə, başlayım.
