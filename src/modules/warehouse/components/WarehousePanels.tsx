// Anbar panelləri: barkod nişanı, təhvil sifarişləri, toggle, anbar nəzarəti, stok filtr toolbar-ı və transfer tövsiyələri.
// Məntiq shared/lib/warehouseDomain.ts-dədir; appDomainWarehouse.jsx bunları yenidən ixrac edir.
import { Check, SlidersHorizontal, Truck } from "lucide-react";
import { type ComponentType, type ReactNode } from "react";
import { DataTable as LegacyDataTable, Panel, PanelHeader as LegacyPanelHeader, StatusBadge, TwoLine } from "../../../components/ui.jsx";
import { money, percent } from "../../../services/format.js";
import { getDeliveryStockCheck, getDeliveryTotalQuantity, OrderProductLines } from "../deliveryDomain.jsx";
import { type WarehouseStock } from "../../../shared/lib/warehouseDomain.ts";

type Row = Record<string, any>;

// ui.jsx is untyped JS, so TypeScript would treat its optional props (DataTable onRowClick, PanelHeader icon) as required.
const DataTable = LegacyDataTable as ComponentType<any>;
const PanelHeader = LegacyPanelHeader as ComponentType<any>;

export function BarcodeBadge({ barcode, qrPayload }: { barcode: string | number; qrPayload?: string }) {
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

export function DeliveryOrdersPanel({ orders, isAllWarehouses, warehouseStock = {}, onCompleteDelivery }: {
  orders: Row[];
  isAllWarehouses?: boolean;
  warehouseStock?: WarehouseStock;
  onCompleteDelivery: (orderId: string) => void;
}) {
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

export function Toggle({ label, checked, onChange, disabled = false }: {
  label: ReactNode;
  checked?: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="toggle-row" onClick={onChange} disabled={disabled} title={disabled ? "Bu ayarı dəyişmək üçün icazə yoxdur" : ""}>
      <span>{label}</span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}

export function WarehouseControlPanel({ summary, deliveryCount, alerts, isAllWarehouses, onSelect }: {
  summary: Row;
  deliveryCount: number;
  alerts: Row[];
  isAllWarehouses?: boolean;
  onSelect: (warehouseId: string) => void;
}) {
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

export function WarehouseStockToolbar({ filter, setFilter }: { filter: string; setFilter: (filter: string) => void }) {
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

export function WarehouseTransferPanel({ suggestions, onTransferStock }: { suggestions: Row[]; onTransferStock: (suggestion: Row) => void }) {
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
