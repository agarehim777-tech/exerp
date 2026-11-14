import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as receivables from "../shared/lib/receivableHelpers.ts";
import { buildReceivableRows, enrichReceivableRow, getReceivableAgingBucket } from "../shared/lib/receivableHelpers.ts";
import { currentBusinessDate } from "../shared/lib/businessDate.ts";

describe("receivable helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of Object.entries(receivables)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("buckets overdue days", () => {
    expect([0, 1, 30, 31, 61, 91].map(getReceivableAgingBucket)).toEqual([
      "Cari", "1-30 gün", "1-30 gün", "31-60 gün", "61-90 gün", "90+ gün",
    ]);
  });

  it("classifies risk, collection status and next action together", () => {
    expect(enrichReceivableRow({ amount: 2000, overdueDays: 45, type: "Debitor" })).toMatchObject({
      agingBucket: "31-60 gün", riskCategory: "Yüksək", collectionStatus: "Eskalasiyada", nextAction: "Menecer eskalasiyası",
    });
    expect(enrichReceivableRow({ amount: 500, overdueDays: 0, type: "Kreditor" })).toMatchObject({
      riskCategory: "Nəzarət", collectionStatus: "Ödəniş planı", nextAction: "Ödəniş tarixini təsdiqlə",
    });
    expect(enrichReceivableRow({ amount: 0, overdueDays: 100 })).toMatchObject({ riskCategory: "Bağlı", collectionStatus: "Bağlandı" });
  });

  it("lists manual customer debt and unpaid vendor POs, largest first", () => {
    const rows = buildReceivableRows({
      customers: [{ name: "Əli", fin: "FIN1", debt: 300, delay: 10 }],
      vendors: [{ name: "Vendor", status: "Aktiv", country: "AZ" }],
      purchaseOrders: [
        { id: "PO-1", vendor: "Vendor", amount: 900, status: "Təsdiqləndi", paymentDueDate: currentBusinessDate },
        { id: "PO-2", vendor: "Vendor", amount: 400, status: "Ödənilib" },
      ],
    });
    expect(rows.map((row) => [row.id, row.type, row.amount])).toEqual([
      ["CR-Vendor", "Kreditor", 900],
      ["DB-CUST-FIN1", "Debitor", 300],
    ]);
    expect(rows[0]).toMatchObject({ poIds: ["PO-1"], overdueDays: 0, closingMode: "cash-out", collectionStatus: "Ödəniş planı" });
    expect(rows[1]).toMatchObject({ customerDebt: 300, collectionStatus: "Kolleksiyada", nextAction: "Kollektor zəngi" });
  });
});
