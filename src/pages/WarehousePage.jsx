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
  buildPurchaseOrderCoverage,
  isDeliveryQueueOrder,
} from "../shared/lib/appDomain.jsx";
import {
  BarcodeBadge,
  DeliveryOrdersPanel,
  WarehouseBalancesWorkspace,
  WarehouseControlPanel,
  WarehouseDistribution,
  WarehouseStockToolbar,
  WarehouseTransferPanel,
  buildAggregateWarehouseStock,
  buildWarehouseStockAlerts,
  buildWarehouseSummaries,
  buildWarehouseTransferSuggestions,
  buildWarehouseWmsRows,
  filterRows,
  filterWarehouseItems,
  getAvailableQuantity,
  getWarehouseStockSummary,
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
  const [warehouseStatusFilter, setWarehouseStatusFilter] = useState("Hamısı");
  const [stockFilter, setStockFilter] = useState("Hamısı");
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
    warehouseStatusFilter === "Hamısı" ? true : warehouse.status === warehouseStatusFilter,
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
            ? "Sifariş verilib"
            : Number(coverage.orderedQty || 0) > 0
              ? "Qismən sifarişdə"
              : "Sifariş verilməyib",
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
          <span><SlidersHorizontal size={17} /> Anbar əməliyyat nəzarəti</span>
          <span>Anbarlar, transfer, təhvil və WMS görünüşü <ChevronRight size={16} /></span>
        </summary>
        <div className="warehouse-operations-body">
      <section className="metric-grid four">
        <MetricCard label="Anbar sayı" value={warehouses.length} icon={Warehouse} tone="primary" />
        <MetricCard
          label="Satış üçün"
          value={`${aggregateSummary.available} ədəd`}
          trend={`${aggregateSummary.total} ümumi stok`}
          icon={Boxes}
          tone="info"
        />
        <MetricCard
          label="Rezervdə"
          value={`${aggregateSummary.reserved} ədəd`}
          trend={percent(aggregateSummary.reservedRate)}
          icon={Package}
          tone="warning"
        />
        <MetricCard
          label="Risk siqnalı"
          value={stockAlerts.length}
          trend={`${deliveryOrders.length} təhvil növbəsi`}
          icon={CircleAlert}
          tone={stockAlerts.length > 0 ? "danger" : "success"}
        />
      </section>

      <div className="warehouse-head-actions">
        <button className="secondary-btn" onClick={onCreateProduct}>
          <Plus size={16} />
          Məhsul yarat
        </button>
        <button
          className="primary-btn"
          disabled={warehouses.length === 0}
          title={warehouses.length === 0 ? "Əvvəl anbar yaradın" : "Anbara məhsul mədaxil edin"}
          onClick={onReceiveStock}
        >
          <Plus size={16} />
          Mədaxil et
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
          title="WMS əməliyyat nəzarəti"
          subtitle="SKU, rəf/bin, serial izləmə, sayım dövrü və minimum stok nöqtələri"
          icon={Boxes}
        />
        <div className="wms-summary-grid">
          <div>
            <span>Serial izlənən</span>
            <strong>{wmsRows.filter((row) => row.serialMode === "IMEI/Serial").length}</strong>
            <small>Bahalı cihazlar</small>
          </div>
          <div>
            <span>Sayımda</span>
            <strong>{wmsRows.filter((row) => row.cycleCount === "Bu həftə").length}</strong>
            <small>Cycle count prioriteti</small>
          </div>
          <div>
            <span>Satınalma siqnalı</span>
            <strong>{reorderRows.length}</strong>
            <small>Minimum stokdan aşağı</small>
          </div>
          <div>
            <span>Rezerv yükü</span>
            <strong>{selectedSummary.reserved}</strong>
            <small>Təhvilə bağlı stok</small>
          </div>
        </div>
        <DataTable
          columns={["SKU", "Məhsul", "Barkod/QR", "Serial status", "Bin/Rəf", "İzləmə", "Sayım", "Satış üçün", "Reorder", "Sifarişdə", "Status"]}
          rows={wmsRows.slice(0, 8).map((row) => [
            <strong>{row.sku}</strong>,
            row.product,
            <BarcodeBadge barcode={row.barcode} qrPayload={row.qrPayload} />,
            <TwoLine
              title={row.sampleSerial}
              subtitle={`${row.serialSummary.available} anbarda · ${row.serialSummary.reserved} rezerv · ${row.serialSummary.sold} satılıb`}
            />,
            row.bin,
            row.serialMode,
            row.cycleCount,
            row.available,
            row.reorderQty > 0 ? `${row.reorderQty} ədəd` : "Yoxdur",
            row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} ədəd`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "—",
            <StatusBadge status={row.procurementStatus || row.status} />,
          ])}
        />
      </Panel>

      <Panel className="product-catalog-panel">
        <PanelHeader title="Məhsul kataloqu" subtitle="SKU, kateqoriya, qiymət və minimum stok nəzarəti" icon={Package} />
        <DataTable
          columns={["SKU", "Məhsul", "Kateqoriya", "Alış", "Satış", "Minimum stok", "Sifarişdə", "İzləmə", "Əməliyyat"]}
          rows={products.map((product) => [
            <strong>{product.sku}</strong>,
            product.name,
            product.category,
            money(product.costPrice),
            money(product.salePrice),
            product.reorderLevel,
            (() => {
              const coverage = purchaseOrderCoverage.get(normalize(product.name));
              return coverage?.orderedQty > 0 ? <TwoLine title={`${coverage.orderedQty} ədəd`} subtitle={coverage.latest?.id || `${coverage.count} PO`} /> : "—";
            })(),
            product.serialTracked ? "IMEI / Serial" : "Batch",
            <button className="text-btn" onClick={() => onEditProduct(product.id)}>Redaktə</button>,
          ])}
        />
      </Panel>

      <section className="warehouse-layout">
        <Panel>
          <PanelHeader title="Anbarlar" subtitle="Ümumi və ya konkret anbar seçin" />
          <div className="warehouse-filter-row">
            <select
              aria-label="Anbar status filteri"
              value={warehouseStatusFilter}
              onChange={(event) => setWarehouseStatusFilter(event.target.value)}
            >
              <option>Hamısı</option>
              <option>Aktiv</option>
              <option>Passiv</option>
              <option>Təmir</option>
            </select>
          </div>
          <div className="warehouse-card-list">
            <article className={`warehouse-card ${isAllWarehouses ? "active" : ""}`}>
              <button className="warehouse-main" onClick={() => onSelect("all")}>
                <div className="warehouse-card-head">
                  <div>
                    <strong>Ümumi</strong>
                    <span>Bütün anbarlar · Məcmu qalıq</span>
                  </div>
                  <StatusBadge status="Toplam" />
                </div>
                <p>Bütün anbarlar üzrə malların ümumi qalıq və satış üçün miqdarı.</p>
                <div className="warehouse-stats">
                  <span>{aggregateItems.length} məhsul</span>
                  <span>{aggregateSummary.total} ədəd</span>
                  <span>{aggregateSummary.available} satış üçün</span>
                </div>
                <ProgressRow label="" value={(aggregateSummary.available / Math.max(aggregateSummary.total, 1)) * 100} compact />
              </button>
              <div className="warehouse-actions">
                <button className="text-btn" onClick={() => onSelect("all")}>
                  Ümumiyə bax
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
                        <span>{warehouse.code} · {warehouse.city}</span>
                      </div>
                      <StatusBadge status={warehouse.status} />
                    </div>
                    <p>{warehouse.address}</p>
                    <div className="warehouse-stats">
                      <span>{items.length} məhsul</span>
                      <span>{warehouseSummary.available} satış üçün</span>
                      <span>{warehouseSummary.utilization}% doluluq</span>
                    </div>
                    <ProgressRow label="" value={warehouseSummary.utilization} compact />
                  </button>
                  <div className="warehouse-actions">
                    <button className="text-btn" onClick={() => onSelect(warehouse.id)}>
                      Daxil ol
                    </button>
                    <button className="text-btn" onClick={() => onEdit(warehouse.id)}>
                      Redaktə
                    </button>
                    <button className="text-btn danger" onClick={() => onDelete(warehouse.id)}>
                      Sil
                    </button>
                  </div>
                </article>
              );
            })}
            {warehouseList.length === 0 && <EmptyState title="Anbar tapılmadı" />}
          </div>
        </Panel>

        <Panel className="warehouse-detail-panel">
          {isAllWarehouses ? (
            <>
              <div className="warehouse-detail-head">
                <div>
                  <h2>Ümumi anbar qalığı</h2>
                  <p>Bütün anbarlar üzrə məhsul qalıqları və anbar paylanması</p>
                </div>
              </div>
              <div className="warehouse-info-grid">
                <TwoLine title="Anbar sayı" subtitle={`${warehouses.length} anbar`} />
                <TwoLine title="Unikal məhsul" subtitle={`${aggregateItems.length} məhsul`} />
                <TwoLine title="Ümumi / rezerv" subtitle={`${aggregateSummary.total} / ${aggregateSummary.reserved} ədəd`} />
                <TwoLine title="Satış üçün dəyər" subtitle={money(aggregateSummary.value)} />
              </div>
              <WarehouseStockToolbar filter={stockFilter} setFilter={setStockFilter} />
              <DataTable
                columns={["Məhsul", "Ümumi", "Rezerv", "Satış üçün", "Sifarişdə", "Anbar paylanması", "Dəyər", "Risk"]}
                rows={visibleItems.map((item) => [
                  <strong>{item.product}</strong>,
                  item.total,
                  item.reserved,
                  getAvailableQuantity(item),
                  (() => {
                    const coverage = purchaseOrderCoverage.get(normalize(item.product));
                    return coverage?.orderedQty > 0 ? <TwoLine title={`${coverage.orderedQty} ədəd`} subtitle={coverage.latest?.id || `${coverage.count} PO`} /> : "—";
                  })(),
                  <WarehouseDistribution distribution={item.distribution} />,
                  money(getAvailableQuantity(item) * item.price),
                  getAvailableQuantity(item) <= 3 ? <StatusBadge status="Aşağı stok" /> : "Normal",
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
                    {selectedWarehouse.code} · {selectedWarehouse.type} · {selectedWarehouse.city}
                  </p>
                </div>
                <div className="warehouse-head-actions">
                  <button className="secondary-btn" onClick={() => onEdit(selectedWarehouse.id)}>
                    Redaktə et
                  </button>
                  <button className="secondary-btn danger-outline" onClick={() => onDelete(selectedWarehouse.id)}>
                    Sil
                  </button>
                </div>
              </div>
              <div className="warehouse-info-grid">
                <TwoLine title="Məsul şəxs" subtitle={selectedWarehouse.manager} />
                <TwoLine title="Ünvan" subtitle={selectedWarehouse.address} />
                <TwoLine title="Tutum" subtitle={`${selectedSummary.total} / ${selectedWarehouse.capacity} ədəd`} />
                <TwoLine title="Satış üçün dəyər" subtitle={money(selectedSummary.value)} />
              </div>
              <WarehouseStockToolbar filter={stockFilter} setFilter={setStockFilter} />
              <DataTable
                columns={["Məhsul", "Ümumi", "Rezerv", "Satış üçün", "Sifarişdə", "Qiymət", "Dəyər", "Risk"]}
                rows={visibleItems.map((item) => [
                  <strong>{item.product}</strong>,
                  item.total,
                  item.reserved,
                  getAvailableQuantity(item),
                  (() => {
                    const coverage = purchaseOrderCoverage.get(normalize(item.product));
                    return coverage?.orderedQty > 0 ? <TwoLine title={`${coverage.orderedQty} ədəd`} subtitle={coverage.latest?.id || `${coverage.count} PO`} /> : "—";
                  })(),
                  money(item.price),
                  money(getAvailableQuantity(item) * item.price),
                  getAvailableQuantity(item) <= 3 ? <StatusBadge status="Aşağı stok" /> : "Normal",
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
            <EmptyState title="Anbar seçilməyib" />
          )}
        </Panel>
      </section>
        </div>
      </details>
    </div>
  );
}
