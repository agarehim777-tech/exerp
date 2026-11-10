import { describe, expect, it } from "vitest";
import { csvCell } from "../shared/lib/csvCell.js";

describe("csvCell", () => {
  it("neutralizes formula-leading text", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("+1+2")).toBe(`"'+1+2"`);
  });
  it("keeps plain negative numbers", () => {
    expect(csvCell(-50)).toBe(`"-50"`);
    expect(csvCell("-12.5")).toBe(`"-12.5"`);
  });
});
