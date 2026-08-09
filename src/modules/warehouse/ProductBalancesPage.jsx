import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, History, Package, ShoppingCart, Warehouse, X } from "lucide-react";
import { WarehouseBalancesWorkspace } from "../../shared/lib/appDomain.jsx";

const money = (value) => `${Number(value || 0).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;
const number = (value) => Number(value || 0).toLocaleString("az-AZ");
const dateTime = (value) => value ? new Date(value).toLocaleString("az-AZ") : "—";

function productLineMatches(line, product) {
  return String(line?.productId || line?.product_id || "") === String(product?.id || "")
    || String(line?.product || line?.name || "").trim().toLocaleLowerCase("az") === String(product?.name || "").trim().toLocaleLowerCase("az");
}

function Product360Modal({ product, warehouses, warehouseStock, orders, movements, loadingMovements, onClose, onEdit }) {
  const [tab, setTab] = useState("overview");
  const balances = useMemo(() => warehouses.map((warehouse) => {
    const row = (warehouseStock?.[warehouse.id] || []).find((item) => productLineMatches(item, product));
    const total = Number(row?.total ?? row?.quantity ?? 0);
    const reserved = Number(row?.reserved ?? row?.reserved_quantity ?? 0);
    return { warehouse, total, reserved, available: total - reserved };
  }).filter((row) => row.total || row.reserved), [product, warehouses, warehouseStock]);

  const sales = useMemo(() => orders.flatMap((order) => (order.productLines || [])
    .filter((line) => productLineMatches(line, product))
    .map((line) => ({ order, line, qty: Number(line.qty || line.quantity || 0), total: Number(line.total ?? (line.price || 0) * (line.qty || line.quantity || 0)) })))
    .sort((a, b) => String(b.order.date || b.order.created_at || "").localeCompare(String(a.order.date || a.order.created_at || ""))), [orders, product]);

  const productMovements = useMemo(() => movements.filter((item) =>
    String(item.product_id || item.product?.id || "") === String(product.id)
    || String(item.sku || item.product?.sku || "") === String(product.sku || "")), [movements, product]);
  const incoming = productMovements.filter((item) => item.move_type === "in");
  const total = balances.reduce((sum, item) => sum + item.total, 0);
  const reserved = balances.reduce((sum, item) => sum + item.reserved, 0);
  const soldQty = sales.reduce((sum, item) => sum + item.qty, 0);
  const soldValue = sales.reduce((sum, item) => sum + item.total, 0);
  const receivedQty = incoming.reduce((sum, item) => sum + Math.abs(Number(item.qty || 0)), 0);

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="product-360-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card product-360-card" style={{ width: "min(1120px, calc(100vw - 32px))", maxHeight: "calc(100vh - 32px)", overflow: "auto" }}>
        <div className="modal-head" style={{ position: "sticky", top: 0, zIndex: 2, background: "#fff" }}>
          <div>
            <span style={{ color: "#0b7a5c", fontWeight: 700, fontSize: 13 }}>MƏHSUL 360</span>
            <h2 id="product-360-title" style={{ margin: "4px 0" }}>{product.name}</h2>
            <p style={{ margin: 0 }}>{product.sku || "SKU yoxdur"} · {product.category || "Kateqoriyasız"}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="secondary-btn" onClick={() => onEdit(product.id)}>Redaktə et</button>
            <button type="button" className="secondary-btn" onClick={onClose} aria-label="Bağla"><X size={18} /></button>
          </div>
        </div>
        <div style={{ padding: 22 }}>
          <div className="warehouse-control-grid" style={{ marginBottom: 20 }}>
            <div className="warehouse-control-tile"><span>Qalıq say</span><strong>{number(total)}</strong><small>{balances.length} anbarda</small></div>
            <div className="warehouse-control-tile"><span>Rezerv olunmuş</span><strong>{number(reserved)}</strong><small>aktiv rezerv</small></div>
            <div className="warehouse-control-tile"><span>Satışa uyğun</span><strong>{number(total - reserved)}</strong><small>{money((total - reserved) * Number(product.salePrice || product.price || 0))}</small></div>
            <div className="warehouse-control-tile"><span>Ümumi satış</span><strong>{number(soldQty)}</strong><small>{money(soldValue)}</small></div>
            <div className="warehouse-control-tile"><span>Daxilolma</span><strong>{number(receivedQty)}</strong><small>{incoming.length} əməliyyat</small></div>
          </div>

          <div className="warehouse-balance-tabs" role="tablist" style={{ marginBottom: 16 }}>
            {[["overview", "Ümumi baxış", Package], ["sales", `Satışlar (${sales.length})`, ShoppingCart], ["receipts", `Daxilolmalar (${incoming.length})`, ArrowDownToLine], ["history", `Bütün tarixçə (${productMovements.length})`, History]].map(([key, label, Icon]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={15} /> {label}</button>
            ))}
          </div>

          {tab === "overview" && <HistoryTable title="Anbarlar üzrə qalıq" empty="Bu məhsul üzrə anbar qalığı yoxdur." headers={["Anbar", "Qalıq", "Rezerv", "Satışa uyğun"]} rows={balances.map(({ warehouse, total: qty, reserved: hold, available }) => [warehouse.name, number(qty), number(hold), number(available)])} />}
          {tab === "sales" && <HistoryTable title="Satış tarixçəsi" empty="Bu məhsul üzrə satış tapılmadı." headers={["Tarix", "Sifariş", "Müştəri", "Miqdar", "Məbləğ", "Status"]} rows={sales.map(({ order, qty, total: amount }) => [dateTime(order.date || order.created_at), order.id || order.order_no || "—", order.customer || order.customerName || "—", number(qty), money(amount), order.status || "—"])} />}
          {tab === "receipts" && <HistoryTable loading={loadingMovements} title="Daxilolmalar" empty="Bu məhsul üzrə daxilolma tapılmadı." headers={["Tarix", "Anbar", "Miqdar", "Maya", "Sənəd", "Qeyd"]} rows={incoming.map((item) => [dateTime(item.moved_at), item.warehouse?.name || "—", `+${number(Math.abs(item.qty))}`, money(item.unit_cost), item.doc_no || item.reference || "—", item.note || "—"])} />}
          {tab === "history" && <HistoryTable loading={loadingMovements} title="Məhsulun bütün hərəkətləri" empty="Bu məhsul üzrə stok hərəkəti tapılmadı." headers={["Tarix", "Növ", "Anbar", "Miqdar", "Maya", "Sənəd / qeyd"]} rows={productMovements.map((item) => [dateTime(item.moved_at), item.move_type === "in" ? "Daxilolma" : item.move_type === "out" ? "Çıxış" : item.move_type || "Hərəkət", item.warehouse?.name || "—", number(item.qty), money(item.unit_cost), item.doc_no || item.reference || item.note || "—"])} />}
        </div>
      </div>
    </div>
  );
}

function HistoryTable({ title, headers, rows, empty, loading }) {
  return <section>
    <h3 style={{ margin: "0 0 12px", color: "#173a30", fontSize: 17 }}>{title}</h3>
    <div className="warehouse-balance-table-wrap">
      <table className="warehouse-balance-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{loading ? <tr><td colSpan={headers.length}>Tarixçə yüklənir…</td></tr> : rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="warehouse-balance-empty">{empty}</td></tr>}</tbody>
      </table>
    </div>
  </section>;
}

export default function ProductBalancesPage({ warehouses = [], warehouseStock = {}, products = [], purchaseOrders = [], orders = [], stockMovements = [], fetchAllMovements, onReceiveStock, onOpenImport, onCreateProduct, onEditProduct, onOpenWarehouse, onTrackAction }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [movements, setMovements] = useState(stockMovements);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const selectedProduct = products.find((product) => String(product.id) === String(selectedId));

  useEffect(() => { if (!selectedId || !fetchAllMovements) return; let active = true; setLoadingMovements(true); fetchAllMovements().then((rows) => active && setMovements(rows || [])).finally(() => active && setLoadingMovements(false)); return () => { active = false; }; }, [selectedId, fetchAllMovements]);

  return <div className="stack warehouse-module">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}><div><h1 style={{ margin: 0, fontSize: 26, color: "#12372c", display: "flex", alignItems: "center", gap: 9 }}><Package size={24} /> Məhsullar</h1><p style={{ margin: "6px 0 0", fontSize: 14, color: "#66756f" }}>Məhsulun qalığı, rezervi, satışa uyğun miqdarı və 360 tarixçəsi.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Məhsul, SKU və ya kateqoriya axtar…" style={{ width: 330, maxWidth: "100%", padding: "10px 12px", border: "1px solid #d8d1b9", borderRadius: 8, fontSize: 14 }} /></div>
    <WarehouseBalancesWorkspace warehouses={warehouses} warehouseStock={warehouseStock} products={products} purchaseOrders={purchaseOrders} query={query} onReceiveStock={onReceiveStock} onOpenImport={onOpenImport} onCreateProduct={onCreateProduct} onEditProduct={onEditProduct} onOpenProduct={setSelectedId} onSelectWarehouse={() => {}} onOpenOperations={onOpenWarehouse} onTrackAction={onTrackAction} />
    {selectedProduct && <Product360Modal product={selectedProduct} warehouses={warehouses} warehouseStock={warehouseStock} orders={orders} movements={movements} loadingMovements={loadingMovements} onClose={() => setSelectedId(null)} onEdit={onEditProduct} />}
  </div>;
}
