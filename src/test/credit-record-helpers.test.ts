import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as creditRecords from "../shared/lib/creditRecordHelpers.ts";
import {
  buildAllCreditRecords,
  buildCreditAgingBuckets,
  buildCreditRiskRows,
  buildSalesCreditRecord,
  buildSalesCreditRecords,
  getCreditIdForOrder,
} from "../shared/lib/creditRecordHelpers.ts";

const creditOrder = { id: "SO-12", customer: "Ali", paymentMethod: "Kredit", amount: 1200, paid: 0, creditMonths: 12, status: "Təhvil verildi" };

describe("credit record helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of Object.entries(creditRecords)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("derives a credit id from the order", () => {
    expect(getCreditIdForOrder({ id: "SO-12" })).toBe("KR-12");
    expect(getCreditIdForOrder({ id: "SO-12", creditId: "KR-99" })).toBe("KR-99");
  });

  it("keeps a sales credit waiting until it is started", () => {
    const record = buildSalesCreditRecord(creditOrder);
    expect(record).toMatchObject({ id: "KR-12", orderId: "SO-12", salesSource: true, total: 1200, months: 12, status: "Başlanmamış", next: "—", contractId: "MQ-SO-12" });
    expect(record.installments).toHaveLength(12);
    const started = buildSalesCreditRecord(creditOrder, { id: "KR-12", startedAt: "2026-11-01", status: "Aktiv", balance: 1100 });
    expect(started).toMatchObject({ status: "Aktiv", balance: 1100 });
  });

  it("lets canonical DB contract fields win over the stored projection", () => {
    const record = buildSalesCreditRecord(
      { ...creditOrder, _source: "db", creditId: "KR-DB", creditStatus: "overdue", creditStartDate: "2026-10-01", creditBalance: 500,
        creditInstallments: [{ due: "2026-10-01", amount: 0 }, { due: "2026-11-01", amount: 250 }, { due: "2026-12-01", amount: 250 }] },
      { id: "KR-OLD", balance: 9999, status: "Aktiv" },
    );
    expect(record).toMatchObject({ id: "KR-DB", balance: 500, status: "Gecikmiş", paidMonths: 1, monthly: 250, next: "2026-11-01", rate: 33 });
  });

  it("skips cancelled orders and drops orphaned sales credits from the manual list", () => {
    const orders = [creditOrder, { ...creditOrder, id: "SO-13", status: "Ləğv edildi" }, { id: "SO-14", paymentMethod: "Nağd", amount: 50 }];
    expect(buildSalesCreditRecords(orders, []).map((credit) => credit.id)).toEqual(["KR-12"]);
    const stored = [
      { id: "KR-12", orderId: "SO-12", balance: 1000 },
      { id: "KR-ORPHAN", orderId: "SO-DELETED" },
      { id: "KR-SALES", salesSource: true },
      { id: "KR-SATIS", createdFrom: "Satış modulu" },
      { id: "KR-MANUAL", createdFrom: "Manual" },
    ];
    expect(buildAllCreditRecords(orders, stored).map((credit) => credit.id)).toEqual(["KR-12", "KR-MANUAL"]);
  });

  it("scores credit risk and groups it into aging buckets", () => {
    const enriched = [
      { id: "A", plan: { balance: 0, monthly: 0 }, paymentState: { daysOverdue: 0, isOverdue: false } },
      { id: "B", plan: { balance: 3000, monthly: 300 }, paymentState: { daysOverdue: 10, isOverdue: true, nextInstallment: { amount: 300 } } },
      { id: "C", plan: { balance: 600, monthly: 100 }, paymentState: { daysOverdue: 3, isOverdue: true, nextInstallment: { amount: 100 } } },
    ];
    const rows = buildCreditRiskRows(enriched);
    expect(rows.map((row) => [row.id, row.riskScore, row.riskLevel, row.bucket])).toEqual([
      ["B", 90, "Yüksək risk", "8-30 gün"],
      ["C", 41, "Sağlam", "1-7 gün"],
      ["A", 0, "Sağlam", "Vaxtında"],
    ]);
    expect(rows[0].recommendedAction).toBe("Kollektor zəngi + restruktur təklifi");
    expect(buildCreditAgingBuckets(rows)).toEqual([
      { bucket: "Vaxtında", count: 1, amount: 0, balance: 0 },
      { bucket: "1-7 gün", count: 1, amount: 100, balance: 600 },
      { bucket: "8-30 gün", count: 1, amount: 300, balance: 3000 },
      { bucket: "30+ gün", count: 0, amount: 0, balance: 0 },
    ]);
  });
});
