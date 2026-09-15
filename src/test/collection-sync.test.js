import { describe, expect, it } from "vitest";
import { appToRow, recordKey, rowToApp } from "../shared/hooks/useCollectionSync.js";

describe("collection sync mapping", () => {
  it("keeps the record id when mapping a database row back to the app", () => {
    const row = { collection: "employees", record_key: "EMP-1", position: 0, data: { id: "EMP-1", name: "Ayan" } };
    expect(rowToApp(row)).toEqual({ id: "EMP-1", name: "Ayan" });
  });

  it("falls back to the record key when the payload has no id", () => {
    expect(rowToApp({ record_key: "DEP-2", data: { name: "Satış" } })).toEqual({ id: "DEP-2", name: "Satış" });
  });

  it("builds a tenant scoped row with position", () => {
    const row = appToRow({ id: "DEP-2", name: "Satış" }, 3, "t1", "departments");
    expect(row).toMatchObject({ tenant_id: "t1", collection: "departments", record_key: "DEP-2", position: 3 });
    expect(row.data).toEqual({ id: "DEP-2", name: "Satış" });
  });

  it("generates a stable key for items without an identifier", () => {
    expect(recordKey({ name: "Vakansiya" }, 4)).toBe("idx-4");
  });
});
