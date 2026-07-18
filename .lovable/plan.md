# customers / products / orders — Supabase inteqrasiyası

## Vəziyyət

`src/App.jsx` (20 700+ sətir) `useState(loadPersistentState())` ilə tək bir `state` obyekti saxlayır. Bu state 100+ yerdə `state.customers`, `state.orders`, `state.products` kimi oxunur və mock məlumatın **fərqli forması** var:

**Legacy (localStorage) forması:**
- `orders`: `{ id, customer, fin, amount, paid, products, productLines[], status: "Təhvil verilib", deliveryDate, ... }`
- `customers`: `{ id, name, fin, phone, segment, ... }`
- `products`: `{ id, name, sku, price, status: "Aktiv" }`

**DB forması:**
- `orders`: `{ id, tenant_id, order_no, customer_id, order_date, status: enum, subtotal, vat_total, total, items[] }`
- `customers`: `{ id, tenant_id, name, email, phone, address, tax_id }`
- `products`: `{ id, tenant_id, sku, name, price, vat_rate, is_active }`

Forması fərqli olduğu üçün birbaşa əvəzləmə **onlarca hesabat, KPI, faktura, mühasibat** məntiqini sındıracaq (`buildInvoiceRows`, `buildCrmPipelineRows`, `buildAccountingData`, `buildReceivableRows` və s. — hamısı `order.amount / order.paid / order.customer / order.fin` sahələrini istifadə edir).

## Yanaşma: 3 addımlı mərhələli miqrasiya

### Addım A — Adapter qatı (bu turda)
`src/shared/adapters/erpShape.js` yarat:
- `dbOrderToLegacy(dbOrder, customersMap)` → legacy formaya çevirir (`amount = total`, `paid = 0`, `customer = customer.name`, `status = "Yeni"` və s.)
- `dbCustomerToLegacy(c)`, `dbProductToLegacy(p)`
- Əks istiqamət: `legacyOrderToDb(o, customersMap)` — yeni sifariş yaradarkən DB-yə yazmaq üçün

### Addım B — Read-bridge (bu turda)
App.jsx-də:
- `useAuth()` və `useCustomers/useProducts/useOrders(activeTenantId)` çağır
- Yeni `useEffect`: DB-dən gələn məlumat dolu olduqda `setState(prev => ({ ...prev, customers: mapped, products: mapped, orders: mapped }))` — mock-u əvəz edir
- Boş olduqda mock qalır (yumşaq keçid)

### Addım C — Write-bridge (növbəti turda, ayrıca)
`dispatch`/`setState` üzərindən keçən `add-order`, `add-customer`, `add-product` axınlarını tapıb (əsasən modal `onSubmit`-lər) DB hook-larının `create/update/remove` metodlarına yönləndirmək. Realtime avtomatik olaraq oxunuşu yeniləyəcək.

Bu addım daha risklidir çünki 20+ modal/form var; ona görə A+B-dən sonra ayrıca aparılmalıdır.

## Bu turda etməyəcəyim

- Legacy sahələri (məsələn `order.paid`, `credits`, `productLines[]`) tam sxemə köçürmək — bunun üçün ayrıca `payments`, `order_lines_extended` cədvəlləri lazım gələcək.
- Hesabat funksiyalarını (100+ `build*` funksiyası) sındırmadan yenidən yazmaq. Adapter onları qoruyur.

## Nəticə

Bu turdan sonra: DB-dəki `customers/products/orders` UI-da görünəcək (realtime), amma yeni yaradılan yazılar hələ də localStorage-a düşəcək. **Addım C** əlavə mesaj tələb edir.

Davam edim?