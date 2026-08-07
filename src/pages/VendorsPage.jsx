import { Boxes, Building2, FileText, Package, Plus, TrendingUp } from "lucide-react";
import { DataTable, MetricCard, Panel, PanelHeader, ProgressRow, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, normalize, percent } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useMemo } from "react";
import { buildProcurementRows, currentBusinessQuarter, currentBusinessYear, isPurchaseOrderOpen } from "../shared/lib/appDomain.jsx";
export default function VendorsPage({
  vendors,
  warehouseStock = {},
  products = [],
  warehouses = [],
  orders = [],
  purchaseOrders = [],
  onCreatePurchaseOrder,
  onOpenPurchaseOrderModal,
  onApprovePurchaseOrder,
  canManagePo = false,
}) {
  const procurementRows = useMemo(
    () => buildProcurementRows(vendors, warehouseStock, orders, products, purchaseOrders),
    [vendors, warehouseStock, orders, products, purchaseOrders],
  );
  const purchaseNeed = procurementRows.filter((row) => row.recommendedQty > 0);
  const procurementBudget = purchaseNeed.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0);
  const openPoQty = purchaseOrders.filter(isPurchaseOrderOpen).reduce((sum, po) => sum + Number(po.qty || 0), 0);
  const vendorRiskCount = vendors.filter(
    (vendor) => normalize(vendor.status).includes("risk") || normalize(vendor.status).includes("aşağı"),
  ).length;
  const pendingPoCount = purchaseOrders.filter((po) => po.status === "Təsdiq gözləyir").length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Aktiv vendorlar" value={vendors.length} icon={Building2} tone="primary" />
        <MetricCard label="Ümumi SKU" value={total(vendors, "sku")} trend="+24 bu ay" icon={Boxes} tone="info" />
        <MetricCard
          label="Kvota icrası"
          value={percent((total(vendors, "sold") / total(vendors, "quota")) * 100)}
          trend={`Q${currentBusinessQuarter} ${currentBusinessYear}`}
          icon={TrendingUp}
          tone="success"
        />
        <MetricCard
          label="PO tövsiyəsi"
          value={pendingPoCount || purchaseNeed.length}
          trend={pendingPoCount > 0 ? `${pendingPoCount} təsdiq gözləyir` : money(procurementBudget)}
          icon={Package}
          tone={purchaseNeed.length > 0 ? "warning" : "success"}
        />
      </section>
      <Panel className="procurement-panel">
        <PanelHeader
          title="Procurement planı"
          subtitle="Anbar qalığı və satış tempinə görə vendor üzrə sifariş tövsiyələri"
          icon={Package}
        />
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
          rows={procurementRows.slice(0, 8).map((row) => [
            <strong>{row.product}</strong>,
            row.vendor,
            `${row.sold} ədəd`,
            `${row.available} ədəd`,
            row.reorderPoint > 0 ? `${row.reorderPoint} ədəd` : "—",
            row.recommendedQty > 0 ? `${row.recommendedQty} ədəd` : "Yoxdur",
            row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} ədəd`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "Yoxdur",
            row.estimatedCost > 0 ? money(row.estimatedCost) : "—",
            <StatusBadge status={row.status} />,
            <button
              className="text-btn"
              disabled={!canManagePo || row.orderGap <= 0}
              onClick={() => onCreatePurchaseOrder(row)}
            >
              {row.orderGap > 0 ? "PO yarat" : "Bağlıdır"}
            </button>,
          ])}
        />
      </Panel>
      <Panel className="po-action-panel">
        <PanelHeader
          title="Purchase Order axını"
          subtitle="PO təsdiqlənəndə məhsul avtomatik anbara mədaxil edilir və alış xərci maliyyəyə düşür"
          icon={FileText}
        />
        <DataTable
          columns={["PO", "Mənbə", "Məhsul", "Anbar", "Say", "Alış", "Məbləğ", "Gözlənən", "Status", "Əməliyyat"]}
          rows={purchaseOrders.map((po) => [
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
              <button className="text-btn" disabled={!canManagePo} onClick={() => onApprovePurchaseOrder(po.id)}>
                Təsdiq et
              </button>
            ) : (
              <TwoLine title="Mədaxil edilib" subtitle={po.receivedAt || po.approvedAt} />
            ),
          ])}
        />
      </Panel>
      <Panel>
        <PanelHeader title={`Vendor Kvota Cədvəli — ${currentBusinessYear} Q${currentBusinessQuarter}`} subtitle="Satış hədəfi və risk statusu" />
        <DataTable
          columns={["Vendor", "Ölkə", "SKU", "Satılıb", "Kvota", "İcra", "Status"]}
          rows={vendors.map((vendor) => [
            <strong>{vendor.name}</strong>,
            vendor.country,
            vendor.sku,
            vendor.sold,
            vendor.quota,
            <ProgressRow label="" value={(vendor.sold / vendor.quota) * 100} compact />,
            <StatusBadge status={vendor.status} />,
          ])}
        />
      </Panel>
    </div>
  );
}

// VendorManagementPage extracted to src/pages/VendorManagementPage.jsx