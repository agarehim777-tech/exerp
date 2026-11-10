import { sellableQty } from "./stockMath.js";
import { csvCell } from "./csvCell.js";
import { getDeliveryStockCheck, getDeliveryTotalQuantity, OrderProductLines } from "../../modules/warehouse/deliveryDomain.jsx";
import { Check, ChevronLeft, ChevronRight, Download, FileText, Filter, Package, Plus, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Truck, Upload, Warehouse } from "lucide-react";
import { DataTable, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useEffect, useMemo, useState } from "react";
import { money, normalize, percent } from "../../services/format.js";
import { total } from "../../shared/utils/aggregate.js";
import { toLocalIsoDate } from "../../services/date.js";
import { buildProductLookup, buildPurchaseOrderCoverage, getRecommendedOrderPlan, getReorderPoint } from "./appDomainProcurement.jsx";

export function BarcodeBadge({ barcode, qrPayload }) {
  const widths = String(barcode)
    .slice(0, 12)
    .split("")
    .map((digit) => 1 + (Number(digit) % 3));
  const widthWithGaps = widths.reduce((sum, width) => sum + width + 2, 0);

  return (
    <div className="barcode-badge" title={qrPayload}>
      <svg className="barcode-lines" viewBox={`0 0 ${widthWithGaps} 18`} preserveAspectRatio="none" aria-hidden="true">
        {widths.map((width, index) => {
          const x = widths.slice(0, index).reduce((sum, item) => sum + item + 2, 0);
          return <rect key={`${barcode}-${index}`} x={x} y="0" width={width} height="18" />;
        })}
      </svg>
      <small>{barcode}</small>
    </div>
  );
}

export function DeliveryOrdersPanel({ orders, isAllWarehouses, warehouseStock = {}, onCompleteDelivery }) {
  return (
    <div className="delivery-orders-panel">
      <PanelHeader
        title="Təhvil verilməli məhsullar"
        subtitle={
          isAllWarehouses
            ? "Bütün anbarlar üzrə rezervdə olan və təhvil gözləyən sifarişlər"
            : "Seçilmiş anbardan çıxarılmalı rezerv məhsullar"
        }
      />
      <DataTable
        columns={["Sifariş", "Müştəri", "Məhsullar", "Anbar", "Ödəniş", "Rezerv", "Əməliyyat"]}
        rows={orders.map((order) => {
          const stockCheck = getDeliveryStockCheck(order, warehouseStock);
          return [
            <strong>{order.id}</strong>,
            <TwoLine title={order.customer} subtitle={order.fin} />,
            <OrderProductLines lines={order.productLines} />,
            order.warehouseName || "Baş Anbar",
            <StatusBadge status={order.paymentStatus || order.paymentMethod || "Nağd"} />,
            <TwoLine
              title={<StatusBadge status={stockCheck.status} />}
              subtitle={
                stockCheck.partial
                  ? `${stockCheck.plan.deliverableTotal} ədəd indi · ${stockCheck.plan.shortageTotal} backorder`
                  : stockCheck.ok
                    ? `${stockCheck.plan?.remainingTotal ?? getDeliveryTotalQuantity(order)} ədəd rezervdə`
                    : stockCheck.reason
              }
            />,
            <button
              className="text-btn"
              disabled={!stockCheck.ok}
              title={stockCheck.reason}
              onClick={() => onCompleteDelivery(order.id)}
            >
              {stockCheck.partial ? "Qismən təhvil ver" : "Təhvil verildi"}
            </button>,

          ];
        })}
      />
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled = false }) {
  return (
    <button className="toggle-row" onClick={onChange} disabled={disabled} title={disabled ? "Bu ayarı dəyişmək üçün icazə yoxdur" : ""}>
      <span>{label}</span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}

export function WarehouseBalancesWorkspace({
  warehouses,
  warehouseStock,
  products,
  purchaseOrders = [],
  query,
  onQueryChange,
  onReceiveStock,
  onOpenImport,
  onCreateProduct,
  onEditProduct,
  onOpenProduct,
  onOpenOperations,
  onTrackAction,
}) {
  const view = "warehouses";
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [draftFilters, setDraftFilters] = useState(() => ({ ...warehouseBalanceFilterDefaults }));
  const [activeFilters, setActiveFilters] = useState(() => ({ ...warehouseBalanceFilterDefaults }));
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "az")),
    [products],
  );
  const balanceRows = useMemo(
    () => buildWarehouseBalanceRows({ warehouses, warehouseStock, products, purchaseOrders, view, warehouseId: activeFilters.warehouseId }),
    [warehouses, warehouseStock, products, purchaseOrders, view, activeFilters.warehouseId],
  );
  const visibleRows = useMemo(
    () => filterWarehouseBalanceRows(balanceRows, activeFilters, query),
    [balanceRows, activeFilters, query],
  );

  function changeDraftFilter(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setActiveFilters({ ...draftFilters });
  }

  function clearFilters() {
    const next = { ...warehouseBalanceFilterDefaults };
    setDraftFilters(next);
    setActiveFilters(next);
  }

  function showReplenishmentRows() {
    const next = { ...activeFilters, stockStatus: "below", belowMinimum: true };
    const replenishmentCount = balanceRows.filter((row) => row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq").length;
    setDraftFilters(next);
    setActiveFilters(next);
    setFiltersOpen(true);
    onTrackAction?.("Ehtiyat tamamlama siyahısı açıldı", `${replenishmentCount} məhsul/anbar sətrinə minimum stok filtri tətbiq edildi`);
  }

  function handleExport() {
    exportWarehouseBalanceCsv(visibleRows, view);
    onTrackAction?.("Anbar qalıqları CSV ixrac edildi", `${visibleRows.length} məhsul/anbar sətri`);
  }

  function handlePrint() {
    onTrackAction?.("Anbar qalıqları çap üçün açıldı", `${visibleRows.length} məhsul/anbar sətri`);
    document.body.classList.add("warehouse-print-mode");
    const clearPrintMode = () => document.body.classList.remove("warehouse-print-mode");
    window.addEventListener("afterprint", clearPrintMode, { once: true });
    window.print();
    window.setTimeout(clearPrintMode, 1000);
  }

  return (
    <section className="warehouse-balance-workspace">
      <div className="warehouse-balance-toolbar">
        <div className="warehouse-balance-title"><strong>Məhsul və anbar qalıqları</strong><span>{visibleRows.length}</span></div>
        {onQueryChange && (
          <label className="warehouse-balance-quick-search" aria-label="Məhsul axtarışı">
            <Search size={16} />
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Məhsul, SKU və ya kateqoriya axtar..." />
          </label>
        )}
        <div className="warehouse-balance-actions">
          <button type="button" className="secondary-btn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <Filter size={16} /> Filter
          </button>
          <button type="button" className="secondary-btn" onClick={handlePrint}>
            <FileText size={16} /> Çap
          </button>
          <button type="button" className="secondary-btn" onClick={handleExport}>
            <Download size={16} /> İxrac CSV
          </button>
          <button type="button" className="secondary-btn" onClick={showReplenishmentRows}>
            <RefreshCw size={16} /> Ehtiyatı tamamla
          </button>
          <div className="warehouse-action-menu">
            <button type="button" className="primary-btn" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((open) => !open)}>
              <ShoppingCart size={16} /> Əməliyyatlar <ChevronRight size={15} />
            </button>
            {actionMenuOpen && (
              <div className="warehouse-action-menu-popover">
                <button type="button" onClick={() => { setActionMenuOpen(false); onReceiveStock(); }}><Plus size={15} /> Mədaxil et</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenImport(); }}><Upload size={15} /> Toplu import</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onCreateProduct(); }}><Package size={15} /> Məhsul yarat</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenOperations(); }}><Warehouse size={15} /> Anbar idarəetməsi</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <WarehouseBalanceFilters
        filters={draftFilters}
        warehouses={warehouses}
        categories={categories}
        open={filtersOpen}
        onChange={changeDraftFilter}
        onApply={applyFilters}
        onClear={clearFilters}
      />
      <div className="warehouse-balance-table-meta">
        <span>{visibleRows.length} qalıq sətri</span>
        <strong>Cari stok vəziyyəti</strong>
      </div>
      <WarehouseBalanceTable
        rows={visibleRows}
        view={view}
        onEditProduct={onEditProduct}
        onOpenProduct={onOpenProduct}
        onCreateProduct={onCreateProduct}
      />
    </section>
  );
}

// WarehousePage moved to ./pages/WarehousePage.jsx (lazy chunk)

export function WarehouseControlPanel({ summary, deliveryCount, alerts, isAllWarehouses, onSelect }) {
  return (
    <Panel className="warehouse-control-panel">
      <PanelHeader
        title="Anbar nəzarəti"
        subtitle={isAllWarehouses ? "Bütün anbarlar üzrə canlı əməliyyat xülasəsi" : "Seçilmiş anbar üzrə əməliyyat xülasəsi"}
        icon={SlidersHorizontal}
      />
      <div className="warehouse-control-grid">
        <div className="warehouse-control-tile">
          <span>Satış üçün</span>
          <strong>{summary.available} ədəd</strong>
          <small>{money(summary.value)} dəyər</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Rezerv yükü</span>
          <strong>{summary.reserved} ədəd</strong>
          <small>{percent(summary.reservedRate)} stok rezervdə</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Təhvil növbəsi</span>
          <strong>{deliveryCount}</strong>
          <small>Anbardan çıxmalı sifariş</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Doluluq</span>
          <strong>{summary.utilization}%</strong>
          <small>{summary.sku} məhsul çeşidi</small>
        </div>
      </div>
      <div className="warehouse-signal-list">
        {alerts.slice(0, 4).map((alert) => (
          <button key={`${alert.warehouseId}-${alert.product}`} className="warehouse-signal-row" onClick={() => onSelect(alert.warehouseId)}>
            <div>
              <strong>{alert.product}</strong>
              <span>
                {alert.warehouseName} · satış üçün {alert.available} ədəd
              </span>
            </div>
            <StatusBadge status={alert.status} />
          </button>
        ))}
        {alerts.length === 0 && (
          <div className="warehouse-signal-empty">
            <Check size={16} />
            Kritik stok siqnalı yoxdur
          </div>
        )}
      </div>
    </Panel>
  );
}

export function WarehouseDistribution({ distribution }) {
  return (
    <div className="warehouse-distribution">
      {distribution
        .filter((item) => item.total > 0)
        .map((item) => (
          <span key={item.warehouse}>
            {item.warehouse}: <strong>{item.available}</strong>
          </span>
        ))}
    </div>
  );
}

export function WarehouseStockToolbar({ filter, setFilter }) {
  const filters = ["Hamısı", "Satış üçün var", "Rezervdə", "Aşağı stok"];
  return (
    <div className="warehouse-stock-toolbar">
      <div>
        <h2>Anbar üzrə mallar</h2>
        <p>Filter seçib ümumi və ya seçilmiş anbar üzrə qalıqlara baxın</p>
      </div>
      <div className="tabs">
        {filters.map((item) => (
          <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WarehouseTransferPanel({ suggestions, onTransferStock }) {
  return (
    <div className="warehouse-transfer-panel">
      <PanelHeader
        title="Transfer tövsiyələri"
        subtitle="Aşağı qalıqlı anbarlara artıq stok olan anbardan daxili transfer"
        icon={Truck}
      />
      <DataTable
        columns={["Məhsul", "Haradan", "Haraya", "Miqdar", "Səbəb", "Əməliyyat"]}
        rows={suggestions.map((suggestion) => [
          <strong>{suggestion.product}</strong>,
          suggestion.fromWarehouse,
          suggestion.toWarehouse,
          `${suggestion.qty} ədəd`,
          suggestion.reason,
          <button className="text-btn" onClick={() => onTransferStock(suggestion)}>
            Transfer et
          </button>,
        ])}
      />
    </div>
  );
}

export function buildAggregateWarehouseStock(warehouses, warehouseStock) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map();

  Object.entries(warehouseStock).forEach(([warehouseId, items]) => {
    const warehouse = warehouseById.get(warehouseId);
    items.forEach((item) => {
      const current = byProduct.get(item.product) || {
        product: item.product,
        total: 0,
        reserved: 0,
        price: item.price,
        distribution: [],
      };
      current.total += Number(item.total || 0);
      current.reserved += Number(item.reserved || 0);
      current.price = item.price || current.price;
      current.distribution.push({
        warehouse: warehouse?.name || warehouseId,
        total: Number(item.total || 0),
        available: sellableQty(item),
      });
      byProduct.set(item.product, current);
    });
  });

  return [...byProduct.values()].sort((a, b) => a.product.localeCompare(b.product, "az"));
}

export function buildWarehouseStockAlerts(warehouses, warehouseStock, products = []) {
  const productsByName = buildProductLookup(products);

  return warehouses.flatMap((warehouse) =>
    (warehouseStock[warehouse.id] || [])
      .map((item) => ({
        item,
        reorderPoint: getReorderPoint(item, productsByName),
      }))
      .filter(({ item, reorderPoint }) => reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint)
      .map(({ item, reorderPoint }) => ({
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          city: warehouse.city,
          product: item.product,
          total: Number(item.total || 0),
          reserved: Number(item.reserved || 0),
          available: getAvailableQuantity(item),
          reorderPoint,
          status: getAvailableQuantity(item) <= Math.max(1, Math.floor(reorderPoint / 2)) ? "Kritik stok" : "Aşağı stok",
        })),
  );
}

export function buildWarehouseSummaries(warehouses, warehouseStock, products = []) {
  return warehouses.map((warehouse) => ({
    warehouse,
    ...getWarehouseStockSummary(warehouseStock[warehouse.id] || [], Number(warehouse.capacity || 0), products),
  }));
}

export function buildWarehouseTransferSuggestions(warehouses, warehouseStock) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map();

  Object.entries(warehouseStock).forEach(([warehouseId, items]) => {
    items.forEach((item) => {
      const rows = byProduct.get(item.product) || [];
      rows.push({
        warehouseId,
        warehouseName: warehouseById.get(warehouseId)?.name || warehouseId,
        city: warehouseById.get(warehouseId)?.city || "",
        product: item.product,
        price: Number(item.price || 0),
        total: Number(item.total || 0),
        reserved: Number(item.reserved || 0),
        available: getAvailableQuantity(item),
      });
      byProduct.set(item.product, rows);
    });
  });

  return [...byProduct.entries()].flatMap(([product, rows]) => {
    const targets = rows.filter((row) => row.available <= 3).sort((a, b) => a.available - b.available);
    const sources = rows.filter((row) => row.available >= 6).sort((a, b) => b.available - a.available);
    return targets.flatMap((target) => {
      const source = sources.find((item) => item.warehouseId !== target.warehouseId);
      if (!source) return [];
      const qty = Math.max(1, Math.min(5 - target.available, source.available - 4));
      if (qty <= 0) return [];
      return {
        id: `${product}-${source.warehouseId}-${target.warehouseId}`,
        product,
        fromWarehouseId: source.warehouseId,
        fromWarehouse: source.warehouseName,
        toWarehouseId: target.warehouseId,
        toWarehouse: target.warehouseName,
        qty,
        reason: `${target.warehouseName} üzrə satış üçün ${target.available} qalıb`,
      };
    });
  });
}

export function buildWarehouseWmsRows(items, products = []) {
  const productsByName = buildProductLookup(products);

  return items.map((item, index) => {
    const available = getAvailableQuantity(item);
    const serialSummary = getSerialSummary(item.serials || []);
    const catalogProduct = productsByName.get(normalize(item.product));
    const reorderPoint = getReorderPoint(item, productsByName);
    const serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
    const reorderQty = Math.max(0, reorderPoint * 2 - available);
    const brandCode = normalize(item.product).replace(/[^a-z0-9]/g, "").slice(0, 5).toLocaleUpperCase("az-AZ");
    const sku = `SKU-${brandCode || index + 1}-${String(index + 1).padStart(3, "0")}`;
    const barcode = `869${String(index + 100000001).padStart(9, "0")}`;
    return {
      sku,
      barcode,
      qrPayload: `ERPZ|${sku}|${item.product}|${available}`,
      product: item.product,
      bin: `${String.fromCharCode(65 + (index % 4))}-${String((index % 6) + 1).padStart(2, "0")}`,
      serialMode: serialTracked ? "IMEI/Serial" : "Batch",
      cycleCount: index % 3 === 0 ? "Bu həftə" : index % 3 === 1 ? "Növbəti həftə" : "Aylıq",
      available,
      reserved: Number(item.reserved || 0),
      serialSummary,
      sampleSerial: item.serials?.find((serial) => serial.status !== "Satılıb")?.imei || "Batch",
      reorderPoint,
      reorderQty,
      status: reorderQty > 0 ? "Sifariş aç" : available <= reorderPoint + 2 ? "Nəzarət" : "Normal",
    };
  });
}

export function filterRows(rows, query) {
  if (!query.trim()) return rows;
  const q = normalize(query);
  return rows.filter((row) => normalize(Object.values(row).join(" ")).includes(q));
}

export function filterWarehouseItems(items, filter) {
  if (filter === "Satış üçün var") {
    return items.filter((item) => getAvailableQuantity(item) > 0);
  }
  if (filter === "Rezervdə") {
    return items.filter((item) => item.reserved > 0);
  }
  if (filter === "Aşağı stok") {
    return items.filter((item) => getAvailableQuantity(item) <= 3);
  }
  return items;
}

export function getAvailableQuantity(item) {
  return sellableQty(item);
}

// Satış üçün real sərbəst qalıq — mənfi ola bilər (backorder / sifariş gözləyən miqdar).

export function getWarehouseStockSummary(items, capacity = 0, products = []) {
  const productsByName = buildProductLookup(products);
  const totalQty = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reservedQty = total(items, "reserved");
  const problemQty = items.reduce((sum, item) => sum + Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0), 0);
  const availableQty = totalQty - reservedQty - problemQty;
  const value = items.reduce((sum, item) => sum + Math.max(0, getAvailableQuantity(item)) * Number(item.price || 0), 0);
  return {
    sku: items.length,
    total: totalQty,
    reserved: reservedQty,
    problem: problemQty,
    available: availableQty,
    value,
    lowStock: items.filter((item) => isLowStockItem(item, productsByName)).length,
    utilization: capacity > 0 ? Math.min(100, Math.round((totalQty / capacity) * 100)) : 0,
    reservedRate: totalQty > 0 ? (reservedQty / totalQty) * 100 : 0,
  };
}

export function isLowStockItem(item, productsByName = new Map()) {
  const reorderPoint = getReorderPoint(item, productsByName);
  return reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint;
}

export function getSerialSummary(serials = []) {
  return {
    available: serials.filter((serial) => serial.status === "Anbarda").length,
    reserved: serials.filter((serial) => serial.status === "Rezervdə").length,
    sold: serials.filter((serial) => serial.status === "Satılıb").length,
  };
}

export function isSerialTrackedProduct(item = {}) {
  if (typeof item.serialTracked === "boolean") return item.serialTracked;
  return Number(item.price || 0) >= 1500;
}

export const warehouseBalanceFilterDefaults = {
  productQuery: "",
  warehouseId: "all",
  category: "all",
  stockStatus: "all",
  reserveStatus: "all",
  serialStatus: "all",
  belowMinimum: false,
};

export function buildWarehouseBalanceRows({ warehouses = [], warehouseStock = {}, products = [], purchaseOrders = [], view = "products", warehouseId = "all" }) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const createRow = (productName, catalogProduct = null) => ({
    key: catalogProduct?.id || normalize(productName),
    product: productName,
    productId: catalogProduct?.id || "",
    imageUrl: catalogProduct?.imageUrl || catalogProduct?.image_url || "",
    category: catalogProduct?.category || "Kataloqu olmayan",
    sku: catalogProduct?.sku || "—",
    unit: catalogProduct?.unit || "ədəd",
    serialTracked: Boolean(catalogProduct?.serialTracked),
    costPrice: Number(catalogProduct?.costPrice || 0),
    salePrice: Number(catalogProduct?.salePrice || 0),
    reorderLevel: Number(catalogProduct?.reorderLevel || 0),
    recommendedOrderQty: Number(catalogProduct?.recommendedOrderQty || 0),
    total: 0,
    reserved: 0,
    problem: 0,
    orderedQty: 0,
    openPoCount: 0,
    latestPoId: "",
    stockValue: 0,
    warehouseDistribution: [],
  });

  if (view === "products") {
    const rowsByProduct = new Map();
    products.filter((product) => product.status !== "Passiv").forEach((product) => {
      rowsByProduct.set(normalize(product.name), createRow(product.name, product));
    });

    Object.entries(warehouseStock).forEach(([sourceWarehouseId, items]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return;
      (items || []).forEach((item) => {
        const key = normalize(item.product);
        const catalogProduct = productsByName.get(key);
        const row = rowsByProduct.get(key) || createRow(item.product, catalogProduct);
        row.total += Number(item.total || 0);
        row.reserved += Number(item.reserved || 0);
        row.problem += Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0);
        row.stockValue += Number(item.total || 0) * Number(item.costPrice || 0);
        row.salePrice = row.salePrice || Number(item.price || 0);
        row.serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
        row.reorderLevel = getReorderPoint(item, productsByName);
        row.warehouseDistribution.push({
          warehouse: warehouseById.get(sourceWarehouseId)?.name || sourceWarehouseId,
          warehouseId: sourceWarehouseId,
          total: Number(item.total || 0),
          problem: Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0),
          available: getAvailableQuantity(item),
        });
        rowsByProduct.set(key, row);
      });
    });

    return [...rowsByProduct.values()]
      .map((row) => {
        const free = row.total - row.reserved - row.problem;
        const available = free;
        const shortage = Math.max(0, -free);
        const coverage = orderCoverage.get(normalize(row.product)) || { orderedQty: 0, count: 0, latest: null };
        const averageCost = row.total > 0 ? row.stockValue / row.total : row.costPrice;
        const recommendation = getRecommendedOrderPlan({ available, minimum: row.reorderLevel, baseQty: row.recommendedOrderQty, orderedQty: coverage.orderedQty });
        return {
          ...row,
          costPrice: averageCost,
          warehouseName: row.warehouseDistribution.length === 0 ? "—" : `${row.warehouseDistribution.length} anbar`,
          warehouseCount: row.warehouseDistribution.length,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          ...recommendation,
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, row.reorderLevel),
          stockValue: row.stockValue,
          salesValue: row.total * row.salePrice,
        };
      })
      .sort((a, b) => a.product.localeCompare(b.product, "az"));
  }

  const warehouseRows = Object.entries(warehouseStock)
    .flatMap(([sourceWarehouseId, items]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return [];
      const warehouse = warehouseById.get(sourceWarehouseId);
      return (items || []).map((item) => {
        const catalogProduct = productsByName.get(normalize(item.product));
        const totalQty = Number(item.total || 0);
        const reserved = Number(item.reserved || 0);
        const problem = Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0);
        const available = getAvailableQuantity(item);
        const free = getFreeQuantity(item);
        const shortage = getShortageQuantity(item);
        const reorderLevel = getReorderPoint(item, productsByName);
        const coverage = orderCoverage.get(normalize(item.product)) || { orderedQty: 0, count: 0, latest: null };
        const costPrice = Number(item.costPrice || catalogProduct?.costPrice || 0);
        const salePrice = Number(catalogProduct?.salePrice || item.price || 0);
        const recommendation = getRecommendedOrderPlan({ available, minimum: reorderLevel, baseQty: catalogProduct?.recommendedOrderQty, orderedQty: coverage.orderedQty });
        return {
          key: `${sourceWarehouseId}-${catalogProduct?.id || item.product}`,
          warehouseId: sourceWarehouseId,
          warehouseName: warehouse?.name || sourceWarehouseId,
          product: item.product,
          productId: catalogProduct?.id || "",
          imageUrl: catalogProduct?.imageUrl || catalogProduct?.image_url || "",
          category: catalogProduct?.category || "Kataloqu olmayan",
          sku: catalogProduct?.sku || "—",
          unit: catalogProduct?.unit || "ədəd",
          serialTracked: catalogProduct?.serialTracked ?? isSerialTrackedProduct(item),
          costPrice,
          salePrice,
          reorderLevel,
          total: totalQty,
          reserved,
          problem,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          recommendedOrderQty: Number(catalogProduct?.recommendedOrderQty || 0),
          ...recommendation,
          warehouseDistribution: [],
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, reorderLevel),
          stockValue: totalQty * costPrice,
          salesValue: totalQty * salePrice,
        };
      });
    });

  // Kataloqda olan, lakin heç bir anbarda qalığı olmayan məhsullar da 0 qalıqla görünməlidir.
  const coveredProducts = new Set(warehouseRows.map((row) => normalize(row.product)));
  const emptyWarehouse = warehouseId !== "all" ? warehouseById.get(warehouseId) : null;
  const zeroRows = products
    .filter((product) => product.status !== "Passiv" && product.name && !coveredProducts.has(normalize(product.name)))
    .map((product) => {
      const reorderLevel = Number(product.reorderLevel || 0);
      const coverage = orderCoverage.get(normalize(product.name)) || { orderedQty: 0, count: 0, latest: null };
      const recommendation = getRecommendedOrderPlan({ available: 0, minimum: reorderLevel, baseQty: product.recommendedOrderQty, orderedQty: coverage.orderedQty });
      return {
        key: `no-stock-${product.id || normalize(product.name)}`,
        warehouseId: emptyWarehouse?.id || "",
        warehouseName: emptyWarehouse?.name || "—",
        product: product.name,
        productId: product.id || "",
        imageUrl: product.imageUrl || product.image_url || "",
        category: product.category || "Kataloqu olmayan",
        sku: product.sku || "—",
        unit: product.unit || "ədəd",
        serialTracked: Boolean(product.serialTracked),
        costPrice: Number(product.costPrice || 0),
        salePrice: Number(product.salePrice || 0),
        reorderLevel,
        total: 0,
        reserved: 0,
        problem: 0,
        available: 0,
        free: 0,
        shortage: 0,
        orderedQty: Number(coverage.orderedQty || 0),
        openPoCount: Number(coverage.count || 0),
        latestPoId: coverage.latest?.id || "",
        recommendedOrderQty: Number(product.recommendedOrderQty || 0),
        ...recommendation,
        warehouseDistribution: [],
        status: getWarehouseBalanceStatus(0, reorderLevel),
        stockValue: 0,
        salesValue: 0,
      };
    });

  return [...warehouseRows, ...zeroRows]
    .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, "az") || a.product.localeCompare(b.product, "az"));
}

export function filterWarehouseBalanceRows(rows, filters, globalQuery = "") {
  const search = normalize([filters.productQuery, globalQuery].filter(Boolean).join(" "));
  return rows.filter((row) => {
    const matchesSearch = !search || normalize(`${row.product} ${row.sku} ${row.category} ${row.warehouseName}`).includes(search);
    const matchesCategory = filters.category === "all" || row.category === filters.category;
    const matchesStock =
      filters.stockStatus === "all" ||
      (filters.stockStatus === "below" && (row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq")) ||
      (filters.stockStatus === "available" && row.available > 0) ||
      (filters.stockStatus === "empty" && row.available <= 0) ||
      (filters.stockStatus === "shortage" && row.shortage > 0) ||
      (filters.stockStatus === "problem" && Number(row.problem || 0) > 0);
    const matchesReserve =
      filters.reserveStatus === "all" ||
      (filters.reserveStatus === "reserved" && row.reserved > 0) ||
      (filters.reserveStatus === "free" && row.reserved === 0);
    const matchesSerial =
      filters.serialStatus === "all" ||
      (filters.serialStatus === "serial" && row.serialTracked) ||
      (filters.serialStatus === "batch" && !row.serialTracked);
    const matchesMinimum = !filters.belowMinimum || row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq";
    return matchesSearch && matchesCategory && matchesStock && matchesReserve && matchesSerial && matchesMinimum;
  });
}

export function exportWarehouseBalanceCsv(rows, view) {
  const headers = ["Kateqoriya", "Məhsul", "SKU", "Anbar", "Qalıq", "Minimum", "Rezerv", "Problemli", "Satışa uyğun", "Sifarişdə", "Tövsiyə", "Əlavə alınmalı", "Vahid", "Maya", "Stok dəyəri", "Satış qiyməti", "Status"];
  const escapeValue = (value) => csvCell(value);
  const csvRows = rows.map((row) => [
    row.category,
    row.product,
    row.sku,
    view === "products" ? row.warehouseName : row.warehouseName,
    row.total,
    row.reorderLevel,
    row.reserved,
    row.problem,
    row.available,
    row.orderedQty,
    row.recommendedQty,
    row.additionalQty,
    row.unit,
    row.costPrice,
    row.stockValue,
    row.salePrice,
    row.status,
  ].map(escapeValue).join(","));
  const blob = new Blob([`\uFEFF${headers.map(escapeValue).join(",")}\n${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `anbar-qaliqlari-${toLocalIsoDate()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function WarehouseBalanceFilters({ filters, warehouses, categories, open, onChange, onApply, onClear }) {
  if (!open) return null;

  return (
    <section className="warehouse-balance-filters">
      <label>
        <span>Məhsul / qrup</span>
        <div className="warehouse-filter-search">
          <Search size={16} />
          <input value={filters.productQuery} placeholder="Məhsul adı, SKU və ya qrup" onChange={(event) => onChange("productQuery", event.target.value)} />
        </div>
      </label>
      <label>
        <span>Anbar</span>
        <select value={filters.warehouseId} onChange={(event) => onChange("warehouseId", event.target.value)}>
          <option value="all">Bütün anbarlar</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </select>
      </label>
      <label>
        <span>Kateqoriya</span>
        <select value={filters.category} onChange={(event) => onChange("category", event.target.value)}>
          <option value="all">Bütün kateqoriyalar</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>
        <span>Qalıq statusu</span>
        <select value={filters.stockStatus} onChange={(event) => onChange("stockStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="below">Minimumdan aşağı</option>
          <option value="available">Stokda var</option>
          <option value="empty">Stok tükənib</option>
          <option value="shortage">Çatışmazlıq (backorder)</option>
          <option value="problem">Problemli stok</option>
        </select>
      </label>
      <label>
        <span>Rezerv statusu</span>
        <select value={filters.reserveStatus} onChange={(event) => onChange("reserveStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="reserved">Yalnız rezervli</option>
          <option value="free">Rezervsiz</option>
        </select>
      </label>
      <label>
        <span>Serial izləmə</span>
        <select value={filters.serialStatus} onChange={(event) => onChange("serialStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="serial">IMEI / serial</option>
          <option value="batch">Batch</option>
        </select>
      </label>
      <label className="warehouse-minimum-toggle">
        <input type="checkbox" checked={filters.belowMinimum} onChange={(event) => onChange("belowMinimum", event.target.checked)} />
        <span>Minimumdan aşağı olanlar</span>
      </label>
      <div className="warehouse-filter-actions">
        <button type="button" className="secondary-btn" onClick={onClear}>Təmizlə</button>
        <button type="button" className="primary-btn" onClick={onApply}>Tətbiq et</button>
      </div>
    </section>
  );
}

export function WarehouseBalanceTable({ rows, view, onEditProduct, onOpenProduct, onCreateProduct }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  useEffect(() => { setPage(0); }, [rows]);
  const pageRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const totals = useMemo(() => rows.reduce((summary, row) => ({
    total: summary.total + Number(row.total || 0),
    reserved: summary.reserved + Number(row.reserved || 0),
    problem: summary.problem + Number(row.problem || 0),
    available: summary.available + Number(row.available || 0),
    orderedQty: summary.orderedQty + Number(row.orderedQty || 0),
    recommendedQty: summary.recommendedQty + Number(row.recommendedQty || 0),
    stockValue: summary.stockValue + Number(row.stockValue || 0),
    salesValue: summary.salesValue + Number(row.salesValue || 0),
  }), { total: 0, reserved: 0, problem: 0, available: 0, orderedQty: 0, recommendedQty: 0, stockValue: 0, salesValue: 0 }), [rows]);
  const locationHeading = view === "products" ? "Anbarlar" : "Anbar";

  return (
    <div className="warehouse-balance-table-wrap">
      <table className="warehouse-balance-table">
        <thead>
          <tr>
            <th>Kateqoriya</th><th>Məhsul</th><th>SKU</th><th>{locationHeading}</th><th>Qalıq</th><th>Minimum</th><th>Rezerv</th><th>Problemli</th><th>Satışa uyğun</th><th>Sifarişdə</th><th>Tövsiyə</th><th>Vahid</th><th>Maya</th><th>Stok dəyəri</th><th>Satış</th><th>Status</th>{view === "products" && <th>Əməliyyat</th>}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => (
            <tr key={row.key}>
              <td>{row.category}</td>
              <td>
                <div className="warehouse-product-cell">
                  <span className="warehouse-product-thumb">{row.imageUrl ? <img src={row.imageUrl} alt="" /> : <Package size={15} />}</span>
                  {row.productId && onOpenProduct ? (
                    <button type="button" className="text-btn" onClick={() => onOpenProduct(row.productId)} title="Məhsulun 360 baxışını aç">
                      <strong>{row.product}</strong>
                    </button>
                  ) : <strong>{row.product}</strong>}
                </div>
              </td>
              <td className="warehouse-sku">{row.sku}</td>
              <td>{view === "products" ? <WarehouseDistribution distribution={row.warehouseDistribution} /> : row.warehouseName}</td>
              <td>{row.total}</td>
              <td>{row.reorderLevel || "—"}</td>
              <td>{row.reserved}</td>
              <td className={row.problem > 0 ? "balance-qty risk" : ""}>{row.problem || 0}</td>
              <td className={row.shortage > 0 || row.status !== "Normal" ? "balance-qty risk" : "balance-qty good"}>
                {row.shortage > 0 ? `-${row.shortage}` : row.available}
                {row.shortage > 0 && <small className="u-display-block u-opacity-0_75">sifariş gözləyir</small>}
              </td>
              <td>{row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} ədəd`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "—"}</td>
              <td>{row.recommendedQty > 0 ? <TwoLine title={`${row.recommendedQty} ədəd`} subtitle={row.additionalQty > 0 ? `əlavə ${row.additionalQty} alınmalı` : "açıq PO qarşılayır"} /> : "—"}</td>
              <td>{row.unit}</td>
              <td>{money(row.costPrice)}</td>
              <td>{money(row.stockValue)}</td>
              <td>{money(row.salePrice)}</td>
              <td><StatusBadge status={row.status} /></td>
              {view === "products" && <td>
                {row.productId ? (
                  <span className="u-display-inline_flex u-gap-10px u-align-items-center">
                    {onOpenProduct && <button className="text-btn" onClick={() => onOpenProduct(row.productId)}>360 baxış</button>}
                    <button className="text-btn" onClick={() => onEditProduct(row.productId)}>Redaktə</button>
                  </span>
                ) : (
                  <button className="text-btn" onClick={onCreateProduct}>Kataloqa əlavə et</button>
                )}
              </td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={view === "products" ? 17 : 16} className="warehouse-balance-empty">Seçilmiş filtrə uyğun qalıq tapılmadı.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan="4">Cəmi</td><td>{totals.total}</td><td>—</td><td>{totals.reserved}</td><td>{totals.problem}</td><td className="balance-qty good">{totals.available}</td><td>{totals.orderedQty || "—"}</td><td>{totals.recommendedQty || "—"}</td><td>—</td><td>—</td><td>{money(totals.stockValue)}</td><td>{money(totals.salesValue)}</td><td>—</td>{view === "products" && <td>—</td>}
            </tr>
          </tfoot>
        )}
      </table>
      {pageCount > 1 && <nav aria-label="Stok cədvəlinin səhifələri" className="u-display-flex u-align-items-center u-justify-content-flex_end u-gap-12px u-padding-12px">
        <span>{currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, rows.length)} / {rows.length}</span>
        <button type="button" className="secondary-btn" title="Əvvəlki səhifə" aria-label="Əvvəlki səhifə" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>
        <button type="button" className="secondary-btn" title="Növbəti səhifə" aria-label="Növbəti səhifə" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button>
      </nav>}
    </div>
  );
}

export function getWarehouseBalanceStatus(available, reorderPoint) {
  if (available <= 0) return "Stok tükənib";
  if (reorderPoint > 0 && available <= Math.max(1, Math.floor(reorderPoint / 2))) return "Kritik stok";
  if (reorderPoint > 0 && available <= reorderPoint) return "Aşağı stok";
  return "Normal";
}

export function getFreeQuantity(item) {
  return getAvailableQuantity(item);
}

export function getShortageQuantity(item) {
  return Math.max(0, -getFreeQuantity(item));
}
