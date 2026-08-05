import { useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronRight,
  CircleAlert,
  Package,
  Plus,
  SlidersHorizontal,
  Warehouse,
} from "lucide-react";
import {
  DataTable,
  EmptyState,
  MetricCard,
  Panel,
  PanelHeader,
  ProgressRow,
  StatusBadge,
  TwoLine,
} from "../components/ui.jsx";
import { money, normalize, percent } from "../services/format.js";
import { InventoryUnitsPanel } from "../modules/warehouse/InventoryUnitsPanel.jsx";
import {
  WarehouseBalancesWorkspace,
  WarehouseControlPanel,
  WarehouseStockToolbar,
  WarehouseTransferPanel,
  WarehouseDistribution,
  DeliveryOrdersPanel,
  BarcodeBadge,
  buildAggregateWarehouseStock,
  buildWarehouseSummaries,
  getWarehouseStockSummary,
  buildWarehouseStockAlerts,
  buildWarehouseTransferSuggestions,
  filterRows,
  filterWarehouseItems,
  buildPurchaseOrderCoverage,
  buildWarehouseWmsRows,
  isDeliveryQueueOrder,
  getAvailableQuantity,
} from "../App.jsx";

export default WarehousePage;

function WarehousePage({
  warehouses,
  warehouseStock,
  products,
  orders,
  purchaseOrders = [],
  selectedWarehouseId,
  query,
  onSelect,
  onEdit,
  onDelete,
  onCompleteDelivery,
  onTransferStock,
  onReceiveStock,
  onOpenImport,
  onCreateProduct,
  onEditProduct,
  onTrackAction,
}) {
  const [warehouseStatusFilter, setWarehouseStatusFilter] = useState("HamД±sД±");
  const [stockFilter, setStockFilter] = useState("HamД±sД±");
  const operationsRef = useRef(null);
  const isAllWarehouses = selectedWarehouseId === "all";
  const selectedWarehouse = isAllWarehouses
    ? null
    : warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) || warehouses[0];
  const aggregateItems = buildAggregateWarehouseStock(warehouses, warehouseStock);
  const warehouseSummaries = buildWarehouseSummaries(warehouses, warehouseStock, products);
  const summaryByWarehouse = new Map(warehouseSummaries.map((summary) => [summary.warehouse.id, summary]));
  const aggregateSummary = getWarehouseStockSummary(
    aggregateItems,
    warehouses.reduce((sum, warehouse) => sum + Number(warehouse.capacity || 0), 0),
    products,
  );
  const selectedItems = isAllWarehouses
    ? aggregateItems
    : selectedWarehouse
      ? warehouseStock[selectedWarehouse.id] || []
      : [];
  const selectedSummary = isAllWarehouses
    ? aggregateSummary
    : summaryByWarehouse.get(selectedWarehouse?.id) || getWarehouseStockSummary([], 0, products);
  const stockAlerts = buildWarehouseStockAlerts(warehouses, warehouseStock, products);
  const transferSuggestions = buildWarehouseTransferSuggestions(warehouses, warehouseStock);
  const visibleWarehouses = filterRows(warehouses, query).filter((warehouse) =>
    warehouseStatusFilter === "HamД±sД±" ? true : warehouse.status === warehouseStatusFilter,
  );
  const warehouseList = visibleWarehouses.length > 0 ? visibleWarehouses : [];
  const visibleItems = filterWarehouseItems(filterRows(selectedItems, query), stockFilter);
  const purchaseOrderCoverage = useMemo(() => buildPurchaseOrderCoverage(purchaseOrders), [purchaseOrders]);
  const wmsRows = buildWarehouseWmsRows(visibleItems, products).map((row) => {
    const coverage = purchaseOrderCoverage.get(normalize(row.product)) || { orderedQty: 0, count: 0, latest: null };
    return {
      ...row,
      orderedQty: Number(coverage.orderedQty || 0),
      openPoCount: Number(coverage.count || 0),
      latestPoId: coverage.latest?.id || "",
      procurementStatus:
        row.reorderQty <= 0
          ? "Normal"
          : Number(coverage.orderedQty || 0) >= row.reorderQty
            ? "SifariЕџ verilib"
            : Number(coverage.orderedQty || 0) > 0
              ? "QismЙ™n sifariЕџdЙ™"
              : "SifariЕџ verilmЙ™yib",
    };
  });
  const reorderRows = wmsRows.filter((row) => row.reorderQty > 0);
  const deliveryOrders = orders.filter((order) => {
    if (!isDeliveryQueueOrder(order)) return false;
    if (isAllWarehouses) return true;
    return order.warehouseId === selectedWarehouse?.id;
  });
  const visibleStockAlerts = isAllWarehouses
    ? stockAlerts
    : stockAlerts.filter((alert) => alert.warehouseId === selectedWarehouse?.id);
  const visibleTransferSuggestions = isAllWarehouses
    ? transferSuggestions
    : transferSuggestions.filter(
        (suggestion) =>
          suggestion.fromWarehouseId === selectedWarehouse?.id || suggestion.toWarehouseId === selectedWarehouse?.id,
      );

  return (
    <div className="stack warehouse-module">
      <WarehouseBalancesWorkspace
        warehouses={warehouses}
        warehouseStock={warehouseStock}
        products={products}
        purchaseOrders={purchaseOrders}
        query={query}
        onReceiveStock={onReceiveStock}
        onOpenImport={onOpenImport}
        onCreateProduct={onCreateProduct}
        onEditProduct={onEditProduct}
        onSelectWarehouse={onSelect}
        onOpenOperations={() => {
          if (operationsRef.current) {
            operationsRef.current.open = true;
            operationsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
        onTrackAction={onTrackAction}
      />
      <InventoryUnitsPanel warehouses={warehouses} products={products} selectedWarehouseId={selectedWarehouseId} />
      <details className="warehouse-operations-drawer" ref={operationsRef}>
        <summary>
          <span><SlidersHorizontal size={17} /> Anbar Й™mЙ™liyyat nЙ™zarЙ™ti</span>
          <span>Anbarlar, transfer, tЙ™hvil vЙ™ WMS gГ¶rГјnГјЕџГј <ChevronRight size={16} /></span>
        </summary>
        <div className="warehouse-operations-body">
      <section className="metric-grid four">
        <MetricCard label="Anbar sayД±" value={warehouses.length} icon={Warehouse} tone="primary" />
        <MetricCard
          label="SatД±Еџ ГјГ§Гјn"
          value={`${aggregateSummary.available} Й™dЙ™d`}
          trend={`${aggregateSummary.total} Гјmumi stok`}
          icon={Boxes}
          tone="info"
        />
        <MetricCard
          label="RezervdЙ™"
          value={`${aggregateSummary.reserved} Й™dЙ™d`}
          trend={percent(aggregateSummary.reservedRate)}
          icon={Package}
          tone="warning"
        />
        <MetricCard
          label="Risk siqnalД±"
          value={stockAlerts.length}
          trend={`${deliveryOrders.length} tЙ™hvil nГ¶vbЙ™si`}
          icon={CircleAlert}
          tone={stockAlerts.length > 0 ? "danger" : "success"}
        />
      </section>

      <div className="warehouse-head-actions">
        <button className="secondary-btn" onClick={onCreateProduct}>
          <Plus size={16} />
          MЙ™hsul yarat
        </button>
        <button
          className="primary-btn"
          disabled={warehouses.length === 0}
          title={warehouses.length === 0 ? "ЖЏvvЙ™l anbar yaradД±n" : "Anbara mЙ™hsul mЙ™daxil edin"}
          onClick={onReceiveStock}
        >
          <Plus size={16} />
          MЙ™daxil et
        </button>
      </div>

      <WarehouseControlPanel
        summary={selectedSummary}
        deliveryCount={deliveryOrders.length}
        alerts={visibleStockAlerts}
        isAllWarehouses={isAllWarehouses}
        onSelect={onSelect}
      />

      <Panel className="wms-control-panel">
        <PanelHeader
          title="WMS Й™mЙ™liyyat nЙ™zarЙ™ti"
          subtitle="SKU, rЙ™f/bin, serial izlЙ™mЙ™, sayД±m dГ¶vrГј vЙ™ minimum stok nГ¶qtЙ™lЙ™ri"
          icon={Boxes}
        />
        <div className="wms-summary-grid">
          <div>
            <span>Serial izlЙ™nЙ™n</span>
            <strong>{wmsRows.filter((row) => row.serialMode === "IMEI/Serial").length}</strong>
            <small>BahalД± cihazlar</small>
          </div>
          <div>
            <span>SayД±mda</span>
            <strong>{wmsRows.filter((row) => row.cycleCount === "Bu hЙ™ftЙ™").length}</strong>
            <small>Cycle count prioriteti</small>
          </div>
          <div>
            <span>SatД±nalma siqnalД±</span>
            <strong>{reorderRows.length}</strong>
            <small>Minimum stokdan aЕџaДџД±</small>
          </div>
          <div>
            <span>Rezerv yГјkГј</span>
            <strong>{selectedSummary.reserved}</strong>
            <small>TЙ™hvilЙ™ baДџlД± stok</small>
          </div>
        </div>
        <DataTable
          columns={["SKU", "MЙ™hsul", "Barkod/QR", "Serial status", "Bin/RЙ™f", "Д°zlЙ™mЙ™", "SayД±m", "SatД±Еџ ГјГ§Гјn", "Reorder", "SifariЕџdЙ™", "Status"]}
          rows={wmsRows.slice(0, 8).map((row) => [
            <strong>{row.sku}</strong>,
            row.product,
            <BarcodeBadge barcode={row.barcode} qrPayload={row.qrPayload} />,
            <TwoLine
              title={row.sampleSerial}
              subtitle={`${row.serialSummary.available} anbarda В· ${row.serialSummary.reserved} rezerv В· ${row.serialSummary.sold} satД±lД±b`}
            />,
            row.bin,
            row.serialMode,
            row.cycleCount,
            row.available,
            row.reorderQty > 0 ? `${row.reorderQty} Й™dЙ™d` : "Yoxdur",
            row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} Й™dЙ™d`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "вЂ”",
            <StatusBadge status={row.procurementStatus || row.status} />,
          ])}
        />
      </Panel>

      <Panel className="product-catalog-panel">
        <PanelHeader title="MЙ™hsul kataloqu" subtitle="SKU, kateqoriya, qiymЙ™t vЙ™ minimum stok nЙ™zarЙ™ti" icon={Package} />
        <DataTable
          columns={["SKU", "MЙ™hsul", "Kateqoriya", "AlД±Еџ", "SatД±Еџ", "Minimum stok", "SifariЕџdЙ™", "Д°zlЙ™mЙ™", "ЖЏmЙ™liyyat"]}
          rows={products.map((product) => [
            <strong>{product.sku}</strong>,
            product.name,
            product.category,
            money(product.costPrice),
            money(product.salePrice),
            product.reorderLevel,
            (() => {
              const coverage = purchaseOrderCoverage.get(normalize(product.name));
              return coverage?.orderedQty > 0 ? <TwoLine title={`${coverage.orderedQty} Й™dЙ™d`} subtitle={coverage.latest?.id || `${coverage.count} PO`} /> : "вЂ”";
            })(),
            product.serialTracked ? "IMEI / Serial" : "Batch",
            <button className="text-btn" onClick={() => onEditProduct(product.id)}>RedaktЙ™</button>,
          ])}
        />
      </Panel>

      <section className="warehouse-layout">
        <Panel>
          <PanelHeader title="Anbarlar" subtitle="Гњmumi vЙ™ ya konkret anbar seГ§in" />
          <div className="warehouse-filter-row">
            <select
              aria-label="Anbar status filteri"
              value={warehouseStatusFilter}
              onChange={(event) => setWarehouseStatusFilter(event.target.value)}
            >
              <option>HamД±sД±</option>
              <option>Aktiv</option>
              <option>Passiv</option>
              <option>TЙ™mir</option>
            </select>
          </div>
          <div className="warehouse-card-list">
            <article className={`warehouse-card ${isAllWarehouses ? "active" : ""}`}>
              <button className="warehouse-main" onClick={() => onSelect("all")}>
                <div className="warehouse-card-head">
                  <div>
                    <strong>Гњmumi</strong>
                    <span>BГјtГјn anbarlar В· MЙ™cmu qalД±q</span>
                  </div>
                  <StatusBadge status="Toplam" />
                </div>
                <p>BГјtГјn anbarlar ГјzrЙ™ mallarД±n Гјmumi qalД±q vЙ™ satД±Еџ ГјГ§Гјn miqdarД±.</p>
                <div className="warehouse-stats">
                  <span>{aggregateItems.length} mЙ™hsul</span>
                  <span>{aggregateSummary.total} Й™dЙ™d</span>
                  <span>{aggregateSummary.available} satД±Еџ ГјГ§Гјn</span>
                </div>
                <ProgressRow label="" value={(aggregateSummary.available / Math.max(aggregateSummary.total, 1)) * 100} compact />
              </button>
              <div className="warehouse-actions">
                <button className="text-btn" onClick={() => onSelect("all")}>
                  ГњmumiyЙ™ bax
                </button>
              </div>
            </article>
            {warehouseList.map((warehouse) => {
              const items = warehouseStock[warehouse.id] || [];
              const warehouseSummary = summaryByWarehouse.get(warehouse.id) || getWarehouseStockSummary(items, warehouse.capacity, products);
              return (
                <article
                  className={`warehouse-card ${warehouse.id === selectedWarehouse?.id ? "active" : ""}`}
                  key={warehouse.id}
                >
                  <button className="warehouse-main" onClick={() => onSelect(warehouse.id)}>
                    <div className="warehouse-card-head">
                      <div>
                        <strong>{warehouse.name}</strong>
                        <span>{warehouse.code} В· {warehouse.city}</span>
                      </div>
                      <StatusBadge status={warehouse.status} />
                    </div>
                    <p>{warehouse.address}</p>
                    <div className="warehouse-stats">
                      <span>{items.length} mЙ™hsul</span>
                      <span>{warehouseSummary.available} satД±Еџ ГјГ§Гјn</span>
                      <span>{warehouseSummary.utilization}% doluluq</span>
                    </div>
                    <ProgressRow label="" value={warehouseSummary.utilization} compact />
                  </button>
                  <div className="warehouse-actions">
                    <button className="text-btn" onClick={() => onSelect(warehouse.id)}>
                      Daxil ol
                    </button>
                    <button className="text-btn" onClick={() => onEdit(warehouse.id)}>
                      RedaktЙ™
                    </button>
                    <button className="text-btn danger" onClick={() => onDelete(warehouse.id)}>
                      Sil
                    </button>
                  </div>
                </article>
              );
            })}
            {warehouseList.length === 0 && <EmptyState title="Anbar tapД±lmadД±" />}
          </div>
        </Panel>

        <Panel className="warehouse-detail-panel">
          {isAllWarehouses ? (
            <>
              <div className="warehouse-detail-head">
                <div>
                  <h2>Гњmumi anbar qalД±ДџД±</h2>
                  <p>BГјtГјn anbarlar ГјzrЙ™ mЙ™hsul qalД±qlarД± vЙ™ anbar paylanmasД±</p>
                </div>
              </div>
              <div className="warehouse-info-grid">
                <TwoLine title="Anbar sayД±" subtitle={`${warehouses.length} anbar`} />
                <TwoLine title="Unikal mЙ™hsul" subtitle={`${aggregateItems.length} mЙ™hsul`} />
                <TwoLine title="Гњmumi / rezerv" subtitle={`${aggregateSummary.total} / ${aggregateSummary.reserved} Й™dЙ™d`} />
                <TwoLine title="SatД±Еџ ГјГ§Гјn dЙ™yЙ™r" subtitle={money(aggregateSummary.value)} />
              </div>
              <WarehouseStockToolbar filter={stockFilter} setFilter={setStockFilter} />
              <DataTable
                columns={["MЙ™hsul", "Гњmumi", "Rezerv", "SatД±Еџ ГјГ§Гјn", "SifariЕџdЙ™", "Anbar paylanmasД±", "DЙ™yЙ™r", "Risk"]}
                rows={visibleItems.map((item) => [
                  <strong>{item.product}</strong>,
                  item.total,
                  item.reserved,
                  getAvailableQuantity(item),
                  (() => {
                    const coverage = purchaseOrderCoverage.get(normalize(item.product));
                    return coverage?.orderedQty > 0 ? <TwoLine title={`${coverage.orderedQty} Й™dЙ™d`} subtitle={coverage.latest?.id || `${coverage.count} PO`} /> : "вЂ”";
                  })(),
                  <WarehouseDistribution distribution={item.distribution} />,
                  money(getAvailableQuantity(item) * item.price),
                  getAvailableQuantity(item) <= 3 ? <StatusBadge status="AЕџaДџД± stok" /> : "Normal",
                ])}
              />
              <WarehouseTransferPanel
                suggestions={visibleTransferSuggestions}
                onTransferStock={onTransferStock}
              />
              <DeliveryOrdersPanel
                orders={deliveryOrders}
                isAllWarehouses={isAllWarehouses}
                warehouseStock={warehouseStock}
                onCompleteDelivery={onCompleteDelivery}
              />
            </>
          ) : selectedWarehouse ? (
            <>
              <div className="warehouse-detail-head">
                <div>
                  <h2>{selectedWarehouse.name}</h2>
                  <p>
                    {selectedWarehouse.code} В· {selectedWarehouse.type} В· {selectedWarehouse.city}
                  </p>
                </div>
                <div className="warehouse-head-actions">
                  <button className="secondary-btn" onClick={() => onEdit(selectedWarehouse.id)}>
                    RedaktЙ™ et
                  </button>
                  <button className="secondary-btn danger-outline" onClick={() => onDelete(selectedWarehouse.id)}>
                    Sil
                  </button>
                </div>
              </div>
              <div className="warehouse-info-grid">
                <TwoLine title="MЙ™sul ЕџЙ™xs" subtitle={selectedWarehouse.manager} />
                <TwoLine title="Гњnvan" subtitle={selectedWarehouse.address} />
                <TwoLine title="Tutum" subtitle={`${selectedSummary.total} / ${selectedWarehouse.capacity} Й™dЙ™d`} />
                <TwoLine title="SatД±Еџ ГјГ§Гјn dЙ™yЙ™r" subtitle={money(selectedSummary.value)} />
              </div>
              <WarehouseStockToolbar filter={stockFilter} setFilter={setStockFilter} />
              <DataTable
                columns={["MЙ™hsul", "Гњmumi", "Rezerv", "SatД±Еџ ГјГ§Гјn", "SifariЕџdЙ™", "QiymЙ™t", "DЙ™yЙ™r", "Risk"]}
                rows={visibleItems.map((item) => [
                  <strong>{item.product}</strong>,
                  item.total,
                  item.reserved,
                  getAvailableQuantity(item),
                  (() => {
                    const coverage = purchaseOrderCoverage.get(normalize(item.product));
                    return coverage?.orderedQty > 0 ? <TwoLine title={`${coverage.orderedQty} Й™dЙ™d`} subtitle={coverage.latest?.id || `${coverage.count} PO`} /> : "вЂ”";
                  })(),
                  money(item.price),
                  money(getAvailableQuantity(item) * item.price),
                  getAvailableQuantity(item) <= 3 ? <StatusBadge status="AЕџaДџД± stok" /> : "Normal",
                ])}
              />
              <WarehouseTransferPanel
                suggestions={visibleTransferSuggestions}
                onTransferStock={onTransferStock}
              />
              <DeliveryOrdersPanel
                orders={deliveryOrders}
                isAllWarehouses={isAllWarehouses}
                warehouseStock={warehouseStock}
                onCompleteDelivery={onCompleteDelivery}
              />
            </>
          ) : (
            <EmptyState title="Anbar seГ§ilmЙ™yib" />
          )}
        </Panel>
      </section>
        </div>
      </details>
    </div>
  );
}

