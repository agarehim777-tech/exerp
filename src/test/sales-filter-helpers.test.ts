import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as sales from "../shared/lib/salesOrderHelpers.ts";
import * as filters from "../shared/lib/listFilterHelpers.ts";
import {
  buildSalesCreditForOrder,
  buildSellerBonusRows,
  calculateOrderLineTotal,
  productLineSignature,
  summarizeSellerBonusRows,
} from "../shared/lib/salesOrderHelpers.ts";
import {
  buildDriverDeliveryStats,
  getDeliveryActionLabel,
  matchesDeliveryFilter,
  matchesFinanceDateRange,
  matchesFinanceFilter,
  matchesFinanceSearch,
} from "../shared/lib/listFilterHelpers.ts";

const lines = [{ product: "Laptop", qty: 2, price: 500 }, { product: "Mouse", qty: 1, price: 20 }];

describe("sales order and list filter helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of [...Object.entries(sales), ...Object.entries(filters)]) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("keeps at most three sellers with non-negative bonuses", () => {
    const rows = [{ seller: "Ali", bonus: 5 }, { bonus: 9 }, { seller: "Vali", bonus: -2 }, { seller: "Rena", bonus: "3" }, { seller: "Kamal", bonus: 1 }];
    expect(buildSellerBonusRows(rows)).toEqual([{ seller: "Ali", bonus: 5 }, { seller: "Vali", bonus: 0 }, { seller: "Rena", bonus: 3 }]);
    expect(summarizeSellerBonusRows(rows)).toBe("Ali 5%, Vali 0%, Rena 3%");
  });

  it("totals order lines and builds a stable signature", () => {
    expect(calculateOrderLineTotal(lines)).toBe(1020);
    expect(productLineSignature(lines)).toBe("Laptop:2:500|Mouse:1:20");
    expect(calculateOrderLineTotal()).toBe(0);
  });

  it("builds a not-started sales credit and applies paid principal", () => {
    const order = { id: "SO-7", customer: "Ali", amount: 1200, initialPayment: 0, creditMonths: 12, productLines: lines };
    const fresh = buildSalesCreditForOrder(order);
    expect(fresh).toMatchObject({ id: "KR-7", orderId: "SO-7", salesSource: true, total: 1200, balance: 1200, months: 12, paidMonths: 0, status: "Başlanmamış", startDate: null });
    expect(fresh.installments).toHaveLength(12);

    const paid = buildSalesCreditForOrder(order, { id: "KR-7", status: "Aktiv", payments: [{ principal: 200 }] });
    expect(paid.balance).toBe(1000);
    expect(paid.paidMonths).toBe(2);
    expect(paid.rate).toBe(17);

    const closed = buildSalesCreditForOrder(order, { id: "KR-7", payments: [{ principal: 1200 }] });
    expect(closed).toMatchObject({ balance: 0, status: "Tamamlandı" });
  });

  it("labels and filters delivery orders", () => {
    expect(getDeliveryActionLabel({ status: "Təhvil verilib" })).toBe("Tamamlanıb");
    expect(getDeliveryActionLabel({ status: "Təhvilə çıxıb" })).toBe("Təhvili tamamla");
    expect(getDeliveryActionLabel({ status: "Hazırlanır" })).toBe("Növbəti mərhələ");
    expect(matchesDeliveryFilter({ status: "Yoldadır" }, "Hamısı")).toBe(true);
    expect(matchesDeliveryFilter({ status: "Təhvil verilib" }, "Aktiv")).toBe(false);
    expect(matchesDeliveryFilter({ status: "Yoldadır", risk: "Sürücü yoxdur" }, "Sürücü yoxdur")).toBe(true);
    expect(matchesDeliveryFilter({ status: "Yoldadır" }, "Yoldadır")).toBe(true);
  });

  it("computes driver load relative to the busiest driver", () => {
    const stats = buildDriverDeliveryStats([
      { driver: "Orxan", status: "Yoldadır", risk: "Normal" },
      { driver: "Orxan", status: "Hazırlanır", risk: "Gecikmə riski" },
      { driver: "Orxan", status: "Təhvil verilib", risk: "Tamamlandı" },
      { driver: "Elvin", status: "Hazırlanır", risk: "Normal" },
      { driver: "—", status: "Hazırlanır" },
    ]);
    expect(stats).toEqual([
      { driver: "Orxan", active: 2, completed: 1, outForDelivery: 1, risk: 1, load: 100 },
      { driver: "Elvin", active: 1, completed: 0, outForDelivery: 0, risk: 0, load: (1 / 3) * 100 },
    ]);
  });

  it("filters finance rows by type, date range and search text", () => {
    expect(matchesFinanceFilter({ direction: "in" }, "Daxilolma")).toBe(true);
    expect(matchesFinanceFilter({ penalty: 5 }, "Gecikmə gəliri")).toBe(true);
    expect(matchesFinanceFilter({ direction: "accrual" }, "Cash təsirsiz")).toBe(true);
    expect(matchesFinanceFilter({ type: "Satış" }, "Xərc")).toBe(false);
    expect(matchesFinanceFilter({}, "Hamısı")).toBe(true);

    expect(matchesFinanceDateRange({ date: "2026-11-10" }, "2026-11-01", "2026-11-30")).toBe(true);
    expect(matchesFinanceDateRange({ date: "2026-10-31" }, "2026-11-01", "")).toBe(false);
    expect(matchesFinanceDateRange({ date: "2026-12-01" }, "", "2026-11-30")).toBe(false);
    expect(matchesFinanceDateRange({}, "", "")).toBe(true);
    expect(matchesFinanceDateRange({}, "2026-11-01", "")).toBe(false);

    const row = { id: "TX-1", party: "Əli Məmmədov", orderId: "SO-55" };
    expect(matchesFinanceSearch(row, "  ")).toBe(true);
    expect(matchesFinanceSearch(row, "so-55")).toBe(true);
    expect(matchesFinanceSearch(row, "vali")).toBe(false);
  });
});
