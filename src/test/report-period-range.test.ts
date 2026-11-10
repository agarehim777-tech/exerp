import { describe, it, expect } from "vitest";
import { reportPeriodRange } from "../shared/hooks/useReportTotals.ts";

describe("reportPeriodRange", () => {
  it("covers the whole calendar month", () => {
    expect(reportPeriodRange("Bu ay", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("covers the quarter", () => {
    expect(reportPeriodRange("Bu rüb", "2026-11-10")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });
  it("is unbounded for all time", () => {
    expect(reportPeriodRange("Hamısı", "2026-11-10")).toEqual({ from: null, to: null });
  });
});
