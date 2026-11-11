// Single source for sellable stock. Mirrors the database rule in reserve_stock:
// sellable = on hand − reserved − quarantined (problem). Accepts any of the row shapes used in the app.
const num = (value) => Number(value) || 0;

export function stockParts(row = {}) {
  return {
    total: num(row.on_hand ?? row.total ?? row.qty ?? row.quantity),
    reserved: num(row.reserved ?? row.reserved_quantity),
    problem: num(row.problem ?? row.problemQty ?? row.problem_qty),
  };
}

export function sellableQty(row = {}) {
  const { total, reserved, problem } = stockParts(row);
  return total - reserved - problem;
}
