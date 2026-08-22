const amount = value => Number(value || 0);
const dateValue = value => value ? new Date(value).getTime() : 0;

export function buildCustomerScore({ orders = [], credits = [], payments = [] }) {
  const revenue = orders.reduce((sum, row) => sum + amount(row.total), 0);
  const paid = payments.reduce((sum, row) => sum + amount(row.amount), 0);
  const overdue = credits.flatMap(row => row.installments || []).filter(row => row.status === "overdue");
  const overduePrincipal = overdue.reduce((sum, row) => sum + Math.max(0, amount(row.principal_due) - amount(row.principal_paid)), 0);
  const maxRisk = Math.max(0, ...credits.map(row => amount(row.risk_score)));
  const valueScore = Math.min(100, Math.round(Math.log10(Math.max(1, revenue + paid)) * 22));
  const paymentDiscipline = Math.max(0, 100 - maxRisk - Math.min(40, overdue.length * 8));
  const riskScore = Math.min(100, Math.round(maxRisk + Math.min(35, overduePrincipal / 100)));
  return {
    revenue, paid, overduePrincipal, valueScore, riskScore,
    customerScore: Math.round(valueScore * 0.55 + paymentDiscipline * 0.45),
    riskLabel: riskScore >= 70 ? "Yüksək risk" : riskScore >= 35 ? "Orta risk" : "Aşağı risk",
    valueLabel: valueScore >= 75 ? "Yüksək dəyər" : valueScore >= 45 ? "Orta dəyər" : "İnkişaf edən",
  };
}

export function buildCustomerTimeline({ orders = [], credits = [], payments = [], activities = [], serviceCases = [], documents = [] }) {
  return [
    ...orders.map(row => ({ id: `order-${row.id}`, at: row.order_date || row.created_at, type: "Satış", title: row.order_no, detail: `${amount(row.total).toFixed(2)} AZN · ${row.status}`, entityId: row.id })),
    ...credits.map(row => ({ id: `credit-${row.id}`, at: row.start_date || row.created_at, type: "Kredit", title: row.contract_no, detail: `${amount(row.principal).toFixed(2)} AZN · ${row.status}`, entityId: row.id })),
    ...payments.map(row => ({ id: `payment-${row.id}`, at: row.paid_at || row.created_at, type: "Ödəniş", title: row.receipt_no, detail: `${amount(row.amount).toFixed(2)} AZN`, entityId: row.credit_id })),
    ...serviceCases.map(row => ({ id: `service-${row.id}`, at: row.opened_at || row.created_at, type: "Servis", title: row.case_no, detail: `${row.subject} · ${row.status}`, entityId: row.id })),
    ...documents.map(row => ({ id: `document-${row.id}`, at: row.created_at, type: "Sənəd", title: row.title, detail: row.document_type, entityId: row.id })),
    ...activities.map(row => ({ id: `activity-${row.id}`, at: row.occurred_at || row.created_at, type: "Əlaqə", title: row.subject || row.type, detail: row.notes || row.description || "", entityId: row.id })),
  ].sort((a, b) => dateValue(b.at) - dateValue(a.at));
}

