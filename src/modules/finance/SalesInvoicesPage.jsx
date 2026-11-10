import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import {
  DEFAULT_INVOICE_EXPORT_COLUMNS, INVOICE_EXPORT_COLUMNS,
  downloadEInvoice, exportInvoicesCsv, printInvoice, printInvoiceRegister,
} from "../../lib/invoicePdf.js";
import { useSalesInvoices } from "../../shared/hooks/useSalesInvoices.js";
import { useCustomers } from "../../shared/hooks/useCustomers.js";
import { useProducts } from "../../shared/hooks/useProducts.js";
import { useCashbook } from "../../shared/hooks/useCashbook.js";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { useBillingSources } from "../../shared/hooks/useBillingSources.js";
import { buildOrderInvoiceDraft, buildProjectInvoiceDraft, computeDraftTotals, validateDraft } from "../../lib/invoiceDraft.js";
import ProductSearchSelect from "../../components/ProductSearchSelect.jsx";

import LoadMoreBar from "../../components/LoadMoreBar.jsx";
import { toLocalIsoDate } from "../../services/date.js";
import {
  azn,
} from "../../shared/ui/tokens.js";

import { Button, Input, Select, Table } from "../../shared/ui/primitives.tsx";

const STATUS_TONE = {
  draft: "neutral", issued: "warning", partial: "warning", paid: "success", overdue: "danger", cancelled: "neutral",
};
const STATUS_LABEL = {
  draft: "Qaralama", issued: "Göndərilib", partial: "Qismən ödənilib",
  paid: "Ödənilib", overdue: "Gecikib", cancelled: "Ləğv",
};

const emptyLine = () => ({ product_id: "", description: "", qty: 1, unit_price: 0, discount_pct: 0, vat_rate: 18 });

export default function SalesInvoicesPage({ onOpenSalesOrder }) {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const company = { name: activeMembership?.tenant?.name || "ExERP" };
  const ar = useSalesInvoices(tenantId);
  const customerLookup = useCustomers(tenantId, { optionsOnly: true });
  const { customers } = customerLookup;
  const { products } = useProducts(tenantId);
  const { accounts } = useCashbook(tenantId);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [exportColumns, setExportColumns] = useState(DEFAULT_INVOICE_EXPORT_COLUMNS);
  const toggleExportColumn = (key) =>
    setExportColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
      return INVOICE_EXPORT_COLUMNS.map((column) => column.key).filter((columnKey) => next.includes(columnKey));
    });

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ar.invoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
      if (!q) return true;
      return `${invoice.invoice_no || ""} ${invoice.customer?.name || ""}`.toLowerCase().includes(q);
    });
  }, [ar.invoices, statusFilter, search]);

  const statusCounts = useMemo(() => {
    const counts = { all: ar.invoices.length };
    for (const invoice of ar.invoices) counts[invoice.status] = (counts[invoice.status] || 0) + 1;
    return counts;
  }, [ar.invoices]);

  const totals = useMemo(() => {
    const active = ar.invoices.filter((i) => i.status !== "cancelled");
    const billed = active.reduce((s, i) => s + Number(i.total), 0);
    const paid = active.reduce((s, i) => s + Number(i.paid_amount), 0);
    const overdue = active
      .filter((i) => i.due_date && new Date(i.due_date) < new Date() && Number(i.paid_amount) < Number(i.total))
      .reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);
    return { billed, paid, receivable: billed - paid, overdue };
  }, [ar.invoices]);

  const run = async (fn) => {
    setMsg("");
    try { await fn(); return true; } catch (error) { setMsg(`Xəta: ${error.message}`); return false; }
  };

  if (!tenantId) return <div className="ui-card">Aktiv şirkət seçilməyib.</div>;

  return (
    <div className="ui-page-stack">
      <div className="ui-table-actions ui-spacer-bottom">
        <div className="ui-stat-card"><div className="ui-stat-label">Fakturalanmış</div><div className="ui-stat-value">{azn(totals.billed)}</div></div>
        <div className="ui-stat-card"><div className="ui-stat-label">Ödənilmiş</div><div className="ui-stat-value">{azn(totals.paid)}</div></div>
        <div className="ui-stat-card"><div className="ui-stat-label">Debitor borcu</div><div className="ui-stat-value">{azn(totals.receivable)}</div></div>
        <div className="ui-stat-card"><div className="ui-stat-label">Gecikmiş</div><div className="ui-stat-value amount-due">{azn(totals.overdue)}</div></div>
      </div>

      {msg && <div className="ui-notice ui-notice-warning">{msg}</div>}
      {ar.error && <div role="alert" className="ui-notice ui-notice-warning">{ar.error.message}</div>}
      {customerLookup.loading && <div role="status">Müştərilər yüklənir...</div>}
      {customerLookup.error && <div role="alert" className="ui-notice ui-notice-warning">
        {customerLookup.error.message}
        <Button type="button" variant="secondary" onClick={customerLookup.refresh}>Yenidən cəhd</Button>
      </div>}
      <LoadMoreBar hasMore={customerLookup.hasMore} loading={customerLookup.loading}
        onLoadMore={customerLookup.loadMore} label="Daha çox müştəri yüklə" />

      <BillingRunPanel
        key={`billing-${tenantId}`}
        tenantId={tenantId}
        customers={customers}
        products={products}
        nextInvoiceNo={ar.nextInvoiceNo}
        onCreateDraft={(payload) => run(async () => {
          await ar.create(payload);
          setMsg(`Faktura ${payload.invoice_no} yaradıldı.`);
        })}
        invoicesVersion={ar.invoices.length}
      />



      <div className="ui-card">
        <div className="ui-toolbar ui-spacer-bottom">
          <h3 className="ui-section-title">Satış fakturaları ({filteredInvoices.length}/{ar.invoices.length})</h3>
          <Button  onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Bağla" : "+ Yeni faktura"}
          </Button>
        </div>

        {showForm && (
          <InvoiceForm
            key={`invoice-form-${tenantId}`}
            customers={customers}
            products={products}
            onCancel={() => setShowForm(false)}
            onSubmit={async (payload) => {
              return run(async () => {
                await ar.create(payload);
                setShowForm(false);
              });
            }}
          />
        )}


        <div className="ui-table-actions ui-spacer-bottom">
          {[["all", "Hamısı"], ...Object.entries(STATUS_LABEL)].map(([value, label]) => (
            <Button
              key={value}
              type="button"
              data-testid={`invoice-filter-${value}`}
              variant={statusFilter === value ? "primary" : "secondary"}
              onClick={() => setStatusFilter(value)}
            >
              {label} ({statusCounts[value] || 0})
            </Button>
          ))}
          <Input
            className="ui-search-input"
            placeholder="Faktura № və ya müştəri axtar…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            data-testid="invoice-search"
          />
          <Button
            type="button"
            variant="secondary"
            data-testid="invoice-export-columns-toggle"
            onClick={() => setShowColumnPicker((v) => !v)}
          >
            Sütunlar ({exportColumns.length})
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="invoice-export-csv"
            disabled={!filteredInvoices.length || !exportColumns.length}
            onClick={() => run(async () => {
              const count = exportInvoicesCsv(filteredInvoices, { columns: exportColumns });
              setMsg(`${count} faktura CSV formatında ixrac edildi.`);
            })}
          >
            CSV ixrac
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="invoice-export-pdf"
            disabled={!filteredInvoices.length || !exportColumns.length}
            onClick={() => run(async () => {
              printInvoiceRegister(filteredInvoices, {
                company,
                filterLabel: statusFilter === "all" ? "Hamısı" : STATUS_LABEL[statusFilter],
                search,
                columns: exportColumns,
              });
            })}
          >
            PDF ixrac
          </Button>
        </div>

        {showColumnPicker && (
          <div
            className="ui-form-surface"
            data-testid="invoice-export-columns"
          >
            <div className="ui-table-actions ui-spacer-bottom">
              <strong className="ui-help-text">İxrac sütunları</strong>
              <span className="ui-help-text">CSV və PDF üçün seçilmiş sütunlar</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setExportColumns(INVOICE_EXPORT_COLUMNS.map((c) => c.key))}
              >
                Hamısı
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setExportColumns(DEFAULT_INVOICE_EXPORT_COLUMNS)}
              >
                Standart
              </Button>
            </div>
            <div className="ui-table-actions ui-spacer-bottom">
              {INVOICE_EXPORT_COLUMNS.map((column) => (
                <label key={column.key} className="ui-checkbox-label">
                  <Input
                    type="checkbox"
                    checked={exportColumns.includes(column.key)}
                    data-testid={`invoice-export-col-${column.key}`}
                    onChange={() => toggleExportColumn(column.key)}
                  />
                  {column.label}
                </label>
              ))}
            </div>
            {!exportColumns.length && (
              <div className="ui-validation-error">Ən azı bir sütun seçin.</div>
            )}
          </div>
        )}


        <div className="ui-table-wrap"><Table className="ui-table">
          <thead>
            <tr>
              <th >№</th><th >Tarix</th><th >Müştəri</th>
              <th >Məbləğ</th><th >Ödənilib</th><th >Status</th>
              <th >Mühasibat</th><th  />
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice) => (
              <InvoiceRow
                key={`${tenantId}-${invoice.id}`}
                invoice={invoice}
                accounts={accounts}
                onOpenSalesOrder={onOpenSalesOrder}
                onPost={() => run(() => ar.postToLedger(invoice.id))}
                onPay={(payload) => run(() => ar.addPayment({ ...payload, invoice_id: invoice.id }))}
                onCancel={() => run(() => ar.cancel(invoice.id))}
                company={company}
              />
            ))}
            {!filteredInvoices.length && !ar.loading && (
              <tr><td  colSpan={8}>Faktura tapılmadı.</td></tr>
            )}
          </tbody>
        </Table></div>
        <LoadMoreBar hasMore={ar.hasMore} onLoadMore={ar.loadMore} loading={ar.loading} />
      </div>
    </div>
  );
}

export function InvoiceRow({ invoice, accounts, onPost, onPay, onCancel, company, onOpenSalesOrder }) {
  const [payOpen, setPayOpen] = useState(false);
  const outstanding = Number(invoice.total) - Number(invoice.paid_amount);
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <tr>
        <td ><b>{invoice.invoice_no}</b></td>
        <td >{new Date(invoice.invoice_date).toLocaleDateString("az-AZ")}</td>
        <td >{invoice.customer?.name || "—"}</td>
        <td className="ui-emphasis is-numeric">{azn(invoice.total)}</td>
        <td >{azn(invoice.paid_amount)}</td>
        <td ><span className={`ui-badge ui-badge-${STATUS_TONE[invoice.status]}`}>{STATUS_LABEL[invoice.status]}</span></td>
        <td >
          {invoice.posted
            ? <span className={`ui-badge ui-badge-${"success"}`}>Yazılıb</span>
            : invoice.status !== "cancelled" && <Button variant="secondary" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await onPost(); } finally { setBusy(false); }
            }}>Jurnala yaz</Button>}
        </td>
        <td >
          {invoice.status !== "cancelled" && outstanding > 0 && (
            invoice.order_id
              ? <Button variant="secondary" disabled={!onOpenSalesOrder} onClick={() => onOpenSalesOrder?.(invoice.order_id)}>Satış ödənişi</Button>
              : <Button  disabled={busy || !invoice.posted} onClick={() => {
                setAmount(outstanding.toFixed(2)); setPayOpen((v) => !v);
              }}>Ödəniş</Button>
          )}
          <Button variant="secondary" title="PDF / çap" onClick={() => printInvoice(invoice, { company })}>PDF</Button>
          <Button variant="secondary" title="E-faktura JSON" onClick={() => downloadEInvoice(invoice, company)}>E-faktura</Button>
          {invoice.status !== "cancelled" && (
            <Button variant="danger" disabled={busy} onClick={async () => {
              if (!(await appConfirm("Faktura ləğv edilsin?", { danger: true }))) return;
              setBusy(true);
              try { await onCancel(); } finally { setBusy(false); }
            }}>Ləğv</Button>
          )}
        </td>
      </tr>
      {payOpen && (
        <tr>
          <td  colSpan={8}>
            <div className="ui-table-actions ui-spacer-bottom">
              <Input aria-label="Faktura ödəniş məbləği" disabled={busy} type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}  />
              <Select aria-label="Faktura ödəniş hesabı" disabled={busy} value={accountId} onChange={(e) => setAccountId(e.target.value)} >
                <option value="">Hesab seç…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
              <Button
                
                disabled={busy || !accountId || !(Number(amount) > 0) || Number(amount) > outstanding}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try { if (await onPay({ amount, account_id: accountId })) setPayOpen(false); }
                  finally { setBusy(false); }
                }}
              >
                Ödənişi qeyd et
              </Button>
              <span className="ui-help-text">Qalıq: {azn(outstanding)}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function InvoiceForm({ customers, products, onSubmit, onCancel }) {
  const [header, setHeader] = useState({
    invoice_no: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    customer_id: "",
    invoice_date: toLocalIsoDate(),
    due_date: "",
    notes: "",
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    const draft = computeDraftTotals(lines);
    return { net: draft.subtotal, vat: draft.vat_total, total: draft.total };
  }, [lines]);

  const patchLine = (index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <form
      className="ui-form-surface"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try { await onSubmit({ ...header, due_date: header.due_date || null, lines }); }
        finally { setBusy(false); }
      }}
    >
      <fieldset disabled={busy} className="ui-fieldset">
      <div className="ui-form-grid ui-spacer-bottom">
        <Input required placeholder="Faktura №" value={header.invoice_no} onChange={(e) => setHeader({ ...header, invoice_no: e.target.value })}  />
        <Select aria-label="Faktura müştərisi" required value={header.customer_id} onChange={(e) => setHeader({ ...header, customer_id: e.target.value })} >
          <option value="">Müştəri seç…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Input type="date" value={header.invoice_date} onChange={(e) => setHeader({ ...header, invoice_date: e.target.value })}  />
        <Input type="date" placeholder="Son ödəniş" value={header.due_date} onChange={(e) => setHeader({ ...header, due_date: e.target.value })}  />
      </div>

      <div className="ui-table-wrap"><Table className="ui-table">
        <thead>
          <tr>
            <th >Məhsul / təsvir</th><th >Say</th><th >Qiymət</th>
            <th >Endirim %</th><th >ƏDV %</th><th  />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td >
                <ProductSearchSelect
                  products={products}
                  value={line.product_id}
                  onChange={(productId, product) => {
                    patchLine(index, {
                      product_id: productId,
                      description: product?.name || line.description,
                      unit_price: product?.price ?? line.unit_price,
                      vat_rate: product?.vat_rate ?? line.vat_rate,
                    });
                  }}
                />
                <Input
                  placeholder="Təsvir"
                  value={line.description}
                  onChange={(e) => patchLine(index, { description: e.target.value })}
                  className="ui-spacer-top"
                />
              </td>
              <td ><Input aria-label="Faktura sətirinin sayı" type="number" min="0.001" step="0.001" value={line.qty} onChange={(e) => patchLine(index, { qty: e.target.value })} className="ui-cell-input" /></td>
              <td ><Input aria-label="Faktura sətirinin qiyməti" type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => patchLine(index, { unit_price: e.target.value })} className="ui-cell-input" /></td>
              <td ><Input aria-label="Faktura sətirinin endirim faizi" type="number" min="0" max="100" step="0.01" value={line.discount_pct} onChange={(e) => patchLine(index, { discount_pct: e.target.value })} className="ui-cell-input" /></td>
              <td ><Input aria-label="Faktura sətirinin ƏDV faizi" type="number" min="0" max="100" step="0.01" value={line.vat_rate} onChange={(e) => patchLine(index, { vat_rate: e.target.value })} className="ui-cell-input" /></td>
              <td >
                <Button type="button" variant="danger" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>Sil</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table></div>

      <div className="ui-toolbar ui-spacer-bottom">
        <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])}>+ Sətir</Button>
        <div className="ui-help-text">
          Ara cəm: <b>{azn(totals.net)}</b> · ƏDV: <b>{azn(totals.vat)}</b> · Yekun: <b className="amount-positive">{azn(totals.total)}</b>
        </div>
        <div className="ui-table-actions ui-spacer-bottom">
          <Button type="button" variant="secondary" onClick={onCancel}>İmtina</Button>
          <Button type="submit" disabled={busy || !lines.length} >Yadda saxla</Button>
        </div>
      </div>
      </fieldset>
    </form>
  );
}

// Faktura kəsimi axını: sifariş və layihələrdən avtomatik faktura yaradılması.
function BillingRunPanel({ tenantId, customers, products, nextInvoiceNo, onCreateDraft, invoicesVersion }) {
  const [tab, setTab] = useState("orders");
  const [open, setOpen] = useState(false);
  const src = useBillingSources(tenantId);
  const [projectCustomer, setProjectCustomer] = useState({});
  const [projectPercent, setProjectPercent] = useState({});
  const [preview, setPreview] = useState(null); // düzəliş edilə bilən qaralama
  const [busy, setBusy] = useState(false);

  useEffect(() => { src.refresh(); }, [invoicesVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const openOrderPreview = async (order) => {
    const invoiceNo = await nextInvoiceNo?.().catch(() => null);
    setPreview(buildOrderInvoiceDraft(order, { invoice_no: invoiceNo }));
  };

  const openProjectPreview = async (project, customerId, percent) => {
    const invoiceNo = await nextInvoiceNo?.().catch(() => null);
    const customerName = customers.find((c) => c.id === customerId)?.name;
    setPreview(buildProjectInvoiceDraft(project, {
      invoice_no: invoiceNo, customer_id: customerId, customer_name: customerName, percent: Number(percent),
    }));
  };

  const confirmDraft = async (draft) => {
    if (busy) return;
    setBusy(true);
    try {
      const invoiceNo = draft.invoice_no || (await nextInvoiceNo?.().catch(() => null));
      const saved = await onCreateDraft({
        invoice_no: invoiceNo,
        customer_id: draft.customer_id || null,
        order_id: draft.order_id || null,
        invoice_date: draft.invoice_date,
        due_date: draft.due_date || null,
        currency: draft.currency || "AZN",
        notes: draft.notes || null,
        lines: draft.lines,
      });
      if (saved) { setPreview(null); src.refresh(); }
    } finally {
      setBusy(false);
    }
  };



  const pendingOrders = src.orders.filter((o) => !o.billed);
  const pendingProjects = src.projects.filter((p) => !p.billed);

  return (
    <div className="ui-card">
      <div className="ui-toolbar ui-spacer-bottom">
        <h3 className="ui-section-title">
          Faktura kəsimi axını{" "}
          <span className={`ui-badge ui-badge-${"warning"}`}>{pendingOrders.length + pendingProjects.length} gözləyir</span>
        </h3>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? "Gizlət" : "Aç"}</Button>
      </div>

      {open && (
        <div className="ui-spacer-top">
          <div className="ui-table-actions ui-spacer-bottom">
            <Button variant={tab === "orders" ? "primary" : "secondary"} onClick={() => setTab("orders")}>
              Sifarişlər ({pendingOrders.length})
            </Button>
            <Button variant={tab === "projects" ? "primary" : "secondary"} onClick={() => setTab("projects")}>
              Layihələr ({pendingProjects.length})
            </Button>
          </div>

          {src.error && <div role="alert" className="ui-notice ui-notice-warning">
            Faktura mənbələri yüklənmədi: {src.error.message}
            <Button type="button" variant="secondary" onClick={src.refresh}>Yenidən cəhd</Button>
          </div>}
          {tab === "orders" ? (
            <div className="ui-table-wrap"><Table className="ui-table">
              <thead>
                <tr>
                  <th >Sifariş №</th><th >Müştəri</th><th >Sətir</th>
                  <th >Məbləğ</th><th >Status</th><th  />
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((order) => (
                  <tr key={order.id}>
                    <td ><b>{order.order_no}</b></td>
                    <td >{order.customer?.name || "—"}</td>
                    <td >{order.items?.length || 0}</td>
                    <td >{azn(order.total)}</td>
                    <td ><span className={`ui-badge ui-badge-${"neutral"}`}>{order.status}</span></td>
                    <td >
                      <Button
                        
                        disabled={!(order.items?.length)}
                        onClick={() => openOrderPreview(order)}
                      >
                        Ön baxış və kəs
                      </Button>

                    </td>
                  </tr>
                ))}
                {!pendingOrders.length && <tr><td  colSpan={6}>Fakturalanmamış sifariş yoxdur.</td></tr>}
              </tbody>
            </Table></div>
          ) : (
            <div className="ui-table-wrap"><Table className="ui-table">
              <thead>
                <tr>
                  <th >Layihə</th><th >Büdcə</th><th >Müştəri</th>
                  <th >Mərhələ %</th><th  />
                </tr>
              </thead>
              <tbody>
                {pendingProjects.map((project) => {
                  const percent = projectPercent[project.id] ?? 100;
                  const customerId = projectCustomer[project.id] || "";
                  return (
                    <tr key={project.id}>
                      <td ><b>{project.name}</b></td>
                      <td >{azn(project.budget)}</td>
                      <td >
                        <Select
                          value={customerId}
                          onChange={(e) => setProjectCustomer((p) => ({ ...p, [project.id]: e.target.value }))}
                          
                        >
                          <option value="">Müştəri seç…</option>
                          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                      </td>
                      <td >
                        <Input
                          type="number" min="1" max="100" step="1" value={percent}
                          onChange={(e) => setProjectPercent((p) => ({ ...p, [project.id]: e.target.value }))}
                          className="ui-cell-input"
                        />
                      </td>
                      <td >
                        <Button
                          
                          disabled={!customerId || !(Number(project.budget) > 0)}
                          onClick={() => openProjectPreview(project, customerId, percent)}
                        >
                          Ön baxış və kəs
                        </Button>

                      </td>
                    </tr>
                  );
                })}
                {!pendingProjects.length && <tr><td  colSpan={5}>Fakturalanmamış layihə yoxdur.</td></tr>}
              </tbody>
            </Table></div>
          )}
        </div>
      )}

      {preview && (
        <InvoicePreviewModal
          initialDraft={preview}
          customers={customers}
          products={products}
          busy={busy}
          onClose={() => setPreview(null)}
          onConfirm={confirmDraft}
        />
      )}
    </div>
  );
}

// Faktura kəsilməzdən əvvəl yaradılacaq sənədin redaktə edilə bilən ön baxışı.
function InvoicePreviewModal({ initialDraft, customers = [], products = [], busy, onClose, onConfirm }) {
  const [draft, setDraft] = useState(initialDraft);
  const totals = useMemo(() => computeDraftTotals(draft.lines || []), [draft.lines]);
  const validation = useMemo(() => validateDraft(draft), [draft]);
  const blocked = validation.hasErrors;

  const fieldIssues = (index, field) =>
    (validation.lineIssues[index] || []).filter((i) => i.field === field);
  const fieldClass = (index, field) => {
    const issues = fieldIssues(index, field);
    return issues.some(issue => issue.level === "error") ? "ui-invalid" : issues.length ? "ui-caution" : "";
  };
  const FieldError = ({ index, field }) => {
    const issues = fieldIssues(index, field);
    if (!issues.length) return null;
    return (
      <div className="ui-spacer-top">
        {issues.map((i, k) => (
          <div key={k} className={i.level === "error" ? "ui-validation-error" : "ui-validation-warning"}>
            {i.level === "error" ? "⛔" : "⚠"} {i.message}
          </div>
        ))}
      </div>
    );
  };

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const patchLine = (index, p) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, i) => (i === index ? { ...l, ...p } : l)) }));
  const addLine = () =>
    setDraft((d) => ({ ...d, lines: [...d.lines, { product_id: "", description: "", qty: 1, unit_price: 0, discount_pct: 0, vat_rate: 18 }] }));
  const removeLine = (index) =>
    setDraft((d) => ({ ...d, lines: d.lines.filter((_, i) => i !== index) }));
  const setAllVat = (rate) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, vat_rate: Number(rate) })) }));


  return (
    <div
      onClick={() => { if (!busy) onClose(); }}
      className="ui-modal-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ui-modal-surface"
      >
        <fieldset disabled={busy} className="ui-fieldset">
        <div className="ui-toolbar ui-spacer-bottom">
          <div>
            <div className="ui-help-text">
              Faktura ön baxışı — redaktə edilə bilər
            </div>
            <h3 className="ui-section-title">{draft.title}</h3>
          </div>
          <Button variant="secondary" onClick={onClose}>Bağla</Button>
        </div>

        <div className="ui-form-grid ui-spacer-bottom">
          <label className="ui-field ui-spacer-top">
            <span className="ui-stat-label">Faktura №</span>
            <Input  value={draft.invoice_no} placeholder="avtomatik" onChange={(e) => patch({ invoice_no: e.target.value })} />
          </label>
          <label className="ui-field ui-spacer-top">
            <span className="ui-stat-label">Müştəri</span>
            <Select
              
              value={draft.customer_id || ""}
              onChange={(e) => patch({
                customer_id: e.target.value || null,
                customer_name: customers.find((c) => c.id === e.target.value)?.name || "—",
              })}
            >
              <option value="">Müştəri seç…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </label>
          <label className="ui-field ui-spacer-top">
            <span className="ui-stat-label">Tarix</span>
            <Input type="date"  value={draft.invoice_date} onChange={(e) => patch({ invoice_date: e.target.value })} />
          </label>
          <label className="ui-field ui-spacer-top">
            <span className="ui-stat-label">Son ödəniş</span>
            <Input type="date"  value={draft.due_date || ""} onChange={(e) => patch({ due_date: e.target.value })} />
          </label>
          <label className="ui-field ui-spacer-top">
            <span className="ui-stat-label">Valyuta</span>
            <Input  value={draft.currency} onChange={(e) => patch({ currency: e.target.value })} />
          </label>
        </div>

        <div className="ui-table-actions ui-spacer-bottom">
          <span className="ui-help-text">Bütün sətirlərə ƏDV tətbiq et:</span>
          {[0, 18].map((rate) => (
            <Button key={rate} type="button" variant="secondary" onClick={() => setAllVat(rate)}>{rate}%</Button>
          ))}
        </div>

        <div className="ui-table-wrap"><Table className="ui-table">
          <thead>
            <tr>
              <th >#</th><th >Təsvir</th><th >Say</th>
              <th >Qiymət</th><th >End. %</th><th >ƏDV %</th>
              <th >Cəm</th><th  />
            </tr>
          </thead>
          <tbody>
            {totals.rows.map((row, index) => {
              const rowIssues = validation.lineIssues[index] || [];
              const rowHasError = rowIssues.some((i) => i.level === "error");
              return (
              <tr key={index} className={rowHasError ? "ui-row-invalid" : undefined}>
                <td >{row.line_no}</td>
                <td >
                  {!!products.length && (
                    <ProductSearchSelect
                      products={products}
                      value={row.product_id || ""}
                      onChange={(productId, product) => {
                        patchLine(index, {
                          product_id: productId || null,
                          description: product?.name ?? row.description,
                          unit_price: product?.price ?? row.unit_price,
                          vat_rate: product?.vat_rate ?? row.vat_rate,
                        });
                      }}
                    />
                  )}
                  <Input
                    className={fieldClass(index, "description")}
                    value={row.description || ""}
                    placeholder="Təsvir"
                    onChange={(e) => patchLine(index, { description: e.target.value })}
                  />
                  <FieldError index={index} field="description" />
                </td>
                <td >
                  <Input type="number" step="0.001" className={fieldClass(index, "qty")} value={row.qty} onChange={(e) => patchLine(index, { qty: e.target.value })} />
                  <FieldError index={index} field="qty" />
                </td>
                <td >
                  <Input type="number" step="0.01" className={fieldClass(index, "unit_price")} value={row.unit_price} onChange={(e) => patchLine(index, { unit_price: e.target.value })} />
                  <FieldError index={index} field="unit_price" />
                </td>
                <td >
                  <Input type="number" step="0.01" className={fieldClass(index, "discount_pct")} value={row.discount_pct} onChange={(e) => patchLine(index, { discount_pct: e.target.value })} />
                  <FieldError index={index} field="discount_pct" />
                </td>
                <td >
                  <Input type="number" step="0.01" className={fieldClass(index, "vat_rate")} value={row.vat_rate} onChange={(e) => patchLine(index, { vat_rate: e.target.value })} />
                  <FieldError index={index} field="vat_rate" />
                </td>
                <td className="ui-emphasis is-numeric">{azn(row.line_total)}</td>
                <td ><Button type="button" variant="danger" onClick={() => removeLine(index)}>Sil</Button></td>
              </tr>
              );
            })}
            {!totals.rows.length && <tr><td  colSpan={8}>Sətir yoxdur.</td></tr>}

          </tbody>
        </Table></div>

        <div className="ui-toolbar ui-spacer-bottom">
          <Button type="button" variant="secondary" onClick={addLine}>+ Sətir</Button>
          <div className="ui-invoice-totals">
            {totals.vat_breakdown.map((g) => (
              <div key={g.rate} className="ui-help-text">
                ƏDV {g.rate}% — baza {azn(g.net)} · vergi <b>{azn(g.vat)}</b>
              </div>
            ))}
            <div>Ara cəm: <b>{azn(totals.subtotal)}</b></div>
            <div>ƏDV cəmi: <b>{azn(totals.vat_total)}</b></div>
            <div className={Math.abs(validation.roundingDiff) > 0.005 ? "ui-validation-error" : "ui-help-text"}>
              Yuvarlaqlaşdırma fərqi: <b>{validation.roundingDiff.toFixed(2)} ₼</b>
            </div>
            <div className="ui-summary-line">Yekun: <b className="amount-positive">{azn(totals.total)}</b></div>
          </div>
        </div>

        <label className="ui-field ui-spacer-top">
          <span className="ui-stat-label">Qeyd</span>
          <textarea  value={draft.notes || ""} onChange={(e) => patch({ notes: e.target.value })} />
        </label>

        {(validation.docIssues.length > 0 || validation.errorCount > 0 || validation.warningCount > 0) && (
          <div className="ui-notice ui-notice-warning">
            <div className={blocked ? "ui-validation-error" : "ui-validation-warning"}>
              Validasiya: {validation.errorCount} xəta · {validation.warningCount} xəbərdarlıq
            </div>
            {validation.docIssues.map((i, k) => (
              <div key={k} className={i.level === "error" ? "ui-validation-error" : "ui-validation-warning"}>
                {i.level === "error" ? "⛔" : "⚠"} {i.message}
              </div>
            ))}
            {validation.lineIssues.flatMap((issues, index) =>
              issues.filter((i) => i.level === "error").map((i, k) => (
                <div key={`${index}-${k}`} className="ui-validation-error">
                  ⛔ Sətir {index + 1}: {i.message}
                </div>
              )))}
          </div>
        )}


        <div className="ui-table-actions ui-spacer-bottom">
          <Button variant="secondary" onClick={onClose}>İmtina</Button>
          <Button  disabled={busy || blocked} onClick={() => onConfirm(draft)}>
            {busy ? "Yaradılır…" : "Təsdiqlə və faktura kəs"}
          </Button>
        </div>
        </fieldset>
      </div>
    </div>
  );
}
