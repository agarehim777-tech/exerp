// Faktura PDF/çap ixracı — xarici kitabxana olmadan, brauzerin çap mühərriki ilə.
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (value, currency = 'AZN') =>
  `${(Number(value) || 0).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const date = (value) => (value ? new Date(value).toLocaleDateString('az-AZ') : '—');

export function buildInvoiceHtml(invoice, options = {}) {
  const company = options.company || {};
  const currency = invoice.currency || 'AZN';
  const lines = invoice.lines || [];

  const rows = lines
    .map((line, index) => {
      const net = (Number(line.qty) || 0) * (Number(line.unit_price) || 0) * (1 - (Number(line.discount_pct) || 0) / 100);
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(line.description || '—')}</td>
        <td class="num">${Number(line.qty) || 0}</td>
        <td class="num">${money(line.unit_price, currency)}</td>
        <td class="num">${Number(line.discount_pct) || 0}%</td>
        <td class="num">${Number(line.vat_rate) || 0}%</td>
        <td class="num">${money(net, currency)}</td>
        <td class="num"><b>${money(line.line_total, currency)}</b></td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="az"><head><meta charset="utf-8" />
<title>Faktura ${escapeHtml(invoice.invoice_no)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1c2432; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .5px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f3d33; padding-bottom: 12px; margin-bottom: 18px; }
  .muted { color: #64748b; }
  .grid { display: flex; gap: 32px; margin-bottom: 18px; }
  .box { flex: 1; border: 1px solid #dfe5ec; border-radius: 8px; padding: 10px 12px; }
  .box h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #0f3d33; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #0f3d33; color: #fff; text-align: left; padding: 7px 8px; font-size: 11px; }
  td { padding: 7px 8px; border-bottom: 1px solid #e7ecf2; }
  .num { text-align: right; }
  .totals { width: 280px; margin-left: auto; }
  .totals td { border: none; padding: 4px 8px; }
  .totals .grand td { border-top: 2px solid #0f3d33; font-size: 15px; font-weight: 700; padding-top: 8px; }
  footer { margin-top: 28px; font-size: 10px; color: #7b8794; border-top: 1px solid #e7ecf2; padding-top: 8px; }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>${escapeHtml(company.name || 'ExERP')}</h1>
      <div class="muted">${escapeHtml(company.address || '')}</div>
      <div class="muted">${escapeHtml(company.tax_id ? `VÖEN: ${company.tax_id}` : '')}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:700">SATIŞ FAKTURASI</div>
      <div><b>${escapeHtml(invoice.invoice_no)}</b></div>
      <div class="muted">Tarix: ${date(invoice.invoice_date)}</div>
      <div class="muted">Son ödəniş: ${date(invoice.due_date)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box"><h3>Müştəri</h3>
      <div><b>${escapeHtml(invoice.customer?.name || '—')}</b></div>
      <div class="muted">${escapeHtml(invoice.customer?.address || '')}</div>
      <div class="muted">${escapeHtml(invoice.customer?.tax_id ? `VÖEN: ${invoice.customer.tax_id}` : '')}</div>
    </div>
    <div class="box"><h3>Ödəniş</h3>
      <div>Ödənilib: ${money(invoice.paid_amount, currency)}</div>
      <div>Qalıq: ${money((Number(invoice.total) || 0) - (Number(invoice.paid_amount) || 0), currency)}</div>
      <div class="muted">Valyuta: ${escapeHtml(currency)}</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>#</th><th>Təsvir</th><th class="num">Miqdar</th><th class="num">Qiymət</th>
      <th class="num">Endirim</th><th class="num">ƏDV</th><th class="num">Net</th><th class="num">Cəm</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="8">Sətir yoxdur</td></tr>'}</tbody>
  </table>

  <table class="totals">
    <tr><td>Ara cəm</td><td class="num">${money(invoice.subtotal, currency)}</td></tr>
    <tr><td>Endirim</td><td class="num">${money(invoice.discount_total, currency)}</td></tr>
    <tr><td>ƏDV</td><td class="num">${money(invoice.vat_total, currency)}</td></tr>
    <tr class="grand"><td>YEKUN</td><td class="num">${money(invoice.total, currency)}</td></tr>
  </table>

  ${invoice.notes ? `<div class="box"><h3>Qeyd</h3>${escapeHtml(invoice.notes)}</div>` : ''}

  <footer>
    Bu sənəd ExERP sistemi tərəfindən elektron formada yaradılıb.
    Yaradılma vaxtı: ${new Date().toLocaleString('az-AZ')}.
  </footer>
</body></html>`;
}

export function printInvoice(invoice, options = {}) {
  const html = buildInvoiceHtml(invoice, options);
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) throw new Error('Pop-up bloklandı. Brauzer parametrlərini yoxlayın.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

// AZ e-faktura üçün struktur ixrac (e-qaimə inteqrasiyasına hazır JSON).
export function buildEInvoicePayload(invoice, company = {}) {
  return {
    documentType: 'SALES_INVOICE',
    documentNumber: invoice.invoice_no,
    issueDate: invoice.invoice_date,
    dueDate: invoice.due_date || null,
    currency: invoice.currency || 'AZN',
    seller: { name: company.name || null, taxId: company.tax_id || null, address: company.address || null },
    buyer: {
      name: invoice.customer?.name || null,
      taxId: invoice.customer?.tax_id || null,
      address: invoice.customer?.address || null,
    },
    lines: (invoice.lines || []).map((line, index) => ({
      lineNo: line.line_no ?? index + 1,
      description: line.description,
      quantity: Number(line.qty) || 0,
      unitPrice: Number(line.unit_price) || 0,
      discountPercent: Number(line.discount_pct) || 0,
      vatPercent: Number(line.vat_rate) || 0,
      lineTotal: Number(line.line_total) || 0,
    })),
    totals: {
      subtotal: Number(invoice.subtotal) || 0,
      discount: Number(invoice.discount_total) || 0,
      vat: Number(invoice.vat_total) || 0,
      grandTotal: Number(invoice.total) || 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function downloadEInvoice(invoice, company = {}) {
  const payload = buildEInvoicePayload(invoice, company);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `e-faktura-${invoice.invoice_no}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---- Siyahı (registr) ixracı: filtrə uyğun fakturalar ----

const STATUS_TEXT = {
  draft: 'Qaralama', issued: 'Göndərilib', partial: 'Qismən ödənilib',
  paid: 'Ödənilib', overdue: 'Gecikib', cancelled: 'Ləğv',
};

function registerRows(invoices) {
  return invoices.map((invoice) => {
    const total = Number(invoice.total) || 0;
    const paid = Number(invoice.paid_amount) || 0;
    return {
      invoice_no: invoice.invoice_no || '',
      invoice_date: invoice.invoice_date || '',
      due_date: invoice.due_date || '',
      customer: invoice.customer?.name || '',
      subtotal: Number(invoice.subtotal) || 0,
      vat: Number(invoice.vat_total) || 0,
      total,
      paid,
      outstanding: total - paid,
      status: STATUS_TEXT[invoice.status] || invoice.status || '',
      posted: invoice.posted ? 'Bəli' : 'Xeyr',
    };
  });
}

export function exportInvoicesCsv(invoices, { fileName } = {}) {
  const rows = registerRows(invoices);
  const header = ['Faktura', 'Tarix', 'Son ödəniş', 'Müştəri', 'Net', 'ƏDV', 'Cəmi', 'Ödənilib', 'Qalıq', 'Status', 'Jurnal'];
  const esc = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const body = rows.map((row) => [
    row.invoice_no, row.invoice_date, row.due_date, row.customer,
    row.subtotal.toFixed(2), row.vat.toFixed(2), row.total.toFixed(2),
    row.paid.toFixed(2), row.outstanding.toFixed(2), row.status, row.posted,
  ].map(esc).join(','));
  const csv = `\uFEFF${[header.map(esc).join(','), ...body].join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || `satis-fakturalari-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  return rows.length;
}

export function buildInvoiceRegisterHtml(invoices, { company = {}, filterLabel = 'Hamısı', search = '' } = {}) {
  const rows = registerRows(invoices);
  const sum = (key) => rows.reduce((acc, row) => acc + row[key], 0);
  const body = rows.map((row) => `<tr>
      <td>${escapeHtml(row.invoice_no)}</td>
      <td>${date(row.invoice_date)}</td>
      <td>${date(row.due_date)}</td>
      <td>${escapeHtml(row.customer || '—')}</td>
      <td class="num">${money(row.total)}</td>
      <td class="num">${money(row.paid)}</td>
      <td class="num">${money(row.outstanding)}</td>
      <td>${escapeHtml(row.status)}</td>
    </tr>`).join('');
  return `<!doctype html>
<html lang="az"><head><meta charset="utf-8" />
<title>Satış fakturaları registri</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1c2432; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color: #64748b; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0f3d33; color: #fff; text-align: left; padding: 6px 8px; font-size: 10px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e7ecf2; }
  .num { text-align: right; }
  tfoot td { font-weight: 700; border-top: 2px solid #0f3d33; }
</style></head>
<body>
  <h1>${escapeHtml(company.name || 'ExERP')} — Satış fakturaları</h1>
  <div class="muted">Filtr: ${escapeHtml(filterLabel)}${search ? ` · Axtarış: “${escapeHtml(search)}”` : ''} · ${rows.length} sənəd · ${date(new Date())}</div>
  <table>
    <thead><tr>
      <th>Faktura</th><th>Tarix</th><th>Son ödəniş</th><th>Müştəri</th>
      <th class="num">Cəmi</th><th class="num">Ödənilib</th><th class="num">Qalıq</th><th>Status</th>
    </tr></thead>
    <tbody>${body || '<tr><td colspan="8">Faktura tapılmadı.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="4">Yekun</td>
      <td class="num">${money(sum('total'))}</td>
      <td class="num">${money(sum('paid'))}</td>
      <td class="num">${money(sum('outstanding'))}</td>
      <td></td>
    </tr></tfoot>
  </table>
</body></html>`;
}

export function printInvoiceRegister(invoices, options = {}) {
  const html = buildInvoiceRegisterHtml(invoices, options);
  const win = window.open('', '_blank', 'width=1100,height=900');
  if (!win) throw new Error('Pop-up bloklandı. Brauzer parametrlərini yoxlayın.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}
