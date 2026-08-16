import { describe, expect, it } from "vitest";
import { resolveModalKind } from "../config/modal-registry.js";

describe("modal registry", () => {
  it("routes sales entry points to the same order form", () => {
    expect(resolveModalKind("sales")).toBe("salesOrder");
    expect(resolveModalKind("dashboard")).toBe("salesOrder");
  });

  it("falls back to the generic form for configured simple records", () => {
    expect(resolveModalKind("crm")).toBe("generic");
  });
});
