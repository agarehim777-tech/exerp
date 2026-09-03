const text = (value) => String(value ?? '').trim().toLowerCase();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function buildOperationalHealth({ orders = [], credits = [], cashTransactions = [], reservations = [], balances = [], invoices = [], deliveries = [], accountingEvents = [] } = {}) {
  const orderById = new Map(orders.map((order) => [String(order.id), order]));
  const issues = [];

  for (const credit of credits) {
    const order = orderById.get(String(credit.order_id));
    if (!order) {
      issues.push({ id: `credit-orphan-${credit.id}`, domain: 'Kredit', severity: 'error', title: 'Sifarişsiz kredit', detail: credit.contract_no || credit.id, remedy: 'Kredit müqaviləsini arxivlə və ödəniş planını bağla' });
    } else if (text(order.status) === 'cancelled' && !['closed', 'cancelled'].includes(text(credit.status))) {
      issues.push({ id: `credit-cancelled-${credit.id}`, domain: 'Kredit', severity: 'error', title: 'Ləğv edilmiş satışda aktiv kredit', detail: `${order.order_no} · ${credit.contract_no}`, remedy: 'Satış ləğvi RPC-sini yenidən icra et' });
    }
  }

  for (const payment of cashTransactions) {
    const isSalesPayment = ['sales_order', 'sales_payment'].includes(text(payment.reference_type)) || text(payment.category) === 'sales_payment';
    if (!isSalesPayment || payment.reversed_at || payment.reversal_of) continue;
    const order = orderById.get(String(payment.reference_id))
      || orders.find((row) => text(row.order_no) === text(payment.reference));
    if (!order || text(order.status) === 'cancelled') {
      issues.push({ id: `cash-orphan-${payment.id}`, domain: 'Maliyyə', severity: 'error', title: 'Satışsız aktiv kassa yazısı', detail: payment.reference || payment.description || payment.id, remedy: 'Kompensasiya əməliyyatı yarat' });
    }
  }

  for (const invoice of invoices) {
    const order = orderById.get(String(invoice.order_id));
    if (invoice.order_id && (!order || (text(order.status) === 'cancelled' && text(invoice.status) !== 'cancelled'))) {
      issues.push({ id: `invoice-orphan-${invoice.id}`, domain: 'Faktura', severity: 'error', title: 'Ləğv edilmiş satışda aktiv faktura', detail: invoice.invoice_no || invoice.id, remedy: 'Fakturanı ləğv statusuna keçir və jurnal qarşılığını yoxla' });
    }
  }

  for (const delivery of deliveries) {
    const order = orderById.get(String(delivery.order_id));
    if (!order || (text(order.status) === 'cancelled' && ['pending', 'ready'].includes(text(delivery.status)))) {
      issues.push({ id: `delivery-orphan-${delivery.id}`, domain: 'Çatdırılma', severity: 'error', title: 'Satışsız aktiv çatdırılma', detail: delivery.delivery_no || delivery.id, remedy: 'Gözləyən çatdırılmanı ləğv et' });
    }
  }

  const eventKey = new Set(accountingEvents.map((row) => `${row.order_id}:${text(row.event_type)}`));
  for (const order of orders) {
    if (text(order.status) === 'delivered' && !eventKey.has(`${order.id}:delivery`)) {
      issues.push({ id: `accounting-delivery-${order.id}`, domain: 'Mühasibat', severity: 'error', title: 'Təhvilin jurnal hadisəsi yoxdur', detail: order.order_no, remedy: 'Təhvil və tarixi COGS jurnalını bərpa et' });
    }
    if (text(order.status) === 'cancelled' && eventKey.has(`${order.id}:delivery`) && !eventKey.has(`${order.id}:cancellation`)) {
      issues.push({ id: `accounting-cancel-${order.id}`, domain: 'Mühasibat', severity: 'error', title: 'Satış ləğvinin jurnal qarşılığı yoxdur', detail: order.order_no, remedy: 'Ləğv jurnalını və COGS qaytarmasını yarat' });
    }
  }

  const activeReservations = reservations.filter((row) => text(row.status) === 'active');
  for (const reservation of activeReservations) {
    const order = orderById.get(String(reservation.order_id));
    if (!order || text(order.status) === 'cancelled') {
      issues.push({ id: `reservation-orphan-${reservation.id}`, domain: 'Anbar', severity: 'error', title: 'Sifarişsiz aktiv rezerv', detail: order?.order_no || reservation.id, remedy: 'Rezervi burax və reserved qalığını yenilə' });
    }
  }

  const expectedByStock = new Map();
  for (const row of activeReservations) {
    const key = `${row.warehouse_id}:${row.product_id}`;
    expectedByStock.set(key, number(expectedByStock.get(key)) + number(row.quantity));
  }
  for (const balance of balances) {
    const key = `${balance.warehouse_id}:${balance.product_id}`;
    const expected = number(expectedByStock.get(key));
    const actual = number(balance.reserved);
    if (Math.abs(expected - actual) > 0.0001) {
      issues.push({ id: `stock-reserved-${key}`, domain: 'Anbar', severity: 'warn', title: 'Rezerv qalığı uyğun deyil', detail: `Baza ${actual}, aktiv rezerv ${expected}`, remedy: 'Reserved qalığını aktiv rezervlərdən yenidən hesabla' });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    issues,
    summary: {
      total: issues.length,
      critical: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warn').length,
      healthy: issues.length === 0,
    },
  };
}

