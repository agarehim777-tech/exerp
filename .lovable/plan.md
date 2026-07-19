## İdeal Satış Modulu

Cari `SalesPage` sadəcə sifariş cədvəlidir. Onu tam satış idarəetmə modu­luna çeviririk: kotirovka (quote) → sifariş → çatdırılma → faktura axını, məhsul seçici, qiymət/endirim/ƏDV hesablama, satış analitikası və modern UI.

---

### 1. Data qatı (Supabase migration)

**Yeni cədvəllər** (hamısı `tenant_id` + RLS + `owner_id`):
- **`quotes`** — kotirovkalar: number, customer_id, status (draft/sent/accepted/rejected/expired), valid_until, currency, subtotal, discount_total, tax_total, total, notes, owner_id
- **`quote_items`** — kotirovka sətrləri: quote_id, product_id, description, qty, unit_price, discount_pct, tax_rate, line_total
- **`sales_shipments`** — çatdırılmalar: order_id, shipment_no, status (pending/packed/shipped/delivered), tracking_no, carrier, shipped_at, delivered_at
- **`sales_shipment_items`** — sətrləri: shipment_id, order_item_id, qty_shipped

**Mövcud cədvəllərə əlavə:**
- `orders`: `quote_id` (nullable FK), `discount_total`, `tax_total`, `payment_status` (unpaid/partial/paid), `paid_amount`, `due_date`
- `order_items`: `discount_pct`, `tax_rate`, `line_total` (computed)

**Helper funksiyalar:**
- `sales_dashboard(_tenant, _from, _to)` → RPC: ümumi dövriyyə, açıq sifariş sayı, orta çek, top 5 müştəri, top 5 məhsul
- `convert_quote_to_order(_quote_id)` → kotirovkanı sifarişə çevirir, item-ları köçürür
- `generate_order_number(_tenant)` → auto-inkrement (SO-2026-0001)

---

### 2. Hooks qatı (`src/shared/hooks/`)

- **`useQuotes.js`** — list/create/update/delete/send/accept, realtime
- **`useSalesDashboard.js`** — RPC ilə KPI-lar, realtime refresh
- **`useShipments.js`** — çatdırılma idarəetmə
- **`useOrders.js`** genişləndirmək — line items ilə tam CRUD, ödəniş qeydiyyatı

---

### 3. UI qatı — `src/modules/sales/`

Sidebar-da **Satış** açılır (CRM kimi collapsible):
- **Dashboard** — YENİ
- **Kotirovkalar** — YENİ
- **Sifarişlər** (redizayn)
- **Çatdırılmalar** — YENİ

#### 3.1 `SalesDashboardPage.jsx`
- 4 KPI kartı: Bu ay dövriyyə / Açıq sifariş / Orta çek / Konversiya %
- 2 qrafik: son 30 gün gündəlik satış (line chart, recharts), status paylanması (donut)
- Top müştərilər cədvəli (5 sətr), Top məhsullar (5 sətr)
- Son 10 sifariş preview

#### 3.2 `QuotesPage.jsx`
- Cədvəl: nömrə, müştəri, məbləğ, status çipi, etibarlıdır tarixi, sahib
- Toolbar: axtarış, status filter, "Yeni kotirovka"
- Sətrə klik → detal drawer
- Sağdan sürüşən **`QuoteEditor`**: müştəri seçici, məhsul əlavə (autocomplete), qty/qiymət/endirim/ƏDV cədvəli, real-time cəm hesablama, PDF preview düyməsi, "Sifarişə çevir" düyməsi

#### 3.3 `OrdersPage.jsx` (redizayn)
- Kanban görünüş toggle: statusa görə sütunlar (yeni/təsdiq/hazır/çatdırıldı/ləğv)
- Cədvəl görünüşdə: nömrə, müştəri, məbləğ, ödəniş status badge, çatdırılma status, tarix
- Sətr klik → **`OrderDrawer`**: items, ödəniş qeydi, çatdırılma yarat, faktura yarat, statuslar

#### 3.4 `ShipmentsPage.jsx`
- Sadə cədvəl + status axını (packed → shipped → delivered)
- Tracking number, carrier, tarixlər

#### 3.5 Ortaq komponentlər
- **`ProductPicker.jsx`** — autocomplete + qiymət auto-doldurma
- **`LineItemsTable.jsx`** — quote və order üçün ortaq item cədvəli (qty/price/discount/vat/total)
- **`StatusBadge.jsx`** — rəngli status çipləri
- **`MoneyDisplay.jsx`** — valyuta format

---

### 4. Görünüş
- Mövcud "Emerald Prestige" temasına uyğun
- Yeni CSS token: `--sales-status-*` (draft/sent/accepted/paid/shipped/cancelled)
- Framer-motion: drawer slide-in, kanban card drag, KPI kartlarda count-up

---

### 5. Fayl xülasəsi

**Migration (1):**
- yeni cədvəllər + ALTER orders/order_items + RPC-lər + RLS + GRANT

**Yeni hooks (3):** `useQuotes`, `useSalesDashboard`, `useShipments`

**Yeni komponentlər `src/modules/sales/`:**
- `SalesDashboardPage.jsx`
- `QuotesPage.jsx`, `QuoteEditor.jsx`
- `OrdersPage.jsx` (redizayn), `OrderDrawer.jsx`
- `ShipmentsPage.jsx`
- `ProductPicker.jsx`, `LineItemsTable.jsx`, `StatusBadge.jsx`

**Dəyişənlər:**
- `src/App.jsx` — köhnə SalesPage-i əvəz + 3 yeni route + sidebar sub-menu
- `src/data.js` — nav item-lar
- `src/config/routes.js` və `src/config/page-meta.js` — yeni route-lar
- `src/styles.css` — status token-ları

---

### İcra sırası (təsdiqlədikdə)
1. Migration
2. Hooks + ortaq komponentlər (ProductPicker, LineItemsTable, StatusBadge)
3. Dashboard səhifəsi (tez dəyər verir)
4. Kotirovkalar + QuoteEditor
5. Sifarişlər redizayn + OrderDrawer
6. Çatdırılmalar
7. Sidebar/route inteqrasiyası + polish

Təsdiqləsən başlayıram.