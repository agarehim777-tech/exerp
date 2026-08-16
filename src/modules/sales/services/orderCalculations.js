import { normalizeOrderProductLines } from "../../../shared/lib/appDomain.jsx";

export function calculateOrderLineTotal(productLines = []) {
  return normalizeOrderProductLines(productLines).reduce(
    (sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0),
    0,
  );
}

export function calculateOrderFinancials(productLines = []) {
  const lines = normalizeOrderProductLines(productLines);
  const subtotal = lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0);
  const vat = lines.reduce(
    (sum, line, index) => {
      const sourceLine = productLines[index] || {};
      return sum + Number(line.qty || 0) * Number(line.price || 0) * Number(sourceLine.vatRate || 0) / 100;
    },
    0,
  );
  return { subtotal, vat, total: subtotal + vat };
}
