const SCALE = 1_000_000n;
const micro = (value) => BigInt(Math.round(Number(value || 0) * 1e6));
const decimal = (value) => Number(value) / 1e6;

export function allocationBasis(line, method) {
  if (method === 'invoice_value') return Number(line.invoiceAmount || 0);
  if (method === 'volume') return Number(line.volume || 0);
  if (method === 'weight') return Number(line.weight || 0);
  if (method === 'quantity') return Number(line.quantity || 0);
  if (method === 'equal') return 1;
  return 0;
}

export function allocateCost(lines, cost) {
  if (!lines.length) throw new Error('Göndərişdə məhsul yoxdur.');
  if (cost.method === 'direct') {
    if (!cost.lineId || !lines.some(line => line.id === cost.lineId)) throw new Error('Birbaşa xərc üçün məhsul seçilməyib.');
    return Object.fromEntries(lines.map(line => [line.id, line.id === cost.lineId ? Number(cost.amount || 0) : 0]));
  }
  if (cost.method === 'manual') {
    const manual = cost.manual || {};
    const sum = Object.values(manual).reduce((a, b) => a + micro(b), 0n);
    if (sum !== micro(cost.amount)) throw new Error('Əl bölgüsünün cəmi xərc məbləğinə bərabər deyil.');
    return Object.fromEntries(lines.map(line => [line.id, Number(manual[line.id] || 0)]));
  }
  const basis = lines.map(line => micro(allocationBasis(line, cost.method)));
  const totalBasis = basis.reduce((a, b) => a + b, 0n);
  if (totalBasis === 0n) throw new Error(`${cost.method} üzrə bölüşdürmə bazası sıfırdır.`);
  const amount = micro(cost.amount);
  const shares = basis.map(item => amount * item / totalBasis);
  const remainder = amount - shares.reduce((a, b) => a + b, 0n);
  let largest = 0;
  basis.forEach((value, index) => { if (value > basis[largest]) largest = index; });
  shares[largest] += remainder;
  return Object.fromEntries(lines.map((line, index) => [line.id, decimal(shares[index])]));
}

export function calculateLandedCost(lines, costs) {
  const rows = lines.map(line => ({ ...line, customs: 0, freight: 0, other: 0 }));
  for (const cost of costs) {
    const allocated = allocateCost(lines, cost);
    rows.forEach(row => {
      const amount = allocated[row.id] || 0;
      if (['customs_duty','customs_clearance','broker'].includes(cost.type)) row.customs += amount;
      else if (['international_freight','local_freight'].includes(cost.type)) row.freight += amount;
      else row.other += amount;
    });
  }
  return rows.map(row => {
    const duty = Number(row.invoiceAmount || 0) * Number(row.dutyRate || 0);
    const landedTotal = Number(row.invoiceAmount || 0) + duty + row.customs + row.freight + row.other;
    if (Number(row.receivedQty || 0) <= 0) throw new Error('Faktiki qəbul miqdarı sıfır ola bilməz.');
    return { ...row, customs: row.customs + duty, landedTotal, unitLandedCost: landedTotal / Number(row.receivedQty) };
  });
}
