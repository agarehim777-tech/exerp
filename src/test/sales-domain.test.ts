import { describe, expect, it } from "vitest";
import * as bridge from "../shared/lib/appDomainSales.jsx";
import {
  buildCrmPipelineRows,
  buildSalesBonusRows,
  getCreditContract,
  getCreditOrder,
  getCustomerContracts,
  getCustomerOrders,
  getCustomerRelatedCredits,
  getLatestOrder,
  getOrderBonusAmount,
  getOrderBonusText,
  getOrderCredit,
  getOrderProductRows,
  getOrderSellerBonuses,
  getSalesCashImpact,
  getSalesOrderRiskStatus,
  getShortSellerName,
  matchesCrmCustomerSearch,
  matchesCrmCustomerSegment,
  matchesCrmPipelineFilter,
  matchesSalesDateRange,
  matchesSalesOrderFilter,
  matchesSalesOrderSearch,
  parseSellerBonusText,
  sortByBusinessDateDesc,
} from "../shared/lib/salesDomain.ts";
import { currentBusinessDate } from "../shared/lib/businessDate";
import { formatDateInput } from "../services/date.js";

const daysAgo = (days: number) => {
  const date = new Date(`${currentBusinessDate}T00:00:00`);
  date.setDate(date.getDate() - days);
  return formatDateInput(date);
};

describe("sales domain", () => {
  it("keeps the old appDomainSales imports working", () => {
    expect(bridge.buildCustomer360).toBeTypeOf("function");
    expect(bridge.matchesSalesOrderSearch).toBe(matchesSalesOrderSearch);
    expect(bridge.Customer360Modal).toBeTypeOf("function");
  });

  it("reads seller bonuses from the list or the legacy text and computes bonus rows", () => {
    expect(parseSellerBonusText("Elvin Quliyev 2%, Nigar 1.5%, xətalı")).toEqual([
      { seller: "Elvin Quliyev", bonus: 2 },
      { seller: "Nigar", bonus: 1.5 },
    ]);
    const order = { id: "S-1", date: "2026-11-01", customer: "Aysel", paid: 1000, seller: "Elvin Quliyev 2%, Nigar 1.5%", productLines: [{ product: "Telefon", qty: 1, price: 1000 }] };
    expect(getOrderSellerBonuses({ sellerBonuses: [{ seller: "Rəşad", bonus: 3 }], seller: "Elvin 2%" })).toEqual([{ seller: "Rəşad", bonus: 3 }]);
    expect(getOrderBonusAmount(order)).toBe(35);
    expect(getOrderBonusText(order)).toBe("Elvin 2%, Nigar 1.5%");
    expect(getOrderBonusText({ seller: "" })).toBe("Bonus yoxdur");
    expect(getShortSellerName("  Elvin Quliyev ")).toBe("Elvin");
    expect(buildSalesBonusRows([order]).map((row) => [row.id, row.seller, row.bonusAmount, row.paymentMethod])).toEqual([
      ["S-1-Elvin Quliyev-2", "Elvin Quliyev", 20, "Nağd"],
      ["S-1-Nigar-1.5", "Nigar", 15, "Nağd"],
    ]);
  });

  it("filters, searches and dates sales orders", () => {
    const credit = { id: "S-2", paymentMethod: "Kredit", amount: 500, paid: 100, status: "Təhvil verilib", date: daysAgo(1), customer: "İsmayıl", seller: "Leyla 2%" };
    const fresh = { id: "S-3", amount: 200, paid: 200, status: "Gözləyir", date: daysAgo(1) };
    const stale = { id: "S-4", amount: 200, paid: 200, status: "Gözləyir", date: daysAgo(5) };
    const done = { id: "S-5", amount: 200, paid: 200, status: "Təhvil verilib", date: daysAgo(5) };
    expect(matchesSalesOrderFilter(credit, "Kredit")).toBe(true);
    expect(matchesSalesOrderFilter(fresh, "Nağd")).toBe(true);
    expect(matchesSalesOrderFilter(credit, "Qalıqlı")).toBe(true);
    expect([credit, fresh, stale, done].filter((order) => matchesSalesOrderFilter(order, "Riskli")).map((o) => o.id)).toEqual(["S-2", "S-4"]);
    expect(matchesSalesOrderFilter(done, "Tamamlanan")).toBe(true);
    expect(matchesSalesOrderFilter(done, "Hamısı")).toBe(true);
    expect([credit, fresh, stale, done].map(getSalesOrderRiskStatus)).toEqual(["Borclu", "Təhvil gözləyir", "Təhvil riski", "Tamamlanıb"]);
    expect(getSalesOrderRiskStatus({ amount: 10, paid: 0, status: "Gözləyir", date: daysAgo(1) })).toBe("Borclu + təhvil");
    expect(matchesSalesOrderSearch(credit, "ismayil")).toBe(true);
    expect(matchesSalesOrderSearch(credit, "leyla")).toBe(true);
    expect(matchesSalesOrderSearch(credit, "yoxdur")).toBe(false);
    expect(matchesSalesOrderSearch(credit, "  ")).toBe(true);
    expect(matchesSalesDateRange({ date: "2026-11-10" }, "2026-11-01", "2026-11-30")).toBe(true);
    expect(matchesSalesDateRange({ date: "2026-10-10" }, "2026-11-01", null)).toBe(false);
    expect(matchesSalesDateRange({ date: "" }, null, null)).toBe(true);
    expect(matchesSalesDateRange({ date: "" }, "2026-11-01", null)).toBe(false);
    expect(getSalesCashImpact({ paid: -5 })).toBe(0);
  });

  it("links customers, orders, credits and contracts by FIN or name", () => {
    const customer = { fin: "FIN1", name: "Aysel Məmmədova" };
    const orders = [
      { id: "O1", fin: "FIN1", date: "2026-10-01", creditId: "C1" },
      { id: "O2", customer: "aysel məmmədova", date: "2026-11-05", contractId: "K2" },
      { id: "O3", fin: "FIN9", date: "2026-11-09" },
    ];
    const credits = [{ id: "C1", fin: "FIN1" }, { id: "C2", customer: "Aysel Məmmədova", contractId: "K2" }];
    const contracts = [{ id: "K2", fin: "FIN1" }, { id: "K9", creditId: "C9" }];
    expect(getCustomerOrders(customer, orders).map((o) => o.id)).toEqual(["O1", "O2"]);
    expect(getCustomerRelatedCredits(customer, credits).map((c) => c.id)).toEqual(["C1", "C2"]);
    expect(getCustomerContracts(customer, contracts).map((c) => c.id)).toEqual(["K2"]);
    expect(getLatestOrder(orders)?.id).toBe("O3");
    expect(getCreditOrder(credits[0], orders)?.id).toBe("O1");
    expect(getCreditOrder(credits[1], orders)?.id).toBe("O2");
    expect(getCreditOrder({ id: "X" }, orders)).toBeNull();
    expect(getCreditContract(credits[1], contracts)?.id).toBe("K2");
    expect(getCreditContract({ id: "C9" }, contracts)?.id).toBe("K9");
    expect(getOrderCredit(orders[1], credits)?.id).toBe("C2");
    expect([{ date: "01.10.2026" }, { date: "2026-11-01" }].sort(sortByBusinessDateDesc).map((row) => row.date)).toEqual(["2026-11-01", "01.10.2026"]);
  });

  it("expands order product lines for the customer device list", () => {
    expect(getOrderProductRows({ productLines: [{ product: "Telefon", qty: 2, price: 300, serials: ["SN1", ""] }] })).toEqual([
      { product: "Telefon", qty: 2, amount: 600, serials: ["SN1"] },
    ]);
    expect(getOrderProductRows({ products: "Planşet", amount: 450 })).toEqual([{ product: "Planşet", qty: 1, amount: 450, serials: [] }]);
  });

  it("filters CRM customers by segment and search, and pipeline rows by stage", () => {
    const entry = {
      customer: { name: "Aysel", fin: "FIN1", phone: "050", category: "Qızıl", debt: 0, delay: 0 },
      profile: { activeCreditCount: 1, overdueCount: 0, openOrders: 0, totalBalance: 0, agreements: [{ contractId: "KR-İ7", product: "Telefon" }] },
    };
    expect(matchesCrmCustomerSegment(entry, "Aktiv kredit")).toBe(true);
    expect(matchesCrmCustomerSegment(entry, "Gecikmə")).toBe(false);
    expect(matchesCrmCustomerSegment(entry, "Borcsuz")).toBe(true);
    expect(matchesCrmCustomerSegment(entry, "Açıq təhvil")).toBe(false);
    expect(matchesCrmCustomerSearch(entry, "kr-i7")).toBe(true);
    expect(matchesCrmCustomerSearch(entry, "planşet")).toBe(false);
    expect(matchesCrmPipelineFilter({ stage: "Upsell" }, "Hamısı")).toBe(true);
    expect(matchesCrmPipelineFilter({ stage: "Upsell" }, "Təklif")).toBe(false);
  });

  it("places customers without credits in the CRM pipeline by orders, category and limit", () => {
    const rows = buildCrmPipelineRows(
      [
        { fin: "A", name: "Açıq", limit: 1000 },
        { fin: "B", name: "Platin", category: "Platin", limit: 1000 },
        { fin: "C", name: "Limitli", limit: 5000 },
        { fin: "D", name: "Kiçik", limit: 1000 },
      ],
      [],
      [{ id: "O1", fin: "A", status: "Gözləyir", date: "2026-11-01", seller: "Elvin 2%" }],
    );
    expect(rows.map((row) => [row.stage, row.probability])).toEqual([
      ["Təhvil sonrası", 56], ["Upsell", 82], ["Təklif", 68], ["Kredit uyğunluğu", 46],
    ]);
    expect(rows[0]).toMatchObject({ owner: "Elvin 2%", openOrders: 1, lastOrderId: "O1", source: "Son sifariş: O1", value: 1000 });
    expect(rows[2]).toMatchObject({ limitLeft: 5000, value: 5000, nextAction: "Limitə uyğun kommersiya təklifi", lastOrderId: "Yeni fürsət" });
  });
});
