import { describe, it, expect } from "vitest";
import { mapRiskRows, mapTrendRows } from "../shared/hooks/useReportTotals.ts";

describe("report series mapping", () => {
  it("keeps month order and numeric totals from the database", () => {
    const rows = mapTrendRows([{ month: "2026-08-01", revenue: "2000.00", expense: 0 }, { month: "2026-09-01", revenue: 0, expense: "1747" }]);
    expect(rows.map((r) => [r.revenue, r.expense])).toEqual([[2000, 0], [0, 1747]]);
  });
  it("normalizes risk rows", () => {
    const [row] = mapRiskRows([{ id: 1, area: "Anbar", amount: "12.5" }]);
    expect(row).toMatchObject({ id: "1", area: "Anbar", amount: 12.5, title: "" });
  });
  it("tolerates a missing payload", () => {
    expect(mapRiskRows(null)).toEqual([]);
  });
});
