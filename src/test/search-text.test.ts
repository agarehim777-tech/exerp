import { describe, expect, it } from "vitest";
import { foldSearchText } from "../shared/lib/searchText.ts";
import { matchesQuery } from "../modules/procurement/procurementShared.jsx";
import { filterRows } from "../shared/lib/warehouseDomain.ts";
import { matchesCreditSearch } from "../shared/lib/credit.js";
import { normalize } from "../services/format.js";

describe("foldSearchText", () => {
  it("treats i, ı, I and İ as the same letter", () => {
    expect(new Set(["i", "ı", "I", "İ"].map(foldSearchText))).toEqual(new Set(["i"]));
    expect(foldSearchText("INV-2")).toBe("inv-2");
    expect(foldSearchText("İNV")).toBe("inv");
    expect(foldSearchText("ınv")).toBe("inv");
  });

  it("keeps the other Azerbaijani letters distinct and case-insensitive", () => {
    expect(foldSearchText("ƏŞÇĞÖÜ")).toBe("əşçğöü");
    expect(foldSearchText("e s c g o u")).not.toContain("ə");
  });

  it("does not change normalize, which stays strict for keys and equality", () => {
    expect(normalize("INV")).toBe("ınv");
    expect(normalize("İNV")).toBe("inv");
  });
});

describe("search call sites", () => {
  it("matchesQuery finds codes with a capital I whatever I-letter the user types", () => {
    for (const query of ["inv", "INV", "İNV", "ınv", "Inv-2"]) {
      expect(matchesQuery(["INV-2"], query)).toBe(true);
    }
    expect(matchesQuery(["INV-2"], "inv-3")).toBe(false);
  });

  it("matchesQuery still matches Azerbaijani letters case-insensitively", () => {
    const names = ["Əliyev Şirkəti", "Çiçək Ğanlı", "Öküz Ümid"];
    for (const query of ["əli", "ŞİRKƏT", "çiçək", "ÇIÇƏK", "ğan", "ök", "ÜMİD", "ümid"]) {
      expect(matchesQuery(names, query)).toBe(true);
    }
    expect(matchesQuery(names, "sirket")).toBe(false);
    expect(matchesQuery(names, "eli")).toBe(false);
  });

  it("filterRows and matchesCreditSearch fold I-letters too", () => {
    expect(filterRows([{ sku: "SKU-IPHONE" }, { sku: "SKU-X" }], "iphone")).toEqual([{ sku: "SKU-IPHONE" }]);
    expect(matchesCreditSearch({ credit: { id: "CR-1", customer: "Ismayıl", fin: "FIN1" } }, "ismayil")).toBe(true);
  });
});
