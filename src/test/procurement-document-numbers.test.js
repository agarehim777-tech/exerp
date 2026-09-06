import { describe, expect, it } from "vitest";
import { nextDailyProcurementNo, shortProcurementDocumentNo } from "../modules/procurement/documentNumbers.js";

describe("procurement document numbers", () => {
  it("creates a short global sequential shipment number", () => {
    expect(nextDailyProcurementNo("SHP", ["SHP-1001", "SHP-1004"])).toBe("SHP-1005");
  });

  it("keeps persisted sequential numbers unchanged", () => {
    expect(shortProcurementDocumentNo("GRN-1001")).toBe("GRN-1001");
    expect(shortProcurementDocumentNo("SHP-1002")).toBe("SHP-1002");
  });
});
