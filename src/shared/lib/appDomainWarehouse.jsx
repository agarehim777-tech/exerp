// Anbar React komponentləri. Anbar məntiqi warehouseDomain.ts-dədir; bu fayl onu köhnə idxallar üçün yenidən ixrac edir.
import { getDeliveryStockCheck, getDeliveryTotalQuantity, OrderProductLines } from "../../modules/warehouse/deliveryDomain.jsx";
import { Check, ChevronLeft, ChevronRight, Download, FileText, Filter, Package, Plus, RefreshCw, Search, ShoppingCart, SlidersHorizontal, Truck, Upload, Warehouse } from "lucide-react";
import { DataTable, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useEffect, useMemo, useState } from "react";
import { money, percent } from "../../services/format.js";
import {
  buildAggregateWarehouseStock,
  buildWarehouseStockAlerts,
  buildWarehouseSummaries,
  buildWarehouseTransferSuggestions,
  buildWarehouseWmsRows,
  filterRows,
  filterWarehouseItems,
  getAvailableQuantity,
  getWarehouseStockSummary,
  isLowStockItem,
  getSerialSummary,
  isSerialTrackedProduct,
  warehouseBalanceFilterDefaults,
  buildWarehouseBalanceRows,
  filterWarehouseBalanceRows,
  exportWarehouseBalanceCsv,
  getWarehouseBalanceStatus,
  getFreeQuantity,
  getShortageQuantity,
} from "./warehouseDomain.ts";

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

export {
  buildAggregateWarehouseStock,
  buildWarehouseStockAlerts,
  buildWarehouseSummaries,
  buildWarehouseTransferSuggestions,
  buildWarehouseWmsRows,
  filterRows,
  filterWarehouseItems,
  getAvailableQuantity,
  getWarehouseStockSummary,
  isLowStockItem,
  getSerialSummary,
  isSerialTrackedProduct,
  warehouseBalanceFilterDefaults,
  buildWarehouseBalanceRows,
  filterWarehouseBalanceRows,
  exportWarehouseBalanceCsv,
  getWarehouseBalanceStatus,
  getFreeQuantity,
  getShortageQuantity,
};
