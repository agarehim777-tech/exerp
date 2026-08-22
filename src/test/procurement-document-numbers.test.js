import { describe, expect, it } from "vitest";
import { nextDailyProcurementNo, shortProcurementDocumentNo } from "../modules/procurement/documentNumbers.js";

describe("procurement document numbers", () => {
  it("creates a short daily sequential shipment number", () => {
    const date = new Date(2026, 7, 22);
    expect(nextDailyProcurementNo("SHP", ["SHP-260822-001", "SHP-260822-004"], date)).toBe("SHP-260822-005");
  });

  it("shortens legacy timestamp numbers for display", () => {
    expect(shortProcurementDocumentNo("GRN-20260820132453465")).toBe("GRN-260820-3465");
    expect(shortProcurementDocumentNo("SHP-20260820-1723")).toBe("SHP-260820-1723");
  });
});
