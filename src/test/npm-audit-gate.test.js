import { describe, expect, it } from "vitest";
import { findBlockingAdvisories } from "../../scripts/npm-audit-gate.mjs";

const advisory = (url, severity, name = "pkg") => ({ url, severity, name, title: "issue" });
const report = (vulnerabilities) => ({ vulnerabilities });
const allowlist = [{ advisory: "https://example.test/A", package: "a", reason: "no fix", reviewBy: "2027-01-31" }];

describe("npm audit gate", () => {
  it("ignores an allowlisted advisory and the packages that only reach it", () => {
    const result = findBlockingAdvisories(report({
      a: { via: [advisory("https://example.test/A", "high", "a")] },
      vite: { via: ["a"] },
    }), allowlist, new Date("2026-11-18"));
    expect(result.blocking).toEqual([]);
    expect(result.ignored).toHaveLength(1);
  });

  it("blocks other high or critical advisories but not moderate ones", () => {
    const result = findBlockingAdvisories(report({
      a: { via: [advisory("https://example.test/A", "high", "a")] },
      b: { via: [advisory("https://example.test/B", "critical", "b"), advisory("https://example.test/C", "moderate", "c")] },
    }), allowlist, new Date("2026-11-18"));
    expect(result.blocking).toEqual(["critical b: issue (https://example.test/B)"]);
  });

  it("stops allowlisting after the review date", () => {
    const result = findBlockingAdvisories(report({ a: { via: [advisory("https://example.test/A", "high", "a")] } }), allowlist, new Date("2027-02-01"));
    expect(result.blocking).toHaveLength(1);
  });
});
