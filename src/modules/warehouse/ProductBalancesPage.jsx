import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, CircleDollarSign, ExternalLink, History, Package, RotateCcw, ShoppingCart, Users, X } from "lucide-react";
import { getRecommendedOrderPlan, WarehouseBalancesWorkspace } from "../../shared/lib/appDomain.jsx";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { shortProcurementDocumentNo } from "../procurement/documentNumbers.js";
import ProductReturnsPanel from "./ProductReturnsPanel.jsx";
import { buildAverageCostHistory, movementKind } from "./inventory360.js";

const money = (value) => `${Number(value || 0).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;
const number = (value) => Number(value || 0).toLocaleString("az-AZ");
const dateTime = (value) => value ? new Date(value).toLocaleString("az-AZ") : "—";
const movementType = (item) => item?.movement_type || item?.move_type || "";

function DocumentButton({ children, onClick, title }) {
  if (!onClick) return children || "—";
  return <button type="button" className="product-history-link" onClick={onClick} title={title}>
    <span>{children}</span><ExternalLink size={13} />
  </button>;
}

function productLineMatches(line, product) {
  return String(line?.productId || line?.product_id || "") === String(product?.id || "")
    || String(line?.product || line?.name || "").trim().toLocaleLowerCase("az") === String(product?.name || "").trim().toLocaleLowerCase("az");
}

export function buildProductWarehouseBalances(product, warehouses = [], warehouseStock = {}, inventoryBalances = []) {
  const warehouseById = new Map(warehouses.map((warehouse) => [String(warehouse.id), warehouse]));
  const liveRows = inventoryBalances
    .filter((row) => String(row.product_id || row.product?.id || "") === String(product?.id || "") || productLineMatches(row, product))
    .map((row) => {
      const warehouseId = String(row.warehouse_id || row.warehouse?.id || "");
      const total = Number(row.on_hand ?? row.qty ?? row.quantity ?? row.total ?? 0) || 0;
      const reserved = Number(row.reserved ?? row.reserved_quantity ?? 0) || 0;
      const problem = Number(row.problem_qty ?? row.problemQty ?? row.problem ?? 0) || 0;
      return {
        warehouse: warehouseById.get(warehouseId) || row.warehouse || { id: warehouseId, name: "Naməlum anbar" },
        total,
        reserved,
        problem,
        available: total - reserved - problem,
      };
    });
  if (liveRows.length) return liveRows.filter((row) => row.total || row.reserved);
  return warehouses.map((warehouse) => {
    const row = (warehouseStock?.[warehouse.id] || []).find((item) => productLineMatches(item, product));
    const total = Number(row?.on_hand ?? row?.qty ?? row?.total ?? row?.quantity ?? 0) || 0;
    const reserved = Number(row?.reserved ?? row?.reserved_quantity ?? 0) || 0;
    const problem = Number(row?.problem_qty ?? row?.problemQty ?? row?.problem ?? 0) || 0;
    return { warehouse, total, reserved, problem, available: total - reserved - problem };
  }).filter((row) => row.total || row.reserved);
}

function Product360Modal({ product, warehouses, warehouseStock, inventoryBalances, purchaseOrders, orders, movements, loadingMovements, reservations, receiptLinks, loadingLinks, onClose, onEdit, onOpenOrder, onOpenProcurement }) {
  const [tab, setTab] = useState("stock");
  const balances = useMemo(
    () => buildProductWarehouseBalances(product, warehouses, warehouseStock, inventoryBalances),
    [product, warehouses, warehouseStock, inventoryBalances],
  );

  const sales = useMemo(() => orders.flatMap((order) => (order.productLines || [])
    .filter((line) => productLineMatches(line, product))
    .map((line) => ({ order, line, qty: Number(line.qty || line.quantity || 0), total: Number(line.total ?? (line.price || 0) * (line.qty || line.quantity || 0)) })))
    .sort((a, b) => String(b.order.date || b.order.created_at || "").localeCompare(String(a.order.date || a.order.created_at || ""))), [orders, product]);

  const productMovements = useMemo(() => movements.filter((item) =>
    String(item.product_id || item.product?.id || "") === String(product.id)
    || String(item.sku || item.product?.sku || "") === String(product.sku || "")), [movements, product]);
  const costHistory = useMemo(() => buildAverageCostHistory(productMovements, product.salePrice || product.price || 0).reverse(), [productMovements, product.salePrice, product.price]);
  const incoming = productMovements.filter((item) => ["in", "receipt", "transfer_in"].includes(movementType(item)));
  const activeReservations = reservations.filter((item) => item.status === "active");
  const total = balances.reduce((sum, item) => sum + item.total, 0);
  const reserved = balances.reduce((sum, item) => sum + item.reserved, 0);
  const problem = balances.reduce((sum, item) => sum + Number(item.problem || 0), 0);
  const soldQty = sales.reduce((sum, item) => sum + item.qty, 0);
  const soldValue = sales.reduce((sum, item) => sum + item.total, 0);
  const receivedQty = incoming.reduce((sum, item) => sum + Math.abs(Number(item.qty ?? item.quantity ?? 0)), 0);
  const available = total - reserved - problem;
  const minimumStock = Math.max(0, Number(product.reorderLevel || 0));
  const baseOrderQty = Math.max(0, Number(product.recommendedOrderQty || 0));
  const orderedQty = (purchaseOrders || []).reduce((sum, po) => {
    const matches = String(po.product || "").trim().toLocaleLowerCase("az") === String(product.name || "").trim().toLocaleLowerCase("az");
    return matches ? sum + Math.max(0, Number(po.qty || 0)) : sum;
  }, 0);
  const recommendation = getRecommendedOrderPlan({ available, minimum: minimumStock, baseQty: baseOrderQty, orderedQty });

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="product-360-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card product-360-card">
        <div className="modal-head product-360-head">
          <div className="product-360-title-wrap">
            <div className="product-360-photo">
              {product.imageUrl || product.image_url ? <img src={product.imageUrl || product.image_url} alt={`${product.name} şəkli`} /> : <Package size={25} />}
            </div>
            <div>
              <span style={{ color: "#0b7a5c", fontWeight: 700, fontSize: 13 }}>MƏHSUL 360</span>
              <h2 id="product-360-title" style={{ margin: "4px 0" }}>{product.name}</h2>
              <p style={{ margin: 0 }}>{product.sku || "SKU yoxdur"} · {product.category || "Kateqoriyasız"}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="secondary-btn" onClick={() => onEdit(product.id)}>Redaktə et</button>
            <button type="button" className="secondary-btn" onClick={onClose} aria-label="Bağla"><X size={18} /></button>
          </div>
        </div>
        <div className="product-360-body">
          <div className="product-360-metrics">
            <div className="product-360-metric"><span>Cari qalıq</span><strong>{number(total)}</strong><small>{balances.length} anbarda</small></div>
            <div className="product-360-metric success"><span>Satışa uyğun</span><strong>{number(available)}</strong><small>{money(available * Number(product.salePrice || product.price || 0))}</small></div>
            <button type="button" className="product-360-metric product-360-summary-button" onClick={() => setTab("reservations")}><span>Rezerv</span><strong>{number(reserved)}</strong><small>{activeReservations.length} aktiv rezerv · bax</small></button>
            <button type="button" className={`product-360-metric product-360-summary-button ${problem > 0 ? "attention" : ""}`} onClick={() => setTab("returns")}><span>Problemli stok</span><strong>{number(problem)}</strong><small>{problem > 0 ? "idarəetmə tarixçəsinə bax" : "problemli məhsul yoxdur"}</small></button>
            <div className="product-360-metric"><span>Minimum stok</span><strong>{number(minimumStock)}</strong><small>təyin edilmiş hədd</small></div>
            <div className="product-360-metric"><span>Açıq PO-da</span><strong>{number(orderedQty)}</strong><small>yolda olan məhsul</small></div>
            <div className={`product-360-metric recommendation ${recommendation.additionalQty > 0 ? "attention" : ""}`}><span>Tövsiyə sifariş</span><strong>{number(recommendation.recommendedQty)}</strong><small>{recommendation.additionalQty > 0 ? `əlavə ${number(recommendation.additionalQty)} alınmalı` : recommendation.recommendedQty > 0 ? "açıq PO qarşılayır" : "hazırda tələb yoxdur"}</small></div>
          </div>

          <div className="product-360-flow-strip">
            <div><span>Baza sifariş</span><strong>{number(baseOrderQty)}</strong></div>
            <div><span>Minimum çatışmazlığı</span><strong>+{number(recommendation.deficit)}</strong></div>
            <div><span>Ümumi satış</span><strong>{number(soldQty)} · {money(soldValue)}</strong></div>
            <div><span>Daxilolma</span><strong>{number(receivedQty)} · {incoming.length} əməliyyat</strong></div>
          </div>

          <div className="warehouse-balance-tabs" role="tablist" style={{ marginBottom: 16 }}>
            {[["stock", `Qalıq (${balances.length})`, Package], ["cost", `Maya tarixçəsi (${costHistory.length})`, CircleDollarSign], ["returns", "Problemli stok", RotateCcw], ["reservations", `Rezervlər (${activeReservations.length})`, Users], ["sales", `Satışlar (${sales.length})`, ShoppingCart], ["receipts", `Daxilolmalar (${incoming.length})`, ArrowDownToLine], ["history", `Stok 360 (${productMovements.length})`, History]].map(([key, label, Icon]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={15} /> {label}</button>
            ))}
          </div>

          {tab === "stock" && <HistoryTable title="Anbarlar üzrə qalıq" empty="Bu məhsul üzrə anbar qalığı yoxdur." headers={["Anbar", "Fiziki qalıq", "Rezerv", "Problemli", "Satışa uyğun"]} rows={balances.map(({ warehouse, total: qty, reserved: hold, problem: problemQty, available }) => [warehouse.name, number(qty), number(hold), number(problemQty), number(available)])} />}
          {tab === "cost" && <HistoryTable title="Orta maya və satış marjası tarixçəsi" empty="Maya hesablayan stok hərəkəti yoxdur." headers={["Tarix", "Əməliyyat", "Miqdar sonrası", "Əvvəlki maya", "Yeni orta maya", "Marja", "Marja %"]} rows={costHistory.map((row) => [dateTime(row.item.moved_at || row.item.created_at), row.type, number(row.quantity), money(row.previousCost), money(row.averageCost), money(row.margin), `${row.marginPct.toFixed(1)}%`])} />}
          {tab === "returns" && <ProductReturnsPanel product={product} warehouses={warehouses} />}
          {tab === "reservations" && <HistoryTable loading={loadingLinks} title="Aktiv rezervlər" empty="Bu məhsul üzrə aktiv rezerv yoxdur." headers={["Tarix", "Sifariş", "Müştəri", "Anbar", "Miqdar", "Rezerv edən", "Status"]} rows={activeReservations.map((item) => [dateTime(item.created_at), <DocumentButton onClick={() => onOpenOrder?.(item.order_id)} title="Sifarişi aç">{item.order?.order_no || item.order_id}</DocumentButton>, item.order?.customer?.name || "—", item.warehouse?.name || "—", number(item.quantity), item.creatorName || "Sistem istifadəçisi", "Aktiv"])} />}
          {tab === "sales" && <HistoryTable title="Satış tarixçəsi" empty="Bu məhsul üzrə satış tapılmadı." headers={["Tarix", "Sifariş", "Müştəri", "Miqdar", "Məbləğ", "Status"]} rows={sales.map(({ order, qty, total: amount }) => [dateTime(order.date || order.created_at), <DocumentButton onClick={() => onOpenOrder?.(order.id || order.order_id || order.orderNo || order.order_no)} title="Sifarişi aç">{order.orderNo || order.order_no || order.id || "—"}</DocumentButton>, order.customer?.name || order.customer || order.customerName || "—", number(qty), money(amount), order.status || "—"])} />}
          {tab === "receipts" && <HistoryTable loading={loadingMovements || loadingLinks} title="Daxilolmalar" empty="Bu məhsul üzrə daxilolma tapılmadı." headers={["Tarix", "Anbar", "Miqdar", "Vahid maya", "Qəbul sənədi", "Göndəriş", "Qeyd"]} rows={incoming.map((item) => { const link = receiptLinks[item.id] || receiptLinks[item.reference_id]; return [dateTime(item.moved_at || item.created_at), item.warehouse?.name || "—", `+${number(Math.abs(item.qty ?? item.quantity ?? 0))}`, money(item.unit_cost), <DocumentButton onClick={link ? () => onOpenProcurement?.(link) : null} title="Qəbul sənədini aç">{shortProcurementDocumentNo(link?.receipt_no || item.doc_no || item.reference)}</DocumentButton>, shortProcurementDocumentNo(link?.shipment_no), item.note || "—"]; })} />}
          {tab === "history" && <HistoryTable loading={loadingMovements || loadingLinks} title="Məhsulun vahid stok hərəkəti tarixçəsi" empty="Bu məhsul üzrə stok hərəkəti tapılmadı." headers={["Tarix", "Əməliyyat", "Anbar", "Miqdar", "Maya", "Bağlı sənəd", "Qeyd"]} rows={productMovements.map((item) => { const reservation = reservations.find((row) => String(row.id) === String(item.reference_id)); const receipt = receiptLinks[item.id] || receiptLinks[item.reference_id]; const document = reservation ? <DocumentButton onClick={() => onOpenOrder?.(reservation.order_id)}>{reservation.order?.order_no || reservation.order_id}</DocumentButton> : receipt ? <DocumentButton onClick={() => onOpenProcurement?.(receipt)}>{shortProcurementDocumentNo(receipt.receipt_no || receipt.shipment_no)}</DocumentButton> : item.doc_no || item.reference || item.reference_type || "—"; return [dateTime(item.moved_at||item.created_at), movementKind(item), item.warehouse?.name || "—", number(item.qty??item.quantity), money(item.unit_cost), document, item.note || "—"]; })} />}
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

export default function ProductBalancesPage({ warehouses = [], warehouseStock = {}, inventoryBalances = [], products = [], purchaseOrders = [], orders = [], stockMovements = [], fetchAllMovements, onReceiveStock, onOpenImport, onCreateProduct, onEditProduct, onOpenWarehouse, onOpenSalesOrder, onOpenProcurementDocument, onTrackAction }) {
  const { activeTenantId } = useAuth();
  const [query, setQuery] = useState("");
  const [livePurchaseOrders, setLivePurchaseOrders] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [movements, setMovements] = useState(stockMovements);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [receiptLinks, setReceiptLinks] = useState({});
  const [loadingLinks, setLoadingLinks] = useState(false);
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

  useEffect(() => {
    if (!selectedId || !activeTenantId) return;
    let active = true;
    setLoadingLinks(true);
    (async () => {
      const [reservationResult, receiptLineResult] = await Promise.all([
        supabase.from("stock_reservations").select("id,order_id,warehouse_id,quantity,status,created_by,created_at,order:orders(id,order_no,status,customer:customers(id,name)),warehouse:warehouses(id,name)").eq("tenant_id", activeTenantId).eq("product_id", selectedId).order("created_at", { ascending: false }),
        supabase.from("procurement_receipt_lines").select("id,receipt_id,stock_movement_id,received_qty,unit_landed_cost").eq("product_id", selectedId),
      ]);
      if (reservationResult.error) throw reservationResult.error;
      if (receiptLineResult.error) throw receiptLineResult.error;
      const creatorIds = [...new Set((reservationResult.data || []).map((row) => row.created_by).filter(Boolean))];
      const receiptIds = [...new Set((receiptLineResult.data || []).map((row) => row.receipt_id).filter(Boolean))];
      const [employeeResult, receiptResult] = await Promise.all([
        creatorIds.length ? supabase.from("employees").select("user_id,full_name").eq("tenant_id", activeTenantId).in("user_id", creatorIds) : Promise.resolve({ data: [], error: null }),
        receiptIds.length ? supabase.from("procurement_receipts").select("id,receipt_no,shipment_id,receipt_date,shipment:procurement_shipments(id,shipment_no,status)").in("id", receiptIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (employeeResult.error) throw employeeResult.error;
      if (receiptResult.error) throw receiptResult.error;
      const employeeByUser = new Map((employeeResult.data || []).map((row) => [row.user_id, row.full_name]));
      const receiptById = new Map((receiptResult.data || []).map((row) => [row.id, row]));
      const links = {};
      (receiptLineResult.data || []).forEach((line) => {
        const receipt = receiptById.get(line.receipt_id);
        if (!receipt) return;
        const value = { ...receipt, shipment_no: receipt.shipment?.shipment_no || "—" };
        links[line.stock_movement_id || line.id] = value;
        links[line.receipt_id] = value;
      });
      if (active) {
        setReservations((reservationResult.data || []).map((row) => ({ ...row, creatorName: employeeByUser.get(row.created_by) || null })));
        setReceiptLinks(links);
      }
    })().catch(() => { if (active) { setReservations([]); setReceiptLinks({}); } }).finally(() => active && setLoadingLinks(false));
    return () => { active = false; };
  }, [selectedId, activeTenantId]);

  return <div className="stack warehouse-module product-balances-page">
    <WarehouseBalancesWorkspace warehouses={warehouses} warehouseStock={warehouseStock} products={products} purchaseOrders={livePurchaseOrders??purchaseOrders} query={query} onQueryChange={setQuery} onReceiveStock={onReceiveStock} onOpenImport={onOpenImport} onCreateProduct={onCreateProduct} onEditProduct={onEditProduct} onOpenProduct={setSelectedId} onOpenOperations={() => onOpenWarehouse?.("all")} onTrackAction={onTrackAction} />
    {selectedProduct && <Product360Modal product={selectedProduct} warehouses={warehouses} warehouseStock={warehouseStock} inventoryBalances={inventoryBalances} purchaseOrders={livePurchaseOrders ?? purchaseOrders} orders={orders} movements={movements} loadingMovements={loadingMovements} reservations={reservations} receiptLinks={receiptLinks} loadingLinks={loadingLinks} onClose={() => setSelectedId(null)} onEdit={onEditProduct} onOpenOrder={onOpenSalesOrder} onOpenProcurement={onOpenProcurementDocument} />}
  </div>;
}
