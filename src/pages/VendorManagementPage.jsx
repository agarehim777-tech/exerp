import { useEffect, useMemo, useState } from "react";
import { Boxes, Building2, Eye, FileText, Package, Pencil, Plus, Search, Trash2, TrendingUp } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, ProgressRow, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, normalize, percent } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import {
  buildProcurementRows,
  currentBusinessQuarter,
  currentBusinessYear,
  isPurchaseOrderOpen,
} from "../shared/lib/appDomain.jsx";
import {
  getNormalizedVendor,
  getVendorKey,
} from "../shared/lib/appDomain.jsx";

export default VendorManagementPage;

function VendorManagementPage({
  vendors,
  warehouseStock = {},
  products = [],
  warehouses = [],
  orders = [],
  purchaseOrders = [],
  onCreateVendor,
  onEditVendor,
  onDeleteVendor,
  onCreatePurchaseOrder,
  onOpenPurchaseOrderModal,
  onApprovePurchaseOrder,
  canManagePo = false,
  canManageVendors = false,
}) {
  const [vendorQuery, setVendorQuery] = useState("");
  const [vendorStatusFilter, setVendorStatusFilter] = useState("all");
  const [poStatusFilter, setPoStatusFilter] = useState("all");
  const [selectedVendorKey, setSelectedVendorKey] = useState("");
  const normalizedVendors = useMemo(() => vendors.map(getNormalizedVendor), [vendors]);
  const procurementRows = useMemo(
    () => buildProcurementRows(normalizedVendors, warehouseStock, orders, products, purchaseOrders),
    [normalizedVendors, warehouseStock, orders, products, purchaseOrders],
  );
  const visibleVendors = useMemo(() => {
    const query = normalize(vendorQuery);
    return normalizedVendors.filter((vendor) => {
      const matchesStatus = vendorStatusFilter === "all" || vendor.status === vendorStatusFilter;
      const matchesQuery =
        !query ||
        normalize(`${vendor.name} ${vendor.country} ${vendor.contact} ${vendor.phone} ${vendor.email}`).includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [normalizedVendors, vendorQuery, vendorStatusFilter]);
  const purchaseNeed = useMemo(
    () => procurementRows.filter((row) => Number(row.recommendedQty || 0) > 0 || Number(row.orderGap || 0) > 0),
    [procurementRows],
  );
  const filteredPurchaseOrders = useMemo(() => {
    if (poStatusFilter === "all") return purchaseOrders;
    if (poStatusFilter === "open") return purchaseOrders.filter(isPurchaseOrderOpen);
    if (poStatusFilter === "approved") return purchaseOrders.filter((po) => !isPurchaseOrderOpen(po));
    return purchaseOrders.filter((po) => po.status === poStatusFilter);
  }, [purchaseOrders, poStatusFilter]);

  useEffect(() => {
    const pool = visibleVendors.length > 0 ? visibleVendors : normalizedVendors;
    if (pool.length === 0) {
      if (selectedVendorKey) setSelectedVendorKey("");
      return;
    }
    if (!selectedVendorKey || !pool.some((vendor) => getVendorKey(vendor) === selectedVendorKey)) {
      setSelectedVendorKey(getVendorKey(pool[0]));
    }
  }, [normalizedVendors, selectedVendorKey, visibleVendors]);

  const selectedVendor =
    normalizedVendors.find((vendor) => getVendorKey(vendor) === selectedVendorKey) || visibleVendors[0] || normalizedVendors[0] || null;
  const selectedVendorPurchaseOrders = selectedVendor
    ? purchaseOrders.filter(
        (po) => normalize(po.vendor) === normalize(selectedVendor.name) || normalize(po.supplierSource) === normalize(selectedVendor.name),
      )
    : [];
  const selectedVendorProcurementRows = selectedVendor
    ? procurementRows.filter((row) => normalize(row.vendor) === normalize(selectedVendor.name)).slice(0, 5)
    : [];
  const procurementBudget = purchaseNeed.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0);
  const openPoQty = purchaseOrders.filter(isPurchaseOrderOpen).reduce((sum, po) => sum + Number(po.qty || 0), 0);
  const vendorRiskCount = normalizedVendors.filter((vendor) => {
    const status = normalize(vendor.status);
    return status.includes("risk") || status.includes("nəzarət") || status.includes("nezaret");
  }).length;
  const pendingPoCount = purchaseOrders.filter((po) => po.status === "Təsdiq gözləyir").length;
  const activeVendorCount = normalizedVendors.filter((vendor) => !normalize(vendor.status).includes("passiv")).length;
  const quotaTotal = total(normalizedVendors, "quota");
  const quotaRatio = quotaTotal > 0 ? (total(normalizedVendors, "sold") / quotaTotal) * 100 : 0;
  const selectedVendorQuota = selectedVendor?.quota > 0 ? (selectedVendor.sold / selectedVendor.quota) * 100 : 0;
  const selectedVendorHasOpenPo = selectedVendorPurchaseOrders.some(isPurchaseOrderOpen);
  const vendorStatuses = ["all", ...new Set(normalizedVendors.map((vendor) => vendor.status).filter(Boolean))];

  return (
    <div className="stack vendor-module">
      <section className="metric-grid four">
        <MetricCard label="Aktiv vendorlar" value={activeVendorCount} trend={`${normalizedVendors.length} ümumi`} icon={Building2} tone="primary" />
        <MetricCard label="Ümumi SKU" value={total(normalizedVendors, "sku")} trend={`${warehouses.length} anbar`} icon={Boxes} tone="info" />
        <MetricCard label="Kvota icrası" value={percent(quotaRatio)} trend={`Q${currentBusinessQuarter} ${currentBusinessYear}`} icon={TrendingUp} tone="success" />
        <MetricCard
          label="PO tövsiyəsi"
          value={pendingPoCount || purchaseNeed.length}
          trend={pendingPoCount > 0 ? `${pendingPoCount} təsdiq gözləyir` : money(procurementBudget)}
          icon={Package}
          tone={purchaseNeed.length > 0 ? "warning" : "success"}
        />
      </section>

      <Panel className="vendor-command-panel">
        <div className="vendor-command-head">
          <PanelHeader title="Vendor idarəetməsi" subtitle="Təchizatçı profili, kontakt, kvota, PO və anbar mədaxil axını bir ekrandadır" icon={Building2} />
          <div className="vendor-command-actions">
            <button className="secondary-btn" type="button" disabled={!canManagePo || products.length === 0 || warehouses.length === 0} onClick={onOpenPurchaseOrderModal}>
              <Package size={16} />
              Zavod sifarişi
            </button>
            <button className="primary-btn" type="button" disabled={!canManageVendors} onClick={onCreateVendor}>
              <Plus size={16} />
              Yeni vendor
            </button>
          </div>
        </div>
        <div className="vendor-toolbar">
          <label className="vendor-search">
            <Search size={16} />
            <input value={vendorQuery} placeholder="Vendor, ölkə, kontakt üzrə axtar" onChange={(event) => setVendorQuery(event.target.value)} />
          </label>
          <label>
            <span>Status</span>
            <select value={vendorStatusFilter} onChange={(event) => setVendorStatusFilter(event.target.value)}>
              {vendorStatuses.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "Bütün statuslar" : status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>PO</span>
            <select value={poStatusFilter} onChange={(event) => setPoStatusFilter(event.target.value)}>
              <option value="all">Bütün PO-lar</option>
              <option value="open">Açıq PO</option>
              <option value="approved">Mədaxil edilmiş</option>
              <option value="Təsdiq gözləyir">Təsdiq gözləyir</option>
            </select>
          </label>
        </div>
      </Panel>

      <section className="vendor-workspace">
        <Panel className="vendor-registry-panel">
          <PanelHeader title="Vendor reyestri" subtitle={`${visibleVendors.length} nəticə`} icon={FileText} />
          <DataTable
            columns={["Vendor", "Kontakt", "SKU", "Kvota", "Lead time", "Status", "Əməliyyat"]}
            rows={visibleVendors.map((vendor) => {
              const key = getVendorKey(vendor);
              const ratio = vendor.quota > 0 ? (vendor.sold / vendor.quota) * 100 : 0;
              const vendorHasOpenPo = purchaseOrders.some(
                (po) =>
                  isPurchaseOrderOpen(po) &&
                  (normalize(po.vendor) === normalize(vendor.name) || normalize(po.supplierSource) === normalize(vendor.name)),
              );
              return [
                <button
                  className={`vendor-row-button ${selectedVendor && getVendorKey(selectedVendor) === key ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedVendorKey(key)}
                >
                  <TwoLine title={vendor.name} subtitle={vendor.country || "Ölkə qeyd edilməyib"} />
                </button>,
                <TwoLine title={vendor.contact || "Kontakt yoxdur"} subtitle={vendor.phone || vendor.email || "Əlaqə əlavə edilməyib"} />,
                <TwoLine title={`${vendor.sku} SKU`} subtitle={vendor.note || "Məhsul qrupu qeyd edilməyib"} />,
                <div className="vendor-quota-cell">
                  <ProgressRow label={percent(ratio)} value={ratio} caption={`${vendor.sold}/${vendor.quota}`} compact />
                </div>,
                <TwoLine title={`${vendor.leadTimeDays || 0} gün`} subtitle={vendor.paymentTerms || "Şərt yoxdur"} />,
                <StatusBadge status={vendor.status} />,
                <div className="row-actions vendor-row-actions">
                  <button className="text-btn" type="button" disabled={!canManageVendors} onClick={() => onEditVendor(key)}>
                    Redaktə
                  </button>
                  <button
                    className="text-btn danger"
                    type="button"
                    disabled={!canManageVendors || vendorHasOpenPo}
                    title={vendorHasOpenPo ? "Açıq PO olan vendor silinə bilməz" : "Vendoru sil"}
                    onClick={() => onDeleteVendor(key)}
                  >
                    Sil
                  </button>
                </div>,
              ];
            })}
          />
        </Panel>

        <Panel className="vendor-profile-panel">
          <PanelHeader title="Vendor profili" subtitle="Seçilən vendor üzrə əməliyyat görünüşü" icon={Eye} />
          {selectedVendor ? (
            <div className="vendor-profile-card">
              <div className="vendor-profile-head">
                <div>
                  <h3>{selectedVendor.name}</h3>
                  <p>{selectedVendor.country || "Ölkə qeyd edilməyib"}</p>
                </div>
                <StatusBadge status={selectedVendor.status} />
              </div>
              <div className="vendor-profile-grid">
                <TwoLine title={selectedVendor.contact || "Kontakt yoxdur"} subtitle={selectedVendor.phone || selectedVendor.email || "Əlaqə əlavə edilməyib"} />
                <TwoLine title={`${selectedVendor.leadTimeDays || 0} gün`} subtitle="Orta lead time" />
                <TwoLine title={selectedVendor.paymentTerms || "Şərt yoxdur"} subtitle="Ödəniş şərti" />
                <TwoLine title={`${selectedVendorPurchaseOrders.length} PO`} subtitle={`${selectedVendorPurchaseOrders.filter(isPurchaseOrderOpen).length} açıq`} />
              </div>
              <div className="vendor-profile-quota">
                <div>
                  <span>Kvota icrası</span>
                  <strong>{percent(selectedVendorQuota)}</strong>
                </div>
                <ProgressRow label={`${selectedVendor.sold}/${selectedVendor.quota}`} value={selectedVendorQuota} compact />
              </div>
              {selectedVendor.note && <p className="vendor-note">{selectedVendor.note}</p>}
              <div className="vendor-profile-actions">
                <button className="secondary-btn" type="button" disabled={!canManageVendors} onClick={() => onEditVendor(getVendorKey(selectedVendor))}>
                  <Pencil size={16} />
                  Redaktə et
                </button>
                <button
                  className="secondary-btn danger-outline"
                  type="button"
                  disabled={!canManageVendors || selectedVendorHasOpenPo}
                  title={selectedVendorHasOpenPo ? "Açıq PO olan vendor silinə bilməz" : "Vendoru sil"}
                  onClick={() => onDeleteVendor(getVendorKey(selectedVendor))}
                >
                  <Trash2 size={16} />
                  Sil
                </button>
              </div>
              <div className="vendor-profile-subsection">
                <h4>Tövsiyə olunan məhsullar</h4>
                {selectedVendorProcurementRows.length > 0 ? (
                  <div className="vendor-recommendation-list">
                    {selectedVendorProcurementRows.map((row) => (
                      <div key={row.product}>
                        <TwoLine title={row.product} subtitle={`Anbarda: ${row.available} · Minimum: ${row.reorderPoint}`} />
                        <button className="text-btn" type="button" disabled={!canManagePo || row.orderGap <= 0} onClick={() => onCreatePurchaseOrder(row)}>
                          {row.orderGap > 0 ? `${row.orderGap} ədəd PO` : "Bağlıdır"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Bu vendor üzrə təcili satınalma ehtiyacı yoxdur" />
                )}
              </div>
            </div>
          ) : (
            <EmptyState title="Vendor seçilməyib" />
          )}
        </Panel>
      </section>

      <Panel className="procurement-panel">
        <PanelHeader title="Procurement planı" subtitle="Anbar qalığı və satış tempinə görə vendor üzrə sifariş tövsiyələri" icon={Package} />
        <div className="procurement-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={!canManagePo || products.length === 0 || warehouses.length === 0}
            title={products.length === 0 || warehouses.length === 0 ? "Əvvəl məhsul və anbar yaradın" : "Zavoddan məhsul sifarişi yaradın"}
            onClick={onOpenPurchaseOrderModal}
          >
            <Plus size={16} />
            PO yarat
          </button>
        </div>
        <div className="procurement-summary-grid">
          <div>
            <span>Satınalma büdcəsi</span>
            <strong>{money(procurementBudget)}</strong>
            <small>{purchaseNeed.length} məhsul üçün PO açıla bilər</small>
          </div>
          <div>
            <span>Vendor riski</span>
            <strong>{vendorRiskCount}</strong>
            <small>Kvota və icra nəzarəti</small>
          </div>
          <div>
            <span>Sifarişdə</span>
            <strong>{openPoQty}</strong>
            <small>Açıq PO üzrə yolda olan məhsul</small>
          </div>
        </div>
        <DataTable
          columns={["Məhsul", "Vendor", "Satış", "Satış üçün", "Minimum", "Tövsiyə", "Sifarişdə", "Büdcə", "Status", "PO"]}
          rows={procurementRows.slice(0, 10).map((row) => [
            <strong>{row.product}</strong>,
            row.vendor,
            `${row.sold} ədəd`,
            `${row.available} ədəd`,
            row.reorderPoint > 0 ? `${row.reorderPoint} ədəd` : "—",
            row.recommendedQty > 0 ? `${row.recommendedQty} ədəd` : "Yoxdur",
            row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} ədəd`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "Yoxdur",
            row.estimatedCost > 0 ? money(row.estimatedCost) : "—",
            <StatusBadge status={row.status} />,
            <button className="text-btn" disabled={!canManagePo || row.orderGap <= 0} onClick={() => onCreatePurchaseOrder(row)}>
              {row.orderGap > 0 ? "PO yarat" : "Bağlıdır"}
            </button>,
          ])}
        />
      </Panel>

      <Panel className="po-action-panel">
        <div className="po-panel-head">
          <PanelHeader title="Purchase Order axını" subtitle="PO təsdiqlənəndə məhsul avtomatik anbara mədaxil edilir və alış xərci maliyyəyə düşür" icon={FileText} />
          <span>{filteredPurchaseOrders.length}/{purchaseOrders.length} PO</span>
        </div>
        <DataTable
          columns={["PO", "Mənbə", "Məhsul", "Anbar", "Say", "Alış", "Məbləğ", "Gözlənən", "Status", "Əməliyyat"]}
          rows={filteredPurchaseOrders.map((po) => [
            <strong>{po.id}</strong>,
            <TwoLine title={po.vendor} subtitle={po.supplierSource || po.procurementType || "Vendor PO"} />,
            po.product,
            po.warehouseName,
            `${po.qty} ədəd`,
            money(Number(po.unitCost || (Number(po.amount || 0) / Math.max(1, Number(po.qty || 1))) || 0)),
            money(po.amount),
            po.expectedAt || "—",
            <StatusBadge status={po.status} />,
            po.status === "Təsdiq gözləyir" ? (
              <button className="text-btn" disabled={!canManagePo} onClick={() => onApprovePurchaseOrder(po.id)}>Təsdiq et</button>
            ) : (
              <TwoLine title="Mədaxil edilib" subtitle={po.receivedAt || po.approvedAt} />
            ),
          ])}
        />
      </Panel>
    </div>
  );
}
