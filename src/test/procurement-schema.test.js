import { describe, expect, it } from "vitest";
import { isMissingPoPaymentsTable } from "../modules/procurement/procurementSchema.js";

describe("procurement optional schema", () => {
  it("recognizes a missing po_payments schema-cache error", () => {
    expect(isMissingPoPaymentsTable({
      code: "PGRST205",
      message: "Could not find the table 'public.po_payments' in the schema cache",
    })).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(isMissingPoPaymentsTable({ message: "permission denied for purchase_orders" })).toBe(false);
  });
});
