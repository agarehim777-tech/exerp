// Anbar qalıqları: qalıq iş sahəsi (filtr, CSV ixrac, çap, ehtiyat tamamlama), filtr paneli, səhifələnən qalıq cədvəli
// və anbarlar üzrə paylanma. Məntiq shared/lib/warehouseDomain.ts-dədir; appDomainWarehouse.jsx bunları yenidən ixrac edir.
import { ChevronLeft, ChevronRight, Download, FileText, Filter, Package, Plus, RefreshCw, Search, ShoppingCart, Upload, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge, TwoLine } from "../../../shared/ui/primitives.tsx";
import { money } from "../../../services/format.js";
import { warehouseBalanceFilterDefaults, buildWarehouseBalanceRows, filterWarehouseBalanceRows, exportWarehouseBalanceCsv, type WarehouseStock } from "../../../shared/lib/warehouseDomain.ts";

type Row = Record<string, any>;

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
}: {
  warehouses: Row[];
  warehouseStock: WarehouseStock;
  products: Row[];
  purchaseOrders?: Row[];
  query: string;
  onQueryChange?: (query: string) => void;
  onReceiveStock: () => void;
  onOpenImport: () => void;
  onCreateProduct: () => void;
  onEditProduct: (productId: string) => void;
  onOpenProduct?: (productId: string) => void;
  onOpenOperations: () => void;
  onTrackAction?: (title: string, detail: string) => void;
}) {
  const view = "warehouses";
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [draftFilters, setDraftFilters] = useState<Row>(() => ({ ...warehouseBalanceFilterDefaults }));
  const [activeFilters, setActiveFilters] = useState<Row>(() => ({ ...warehouseBalanceFilterDefaults }));
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const categories = useMemo(
    () => [...new Set<string>(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "az")),
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

  function changeDraftFilter(key: string, value: unknown) {
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
            <Filter size={16} /> Filtr
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
              <ShoppingCart size={16} /> Əməliyyatlar <ChevronRight size={16} />
            </button>
            {actionMenuOpen && (
              <div className="warehouse-action-menu-popover">
                <button type="button" onClick={() => { setActionMenuOpen(false); onReceiveStock(); }}><Plus size={16} /> Mədaxil et</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenImport(); }}><Upload size={16} /> Toplu idxal</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onCreateProduct(); }}><Package size={16} /> Məhsul yarat</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenOperations(); }}><Warehouse size={16} /> Anbar idarəetməsi</button>
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

export function WarehouseBalanceFilters({ filters, warehouses, categories, open, onChange, onApply, onClear }: {
  filters: Row;
  warehouses: Row[];
  categories: string[];
  open: boolean;
  onChange: (key: string, value: unknown) => void;
  onApply: () => void;
  onClear: () => void;
}) {
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
          <option value="batch">Partiya</option>
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

export function WarehouseBalanceTable({ rows, view, onEditProduct, onOpenProduct, onCreateProduct }: {
  rows: Row[];
  view: string;
  onEditProduct: (productId: string) => void;
  onOpenProduct?: (productId: string) => void;
  onCreateProduct: () => void;
}) {
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
                  <span className="warehouse-product-thumb">{row.imageUrl ? <img src={row.imageUrl} alt="" /> : <Package size={16} />}</span>
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
              <td colSpan={4}>Cəmi</td><td>{totals.total}</td><td>—</td><td>{totals.reserved}</td><td>{totals.problem}</td><td className="balance-qty good">{totals.available}</td><td>{totals.orderedQty || "—"}</td><td>{totals.recommendedQty || "—"}</td><td>—</td><td>—</td><td>{money(totals.stockValue)}</td><td>{money(totals.salesValue)}</td><td>—</td>{view === "products" && <td>—</td>}
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

export function WarehouseDistribution({ distribution }: { distribution: Row[] }) {
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
