export function total(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}
