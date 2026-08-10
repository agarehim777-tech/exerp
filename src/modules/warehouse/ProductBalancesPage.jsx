import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, History, Package, ShoppingCart, Warehouse, X } from "lucide-react";
import { WarehouseBalancesWorkspace } from "../../shared/lib/appDomain.jsx";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";

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
  const incoming = productMovements.filter((item) => ["in", "receipt", "transfer_in"].includes(item.move_type || item.movement_type));
  const total = balances.reduce((sum, item) => sum + item.total, 0);
  const reserved = balances.reduce((sum, item) => sum + item.reserved, 0);
  const soldQty = sales.reduce((sum, item) => sum + item.qty, 0);
  const soldValue = sales.reduce((sum, item) => sum + item.total, 0);
  const receivedQty = incoming.reduce((sum, item) => sum + Math.abs(Number(item.qty ?? item.quantity ?? 0)), 0);

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
          {tab === "receipts" && <HistoryTable loading={loadingMovements} title="Daxilolmalar" empty="Bu məhsul üzrə daxilolma tapılmadı." headers={["Tarix", "Anbar", "Miqdar", "Maya", "Sənəd", "Qeyd"]} rows={incoming.map((item) => [dateTime(item.moved_at || item.created_at), item.warehouse?.name || "—", `+${number(Math.abs(item.qty ?? item.quantity ?? 0))}`, money(item.unit_cost), item.doc_no || item.reference_type || item.reference || "—", item.note || "—"])} />}
          {tab === "history" && <HistoryTable loading={loadingMovements} title="Məhsulun bütün hərəkətləri" empty="Bu məhsul üzrə stok hərəkəti tapılmadı." headers={["Tarix", "Növ", "Anbar", "Miqdar", "Maya", "Sənəd / qeyd"]} rows={productMovements.map((item) => { const type=item.move_type||item.movement_type; return [dateTime(item.moved_at||item.created_at), ["in","receipt","transfer_in"].includes(type) ? "Daxilolma" : ["out","delivery","transfer_out","write_off"].includes(type) ? "Çıxış" : type || "Hərəkət", item.warehouse?.name || "—", number(item.qty??item.quantity), money(item.unit_cost), item.doc_no || item.reference_type || item.reference || item.note || "—"]; })} />}
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
  const { activeTenantId } = useAuth();
  const [query, setQuery] = useState("");
  const [livePurchaseOrders, setLivePurchaseOrders] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [movements, setMovements] = useState(stockMovements);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const selectedProduct = products.find((product) => String(product.id) === String(selectedId));

  useEffect(() => {
    if (!activeTenantId) { setLivePurchaseOrders([]); return; }
    let active = true;
    (async () => {
      const { data: pos, error: poError } = await supabase.from("purchase_orders").select("id,po_number,status,expected_date,currency").eq("tenant_id", activeTenantId).in("status", ["approved", "partial"]);
      if (poError) throw poError;
      const poIds = (pos || []).map((po) => po.id);
      if (!poIds.length) { if (active) setLivePurchaseOrders([]); return; }
      const [{ data: lines, error: lineError }, { data: grns, error: grnError }] = await Promise.all([
        supabase.from("purchase_order_lines").select("id,po_id,product_id,product_sku,description,qty_ordered,unit_price").in("po_id", poIds),
        supabase.from("goods_receipts").select("id,po_id").eq("tenant_id", activeTenantId).in("po_id", poIds),
      ]);
      if (lineError) throw lineError;
      if (grnError) throw grnError;
      const grnIds = (grns || []).map((grn) => grn.id);
      let receiptLines = [];
      if (grnIds.length) {
        const { data, error } = await supabase.from("goods_receipt_lines").select("grn_id,po_line_id,qty_received,qty_rejected").in("grn_id", grnIds);
        if (error) throw error;
        receiptLines = data || [];
      }
      const acceptedByLine = new Map();
      receiptLines.forEach((line) => acceptedByLine.set(line.po_line_id, (acceptedByLine.get(line.po_line_id) || 0) + Number(line.qty_received || 0) - Number(line.qty_rejected || 0)));
      const poById = new Map((pos || []).map((po) => [po.id, po]));
      const productById = new Map(products.map((product) => [String(product.id), product]));
      const productBySku = new Map(products.map((product) => [String(product.sku || "").toLocaleLowerCase("az"), product]));
      const coverage = (lines || []).map((line) => {
        const remaining = Math.max(0, Number(line.qty_ordered || 0) - Number(acceptedByLine.get(line.id) || 0));
        const product = productById.get(String(line.product_id || "")) || productBySku.get(String(line.product_sku || "").toLocaleLowerCase("az"));
        const po = poById.get(line.po_id);
        return { id: po?.po_number || line.po_id, product: product?.name || line.description || line.product_sku, qty: remaining, amount: remaining * Number(line.unit_price || 0), status: po?.status, expectedAt: po?.expected_date };
      }).filter((item) => item.qty > 0 && item.product);
      if (active) setLivePurchaseOrders(coverage);
    })().catch(() => { if (active) setLivePurchaseOrders([]); });
    return () => { active = false; };
  }, [activeTenantId, products]);

  useEffect(() => { if (!selectedId || !fetchAllMovements) return; let active = true; setLoadingMovements(true); fetchAllMovements().then((rows) => active && setMovements(rows || [])).finally(() => active && setLoadingMovements(false)); return () => { active = false; }; }, [selectedId, fetchAllMovements]);

  return <div className="stack warehouse-module product-balances-page">
    <WarehouseBalancesWorkspace warehouses={warehouses} warehouseStock={warehouseStock} products={products} purchaseOrders={livePurchaseOrders??purchaseOrders} query={query} onQueryChange={setQuery} onReceiveStock={onReceiveStock} onOpenImport={onOpenImport} onCreateProduct={onCreateProduct} onEditProduct={onEditProduct} onOpenProduct={setSelectedId} onSelectWarehouse={() => {}} onOpenOperations={onOpenWarehouse} onTrackAction={onTrackAction} />
    {selectedProduct && <Product360Modal product={selectedProduct} warehouses={warehouses} warehouseStock={warehouseStock} orders={orders} movements={movements} loadingMovements={loadingMovements} onClose={() => setSelectedId(null)} onEdit={onEditProduct} />}
  </div>;
}
