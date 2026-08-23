import { CalendarClock, Check, CircleAlert, Download, Filter, Search, Truck } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import { lazy, useMemo, useState } from "react";
import { money, normalize } from "../services/format.js";
import { OrderProductLines, currentBusinessDate, enrichDeliveryOrder, exportDeliveryQueueCsv, getDeliveryDisplayStage, getDeliveryStockCheck, getDeliveryTotalQuantity, getOrderPaymentMethod, isDeliveryQueueOrder, summarizeOrderProducts } from "../shared/lib/appDomain.jsx";

function getSalesDocumentNumber(order) {
  return order?.orderNo || order?.order_no || order?.id || "—";
}

export default function DeliveriesPage({ orders, warehouseStock = {}, warehouses = [], onCompleteDelivery }) {
  const [deliveryFilter, setDeliveryFilter] = useState("Hamısı");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const [acceptance, setAcceptance] = useState({ recipientName: "", documentNo: "", warehouseEmployeeName: "", signatureConfirmed: false, note: "" });
  const warehouseById = useMemo(() => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])), [warehouses]);

  function decorateDeliveryOrder(order) {
    const warehouseId = order.warehouseId || warehouses[0]?.id || "";
    const warehouse = warehouseById.get(warehouseId);
    const orderWithWarehouse = { ...order, warehouseId };
    const enriched = enrichDeliveryOrder(orderWithWarehouse);
    const stockCheck = getDeliveryStockCheck(orderWithWarehouse, warehouseStock);

    return {
      ...enriched,
      warehouseId,
      warehouseName: order.warehouseName || warehouse?.name || warehouseId,
      stockCheck,
      displayStage: getDeliveryDisplayStage(order),
      deliveryQty: getDeliveryTotalQuantity(order),
    };
  }

  const deliveryOrders = useMemo(
    () =>
      orders
        .filter(isDeliveryQueueOrder)
        .map(decorateDeliveryOrder),
    [orders, warehouseStock, warehouses, warehouseById],
  );

  const completedOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === "Təhvil verilib")
        .map(decorateDeliveryOrder)
        .sort((a, b) => (parsePaymentDate(b.deliveredAt)?.getTime() || 0) - (parsePaymentDate(a.deliveredAt)?.getTime() || 0))
        .slice(0, 6),
    [orders, warehouseStock, warehouses, warehouseById],
  );

  const readyOrders = deliveryOrders.filter((order) => order.stockCheck.ok);
  const blockedOrders = deliveryOrders.filter((order) => !order.stockCheck.ok);
  const creditOrders = deliveryOrders.filter((order) => getOrderPaymentMethod(order) === "Kredit");
  const totalQty = deliveryOrders.reduce((sum, order) => sum + Number(order.deliveryQty || 0), 0);
  const averageAge =
    deliveryOrders.length > 0
      ? Math.round(deliveryOrders.reduce((sum, order) => sum + order.ageDays, 0) / deliveryOrders.length)
      : 0;

  const filterItems = [
    { label: "Hamısı", count: deliveryOrders.length },
    { label: "Təhvilə hazır", count: readyOrders.length },
    { label: "Stok problemi", count: blockedOrders.length },
    { label: "Kredit", count: creditOrders.length },
    { label: "Nağd", count: deliveryOrders.filter((order) => getOrderPaymentMethod(order) !== "Kredit").length },
  ];

  const visibleOrders = deliveryOrders.filter((order) => {
    const searchText = normalize(
      [
        getSalesDocumentNumber(order),
        order.contractId,
        order.customer,
        order.fin,
        order.warehouseName,
        summarizeOrderProducts(order),
        getOrderPaymentMethod(order),
      ].join(" "),
    );
    const matchesSearch = !deliverySearch.trim() || searchText.includes(normalize(deliverySearch));
    const matchesWarehouse = warehouseFilter === "all" || order.warehouseId === warehouseFilter;
    const matchesFilter =
      deliveryFilter === "Hamısı" ||
      (deliveryFilter === "Təhvilə hazır" && order.stockCheck.ok) ||
      (deliveryFilter === "Stok problemi" && !order.stockCheck.ok) ||
      (deliveryFilter === "Kredit" && getOrderPaymentMethod(order) === "Kredit") ||
      (deliveryFilter === "Nağd" && getOrderPaymentMethod(order) !== "Kredit");
    return matchesSearch && matchesWarehouse && matchesFilter;
  });

  const selectedOrder =
    visibleOrders.find((order) => order.id === selectedDeliveryId) ||
    deliveryOrders.find((order) => order.id === selectedDeliveryId) ||
    visibleOrders[0] ||
    deliveryOrders[0];

  async function completeSelected(order) {
    if (!order || !order.stockCheck.ok) return;
    if (!acceptance.recipientName.trim() || !acceptance.warehouseEmployeeName.trim() || !acceptance.signatureConfirmed) return;
    await onCompleteDelivery(order.id, acceptance);
    setSelectedDeliveryId("");
    setAcceptance({ recipientName: "", documentNo: "", warehouseEmployeeName: "", signatureConfirmed: false, note: "" });
  }

  function exportVisibleDeliveries() {
    exportDeliveryQueueCsv(visibleOrders);
  }

  function openDeliveryCard(orderId) {
    setSelectedDeliveryId(orderId);
    window.requestAnimationFrame(() => {
      document.getElementById("delivery-detail-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Təhvil növbəsi" value={deliveryOrders.length} trend={`${totalQty} ədəd cihaz`} icon={Truck} tone="primary" />
        <MetricCard label="Təhvilə hazır" value={readyOrders.length} trend="Rezerv və stok uyğundur" icon={Check} tone="success" />
        <MetricCard label="Stok problemi" value={blockedOrders.length} trend="Bloklanmış təhvil" icon={CircleAlert} tone={blockedOrders.length ? "danger" : "success"} />
        <MetricCard label="Orta gözləmə" value={`${averageAge} gün`} trend={formatPaymentDate(parsePaymentDate(currentBusinessDate))} icon={CalendarClock} tone="info" />
      </section>

      <Panel className="delivery-control-panel">
        <PanelHeader
          title="Təhvil verilməli məhsullar"
          subtitle="Yalnız satışdan rezervə düşmüş və anbardan çıxarılmalı sifarişlər görünür"
          icon={Truck}
        />
        <div className="delivery-filter-toolbar delivery-command-bar">
          <div className="tabs delivery-filter-tabs">
            {filterItems.map((item) => (
              <button
                key={item.label}
                className={deliveryFilter === item.label ? "active" : ""}
                onClick={() => setDeliveryFilter(item.label)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
          <div className="delivery-filter-actions">
            <label className="delivery-driver-filter">
              <span>Anbar</span>
              <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
                <option value="all">Bütün anbarlar</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="delivery-search">
              <Search size={16} />
              <input
                value={deliverySearch}
                placeholder="Müştəri, sifariş və ya məhsul axtar..."
                onChange={(event) => setDeliverySearch(event.target.value)}
              />
            </label>
            <span className="delivery-result-count">{visibleOrders.length} sifariş göstərilir</span>
            <button className="secondary-btn delivery-export-btn" type="button" onClick={exportVisibleDeliveries}>
              <Download size={16} />
              CSV ixrac
            </button>
          </div>
        </div>
      </Panel>

      <section className="delivery-queue-layout">
        <Panel className="delivery-registry-panel delivery-registry-main">
          <PanelHeader title="Təhvil reyestri" subtitle="Sifarişi seçin, sonra təhvil kartında məlumatları yoxlayıb aktı tamamlayın" />
          <DataTable
            columns={["Sifariş və müştəri", "Məhsullar", "Anbar və stok", "Ödəniş", "Əməliyyat"]}
            rows={visibleOrders.map((order) => [
              <button
                className={`row-link ${selectedOrder?.id === order.id ? "active" : ""}`}
                onClick={() => setSelectedDeliveryId(order.id)}
              >
                <TwoLine
                  title={getSalesDocumentNumber(order)}
                  subtitle={`${order.customer} · ${order.contractId || "Müqaviləsiz"}`}
                />
              </button>,
              <OrderProductLines lines={order.productLines} />,
              <TwoLine
                title={order.warehouseName || "Anbar qeyd edilməyib"}
                subtitle={<StatusBadge status={order.stockCheck.status} />}
              />,
              <TwoLine
                title={order.paymentStatus || getOrderPaymentMethod(order)}
                subtitle={order.balance > 0 ? `${money(order.balance)} qalıq` : "Qalıq yoxdur"}
              />,
              <button
                className="text-btn"
                title={order.stockCheck.reason}
                onClick={() => openDeliveryCard(order.id)}
              >
                Kartı aç
              </button>,

            ])}
          />
        </Panel>

        <Panel className="delivery-detail-panel" id="delivery-detail-card">
          <PanelHeader title="Təhvil kartı" subtitle={selectedOrder ? getSalesDocumentNumber(selectedOrder) : "Sifariş seçilməyib"} />
          {selectedOrder ? (
            <div className="delivery-detail-card">
              <div className="delivery-detail-head">
                <div>
                  <h3>{selectedOrder.customer}</h3>
                  <span>{selectedOrder.address || "Ünvan qeyd edilməyib"}</span>
                </div>
                <StatusBadge status={selectedOrder.stockCheck.status} />
              </div>
              <div className="delivery-detail-grid">
                <div>
                  <span>Müqavilə</span>
                  <strong>{selectedOrder.contractId || "—"}</strong>
                  <small>Satış sənədi: {getSalesDocumentNumber(selectedOrder)}</small>
                </div>
                <div>
                  <span>Anbar</span>
                  <strong>{selectedOrder.warehouseName || "Anbar yoxdur"}</strong>
                  <small>{selectedOrder.displayStage}</small>
                </div>
                <div>
                  <span>Ödəniş</span>
                  <strong>{selectedOrder.paymentStatus || getOrderPaymentMethod(selectedOrder)}</strong>
                  <small>{selectedOrder.balance > 0 ? `${money(selectedOrder.balance)} qalıq` : "Qalıq yoxdur"}</small>
                </div>
                <div>
                  <span>Gözləmə</span>
                  <strong>{selectedOrder.ageDays} gün</strong>
                  <small>{selectedOrder.date || currentBusinessDate}</small>
                </div>
              </div>
              <OrderProductLines lines={selectedOrder.productLines} />
              {selectedOrder.stockCheck.plan?.lines?.length ? (
                <div className="delivery-plan-lines">
                  {selectedOrder.stockCheck.plan.lines.map((line) => (
                    <div className="delivery-plan-line" key={line.product}>
                      <span>{line.product}</span>
                      <small>
                        Sifariş {line.ordered} · Təhvil verilib {line.delivered} · İndi {line.deliverable}
                        {line.shortage > 0 ? ` · Backorder ${line.shortage}` : ""}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={`delivery-stock-check ${selectedOrder.stockCheck.ok ? "ok" : "danger"}`}>
                <div>
                  <strong>{selectedOrder.stockCheck.status}</strong>
                  <span>{selectedOrder.stockCheck.reason}</span>
                </div>
                <b>{selectedOrder.stockCheck.plan?.remainingTotal ?? selectedOrder.deliveryQty} ədəd</b>
              </div>
              <div className="delivery-acceptance-form">
                <strong>Təhvil aktı</strong>
                <label>
                  Təhvil alanın ad-soyadı
                  <input value={acceptance.recipientName} onChange={(event) => setAcceptance({ ...acceptance, recipientName: event.target.value })} placeholder="Müştəri və ya nümayəndə" />
                </label>
                <label>
                  Anbardan götürən əməkdaş
                  <input value={acceptance.warehouseEmployeeName} onChange={(event) => setAcceptance({ ...acceptance, warehouseEmployeeName: event.target.value })} placeholder="Əməkdaşın adı və soyadı" />
                </label>
                <label>
                  Sənəd nömrəsi
                  <input value={acceptance.documentNo} onChange={(event) => setAcceptance({ ...acceptance, documentNo: event.target.value })} placeholder="Ş/V və ya etibarnamə" />
                </label>
                <label className="delivery-acceptance-note">
                  Qeyd
                  <textarea value={acceptance.note} onChange={(event) => setAcceptance({ ...acceptance, note: event.target.value })} />
                </label>
                <label className="delivery-signature-check">
                  <input type="checkbox" checked={acceptance.signatureConfirmed} onChange={(event) => setAcceptance({ ...acceptance, signatureConfirmed: event.target.checked })} />
                  <span>Təhvil alan şəxs elektron imzanı təsdiqlədi</span>
                </label>
              </div>
              <button
                className="primary-btn full"
                disabled={!selectedOrder.stockCheck.ok || !acceptance.recipientName.trim() || !acceptance.warehouseEmployeeName.trim() || !acceptance.signatureConfirmed}
                title={selectedOrder.stockCheck.reason}
                onClick={() => completeSelected(selectedOrder)}
              >
                <Check size={16} />
                {selectedOrder.stockCheck.partial
                  ? `Qismən təhvil ver (${selectedOrder.stockCheck.plan.deliverableTotal})`
                  : "Təhvil verildi"}
              </button>

            </div>
          ) : (
            <EmptyState title="Təhvil gözləyən sifariş yoxdur" />
          )}
        </Panel>
      </section>

      <Panel className="delivery-history-panel">
        <PanelHeader title="Son təhvil tarixçəsi" subtitle="Tamamlanan sifarişlər yalnız izləmə üçün göstərilir" />
        <DataTable
          columns={["Sifariş", "Müştəri", "Cihaz", "Anbar", "Təhvil əməkdaşı", "Təhvil tarixi"]}
          rows={completedOrders.map((order) => [
            <strong>{getSalesDocumentNumber(order)}</strong>,
            <TwoLine title={order.customer} subtitle={order.fin} />,
            summarizeOrderProducts(order),
            order.warehouseName || "—",
            order.deliveryAcceptance?.warehouseEmployeeName || order.deliveredBy || "—",
            parsePaymentDate(order.deliveredAt) ? formatPaymentDate(parsePaymentDate(order.deliveredAt)) : "—",
          ])}
        />
      </Panel>
    </div>
  );
}

// FinancePage moved to ./pages/FinancePage.jsx (lazy chunk)
