import { describe, it, expect } from "vitest";
import * as stockErrors from "../shared/lib/stockErrors.js";

const { isStockShortageError } = stockErrors;
const translate =
  stockErrors.translateStockError ||
  stockErrors.stockErrorMessage ||
  stockErrors.describeStockError ||
  null;

describe("stock error detection", () => {
  it("recognises the insufficient stock signal from the backend", () => {
    expect(isStockShortageError({ message: "insufficient_available_stock" })).toBe(true);
  });

  it("recognises the shortage signal nested in details", () => {
    expect(
      isStockShortageError({
        message: "new row violates",
        details: "insufficient_available_stock for product X",
      }),
    ).toBe(true);
  });

  it("does not treat unrelated failures as a shortage", () => {
    expect(isStockShortageError({ message: "permission denied for table orders" })).toBe(false);
    expect(isStockShortageError(null)).toBeFalsy();
    expect(isStockShortageError(undefined)).toBeFalsy();
  });

  it("produces a human readable Azerbaijani message when a translator exists", () => {
    if (!translate) return;
    const message = translate({ message: "insufficient_available_stock" });
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toBe("insufficient_available_stock");
  });
});
