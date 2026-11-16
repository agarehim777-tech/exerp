import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as legacy from "../shared/lib/appDomainWarehouse.jsx";
import * as barrel from "../shared/lib/appDomain.jsx";
import * as balances from "../modules/warehouse/components/WarehouseBalances.tsx";
import * as panels from "../modules/warehouse/components/WarehousePanels.tsx";
import { WarehouseBalanceFilters, WarehouseBalanceTable, WarehouseBalancesWorkspace } from "../modules/warehouse/components/WarehouseBalances.tsx";
import {
  BarcodeBadge,
  DeliveryOrdersPanel,
  Toggle,
  WarehouseControlPanel,
  WarehouseStockToolbar,
  WarehouseTransferPanel,
} from "../modules/warehouse/components/WarehousePanels.tsx";
import { warehouseBalanceFilterDefaults } from "../shared/lib/warehouseDomain.ts";

afterEach(cleanup);

const warehouses = [{ id: "W1", name: "Bakı" }];
const products = [{ id: "P1", name: "Kabel", category: "Aksesuar", reorderLevel: 5 }, { id: "P2", name: "Adapter", category: "Aksesuar", reorderLevel: 2 }];
const warehouseStock = { W1: [{ product: "Kabel", total: 20, reserved: 2, price: 10 }] };

describe("warehouse components", () => {
  it("stays importable from appDomainWarehouse.jsx and the appDomain barrel", () => {
    for (const [name, value] of [...Object.entries(balances), ...Object.entries(panels)]) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(value);
      expect((barrel as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it("keeps the totals cell spanning four columns", () => {
    const { container } = render(<WarehouseBalanceTable rows={[{ key: "1", product: "Kabel", total: 3, status: "Normal" }]} view="warehouses" onEditProduct={vi.fn()} onCreateProduct={vi.fn()} />);
    expect(container.querySelector("tfoot td")?.getAttribute("colspan")).toBe("4");
  });

  it("filters the balance workspace and runs its menu actions", () => {
    const onReceiveStock = vi.fn();
    const onTrackAction = vi.fn();
    const { container, getByText } = render(
      <WarehouseBalancesWorkspace
        warehouses={warehouses} warehouseStock={warehouseStock} products={products} query=""
        onReceiveStock={onReceiveStock} onOpenImport={vi.fn()} onCreateProduct={vi.fn()} onEditProduct={vi.fn()}
        onOpenOperations={vi.fn()} onTrackAction={onTrackAction}
      />,
    );
    const body = container.querySelector(".warehouse-balance-table tbody") as HTMLElement;
    expect(within(body).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(getByText("Ehtiyatı tamamla"));
    expect(within(body).getAllByRole("row")).toHaveLength(1);
    expect(within(body).getByText("Adapter")).toBeTruthy();
    expect(onTrackAction).toHaveBeenCalledWith("Ehtiyat tamamlama siyahısı açıldı", "1 məhsul/anbar sətrinə minimum stok filtri tətbiq edildi");
    fireEvent.click(getByText("Əməliyyatlar"));
    fireEvent.click(getByText("Mədaxil et"));
    expect(onReceiveStock).toHaveBeenCalledOnce();
  });

  it("reports filter edits and hides the filter panel when closed", () => {
    const onChange = vi.fn();
    const props = { filters: warehouseBalanceFilterDefaults, warehouses, categories: ["Aksesuar"], onChange, onApply: vi.fn(), onClear: vi.fn() };
    const { container, rerender } = render(<WarehouseBalanceFilters {...props} open />);
    fireEvent.click(container.querySelector(".warehouse-minimum-toggle input") as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("belowMinimum", true);
    rerender(<WarehouseBalanceFilters {...props} open={false} />);
    expect(container.querySelector(".warehouse-balance-filters")).toBeNull();
  });

  it("renders the barcode, toggle and stock toolbar", () => {
    const barcode = render(<BarcodeBadge barcode="869100000001" qrPayload="ERPZ|SKU" />);
    expect(barcode.container.querySelectorAll("rect")).toHaveLength(12);
    const onChange = vi.fn();
    const toggle = render(<Toggle label="Bildiriş" checked onChange={onChange} />);
    fireEvent.click(toggle.getByText("Bildiriş"));
    expect(onChange).toHaveBeenCalledOnce();
    expect(toggle.container.querySelector(".switch.on")).toBeTruthy();
    const setFilter = vi.fn();
    const toolbar = render(<WarehouseStockToolbar filter="Hamısı" setFilter={setFilter} />);
    fireEvent.click(toolbar.getByText("Rezervdə"));
    expect(setFilter).toHaveBeenCalledWith("Rezervdə");
  });

  it("shows control signals, transfers and blocked deliveries", () => {
    const onSelect = vi.fn();
    const control = render(
      <WarehouseControlPanel summary={{ available: 5, value: 50, reserved: 1, reservedRate: 10, utilization: 20, sku: 2 }} deliveryCount={3}
        alerts={[{ warehouseId: "W1", warehouseName: "Bakı", product: "Kabel", available: 1, status: "Kritik stok" }]} onSelect={onSelect} />,
    );
    fireEvent.click(control.getByText("Kabel"));
    expect(onSelect).toHaveBeenCalledWith("W1");

    const onTransferStock = vi.fn();
    const suggestion = { product: "Kabel", fromWarehouse: "Bakı", toWarehouse: "Gəncə", qty: 3, reason: "az qalıb" };
    const transfer = render(<WarehouseTransferPanel suggestions={[suggestion]} onTransferStock={onTransferStock} />);
    fireEvent.click(transfer.getByText("Transfer et"));
    expect(onTransferStock).toHaveBeenCalledWith(suggestion);

    const delivery = render(<DeliveryOrdersPanel orders={[{ id: "SO-1", customer: "Ali", productLines: [] }]} onCompleteDelivery={vi.fn()} />);
    expect((delivery.getByText("Təhvil verildi") as HTMLButtonElement).disabled).toBe(true);
  });
});
