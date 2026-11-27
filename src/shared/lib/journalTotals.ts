export function journalTotals(lines: { debit?: unknown; credit?: unknown }[]) {
  const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
  const debit = lines.reduce((sum, line) => sum + cents(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + cents(line.credit), 0);
  return { d: debit / 100, c: credit / 100, balanced: debit > 0 && debit === credit };
}
