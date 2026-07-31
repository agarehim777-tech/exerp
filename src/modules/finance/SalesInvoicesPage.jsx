import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { downloadEInvoice, printInvoice } from "../../lib/invoicePdf.js";
import { useSalesInvoices } from "../../shared/hooks/useSalesInvoices.js";
import { useCustomers } from "../../shared/hooks/useCustomers.js";
import { useProducts } from "../../shared/hooks/useProducts.js";
import { useCashbook } from "../../shared/hooks/useCashbook.js";
import { useBillingSources } from "../../shared/hooks/useBillingSources.js";
import { buildOrderInvoiceDraft, buildProjectInvoiceDraft } from "../../lib/invoiceDraft.js";

import {
  azn, badge, card, delBtn, input, msgBox, primaryBtn, secondaryBtn,
  statLabel, statTile, statValue, table, td, th,
} from "../../shared/ui/tokens.js";

const STATUS_TONE = {
  draft: "gray", issued: "amber", partial: "amber", paid: "green", overdue: "red", cancelled: "gray",
};
const STATUS_LABEL = {
  draft: "Qaralama", issued: "Göndərilib", partial: "Qismən ödənilib",
  paid: "Ödənilib", overdue: "Gecikib", cancelled: "Ləğv",
};

const emptyLine = () => ({ product_id: "", description: "", qty: 1, unit_price: 0, discount_pct: 0, vat_rate: 18 });

export default function SalesInvoicesPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const company = { name: activeMembership?.tenant?.name || "ExERP" };
  const ar = useSalesInvoices(tenantId);
  const { customers } = useCustomers(tenantId);
  const { products } = useProducts(tenantId);
  const { accounts } = useCashbook(tenantId);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");

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
    try { await fn(); } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statTile}><div style={statLabel}>Fakturalanmış</div><div style={statValue}>{azn(totals.billed)}</div></div>
        <div style={statTile}><div style={statLabel}>Ödənilmiş</div><div style={statValue}>{azn(totals.paid)}</div></div>
        <div style={statTile}><div style={statLabel}>Debitor borcu</div><div style={statValue}>{azn(totals.receivable)}</div></div>
        <div style={statTile}><div style={statLabel}>Gecikmiş</div><div style={{ ...statValue, color: "#b23a3a" }}>{azn(totals.overdue)}</div></div>
      </div>

      {msg && <div style={msgBox}>{msg}</div>}

      <BillingRunPanel
        tenantId={tenantId}
        customers={customers}
        nextInvoiceNo={ar.nextInvoiceNo}
        onCreateFromOrder={(order) => run(async () => { await ar.createFromOrder(order); setMsg(`Sifariş ${order.order_no} üzrə faktura yaradıldı.`); })}
        onCreateFromProject={(project, options) => run(async () => { await ar.createFromProject(project, options); setMsg(`Layihə "${project.name}" üzrə faktura yaradıldı.`); })}
        invoicesVersion={ar.invoices.length}
      />


      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Satış fakturaları ({ar.invoices.length})</h3>
          <button style={primaryBtn} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Bağla" : "+ Yeni faktura"}
          </button>
        </div>

        {showForm && (
          <InvoiceForm
            customers={customers}
            products={products}
            onCancel={() => setShowForm(false)}
            onSubmit={async (payload) => {
              await run(async () => {
                await ar.create(payload);
                setShowForm(false);
              });
            }}
          />
        )}


        <table style={table}>
          <thead>
            <tr>
              <th style={th}>№</th><th style={th}>Tarix</th><th style={th}>Müştəri</th>
              <th style={th}>Məbləğ</th><th style={th}>Ödənilib</th><th style={th}>Status</th>
              <th style={th}>Mühasibat</th><th style={th} />
            </tr>
          </thead>
          <tbody>
            {ar.invoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                accounts={accounts}
                onPost={() => run(() => ar.postToLedger(invoice.id))}
                onPay={(payload) => run(() => ar.addPayment({ ...payload, invoice_id: invoice.id }))}
                onCancel={() => run(() => ar.cancel(invoice.id))}
                company={company}
              />
            ))}
            {!ar.invoices.length && !ar.loading && (
              <tr><td style={td} colSpan={8}>Faktura yoxdur.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice, accounts, onPost, onPay, onCancel, company }) {
  const [payOpen, setPayOpen] = useState(false);
  const outstanding = Number(invoice.total) - Number(invoice.paid_amount);
  const [amount, setAmount] = useState(outstanding.toFixed(2));
  const [accountId, setAccountId] = useState("");

  return (
    <>
      <tr>
        <td style={td}><b>{invoice.invoice_no}</b></td>
        <td style={td}>{new Date(invoice.invoice_date).toLocaleDateString("az-AZ")}</td>
        <td style={td}>{invoice.customer?.name || "—"}</td>
        <td style={{ ...td, fontWeight: 600 }}>{azn(invoice.total)}</td>
        <td style={td}>{azn(invoice.paid_amount)}</td>
        <td style={td}><span style={badge(STATUS_TONE[invoice.status])}>{STATUS_LABEL[invoice.status]}</span></td>
        <td style={td}>
          {invoice.posted
            ? <span style={badge("green")}>Yazılıb</span>
            : <button style={secondaryBtn} onClick={onPost}>Jurnala yaz</button>}
        </td>
        <td style={td}>
          {invoice.status !== "cancelled" && outstanding > 0 && (
            <button style={primaryBtn} onClick={() => setPayOpen((v) => !v)}>Ödəniş</button>
          )}
          <button style={secondaryBtn} title="PDF / çap" onClick={() => printInvoice(invoice, { company })}>PDF</button>
          <button style={secondaryBtn} title="E-faktura JSON" onClick={() => downloadEInvoice(invoice, company)}>E-faktura</button>
          {invoice.status !== "cancelled" && (
            <button style={delBtn} onClick={() => window.confirm("Faktura ləğv edilsin?") && onCancel()}>Ləğv</button>
          )}
        </td>
      </tr>
      {payOpen && (
        <tr>
          <td style={td} colSpan={8}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...input, width: 140 }} />
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={input}>
                <option value="">Hesab seç…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button
                style={primaryBtn}
                onClick={async () => {
                  await onPay({ amount, account_id: accountId });
                  setPayOpen(false);
                }}
              >
                Ödənişi qeyd et
              </button>
              <span style={{ fontSize: 12, color: "#8a7a4a" }}>Qalıq: {azn(outstanding)}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function InvoiceForm({ customers, products, onSubmit, onCancel }) {
  const [header, setHeader] = useState({
    invoice_no: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    customer_id: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: "",
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    let net = 0;
    let vat = 0;
    lines.forEach((line) => {
      const base = (Number(line.qty) || 0) * (Number(line.unit_price) || 0) * (1 - (Number(line.discount_pct) || 0) / 100);
      net += base;
      vat += base * ((Number(line.vat_rate) || 0) / 100);
    });
    return { net, vat, total: net + vat };
  }, [lines]);

  const patchLine = (index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <form
      style={{ border: "1px solid #e6dfc9", borderRadius: 10, padding: 14, marginBottom: 16, background: "#fcfaf2" }}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        await onSubmit({ ...header, due_date: header.due_date || null, lines });
        setBusy(false);
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input required placeholder="Faktura №" value={header.invoice_no} onChange={(e) => setHeader({ ...header, invoice_no: e.target.value })} style={input} />
        <select required value={header.customer_id} onChange={(e) => setHeader({ ...header, customer_id: e.target.value })} style={input}>
          <option value="">Müştəri seç…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={header.invoice_date} onChange={(e) => setHeader({ ...header, invoice_date: e.target.value })} style={input} />
        <input type="date" placeholder="Son ödəniş" value={header.due_date} onChange={(e) => setHeader({ ...header, due_date: e.target.value })} style={input} />
      </div>

      <table style={{ ...table, marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}>Məhsul / təsvir</th><th style={th}>Say</th><th style={th}>Qiymət</th>
            <th style={th}>Endirim %</th><th style={th}>ƏDV %</th><th style={th} />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td style={td}>
                <select
                  value={line.product_id}
                  onChange={(e) => {
                    const product = products.find((p) => p.id === e.target.value);
                    patchLine(index, {
                      product_id: e.target.value,
                      description: product?.name || line.description,
                      unit_price: product?.price ?? line.unit_price,
                      vat_rate: product?.vat_rate ?? line.vat_rate,
                    });
                  }}
                  style={{ ...input, width: "100%" }}
                >
                  <option value="">Sərbəst sətir…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input
                  placeholder="Təsvir"
                  value={line.description}
                  onChange={(e) => patchLine(index, { description: e.target.value })}
                  style={{ ...input, width: "100%", marginTop: 4 }}
                />
              </td>
              <td style={td}><input type="number" step="0.001" value={line.qty} onChange={(e) => patchLine(index, { qty: e.target.value })} style={{ ...input, width: 80 }} /></td>
              <td style={td}><input type="number" step="0.01" value={line.unit_price} onChange={(e) => patchLine(index, { unit_price: e.target.value })} style={{ ...input, width: 100 }} /></td>
              <td style={td}><input type="number" step="0.01" value={line.discount_pct} onChange={(e) => patchLine(index, { discount_pct: e.target.value })} style={{ ...input, width: 80 }} /></td>
              <td style={td}><input type="number" step="0.01" value={line.vat_rate} onChange={(e) => patchLine(index, { vat_rate: e.target.value })} style={{ ...input, width: 80 }} /></td>
              <td style={td}>
                <button type="button" style={delBtn} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>Sil</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={secondaryBtn} onClick={() => setLines((prev) => [...prev, emptyLine()])}>+ Sətir</button>
        <div style={{ fontSize: 13 }}>
          Ara cəm: <b>{azn(totals.net)}</b> · ƏDV: <b>{azn(totals.vat)}</b> · Yekun: <b style={{ color: "#064e3b" }}>{azn(totals.total)}</b>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={secondaryBtn} onClick={onCancel}>İmtina</button>
          <button type="submit" disabled={busy} style={primaryBtn}>Yadda saxla</button>
        </div>
      </div>
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
    setBusy(true);
    try {
      const invoiceNo = draft.invoice_no || (await nextInvoiceNo?.().catch(() => null));
      await onCreateDraft({
        invoice_no: invoiceNo,
        customer_id: draft.customer_id || null,
        order_id: draft.order_id || null,
        invoice_date: draft.invoice_date,
        due_date: draft.due_date || null,
        currency: draft.currency || "AZN",
        notes: draft.notes || null,
        lines: draft.lines,
      });
      setPreview(null);
      src.refresh();
    } finally {
      setBusy(false);
    }
  };



  const pendingOrders = src.orders.filter((o) => !o.billed);
  const pendingProjects = src.projects.filter((p) => !p.billed);

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>
          Faktura kəsimi axını{" "}
          <span style={badge("amber")}>{pendingOrders.length + pendingProjects.length} gözləyir</span>
        </h3>
        <button style={secondaryBtn} onClick={() => setOpen((v) => !v)}>{open ? "Gizlət" : "Aç"}</button>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button style={tab === "orders" ? primaryBtn : secondaryBtn} onClick={() => setTab("orders")}>
              Sifarişlər ({pendingOrders.length})
            </button>
            <button style={tab === "projects" ? primaryBtn : secondaryBtn} onClick={() => setTab("projects")}>
              Layihələr ({pendingProjects.length})
            </button>
          </div>

          {tab === "orders" ? (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Sifariş №</th><th style={th}>Müştəri</th><th style={th}>Sətir</th>
                  <th style={th}>Məbləğ</th><th style={th}>Status</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((order) => (
                  <tr key={order.id}>
                    <td style={td}><b>{order.order_no}</b></td>
                    <td style={td}>{order.customer?.name || "—"}</td>
                    <td style={td}>{order.items?.length || 0}</td>
                    <td style={td}>{azn(order.total)}</td>
                    <td style={td}><span style={badge("gray")}>{order.status}</span></td>
                    <td style={td}>
                      <button
                        style={primaryBtn}
                        disabled={!(order.items?.length)}
                        onClick={() => openOrderPreview(order)}
                      >
                        Ön baxış və kəs
                      </button>

                    </td>
                  </tr>
                ))}
                {!pendingOrders.length && <tr><td style={td} colSpan={6}>Fakturalanmamış sifariş yoxdur.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Layihə</th><th style={th}>Büdcə</th><th style={th}>Müştəri</th>
                  <th style={th}>Mərhələ %</th><th style={th} />
                </tr>
              </thead>
              <tbody>
                {pendingProjects.map((project) => {
                  const percent = projectPercent[project.id] ?? 100;
                  const customerId = projectCustomer[project.id] || "";
                  return (
                    <tr key={project.id}>
                      <td style={td}><b>{project.name}</b></td>
                      <td style={td}>{azn(project.budget)}</td>
                      <td style={td}>
                        <select
                          value={customerId}
                          onChange={(e) => setProjectCustomer((p) => ({ ...p, [project.id]: e.target.value }))}
                          style={input}
                        >
                          <option value="">Müştəri seç…</option>
                          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        <input
                          type="number" min="1" max="100" step="1" value={percent}
                          onChange={(e) => setProjectPercent((p) => ({ ...p, [project.id]: e.target.value }))}
                          style={{ ...input, width: 80 }}
                        />
                      </td>
                      <td style={td}>
                        <button
                          style={primaryBtn}
                          disabled={!customerId || !(Number(project.budget) > 0)}
                          onClick={() => openProjectPreview(project, customerId, percent)}
                        >
                          Ön baxış və kəs
                        </button>

                      </td>
                    </tr>
                  );
                })}
                {!pendingProjects.length && <tr><td style={td} colSpan={5}>Fakturalanmamış layihə yoxdur.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {preview && (
        <InvoicePreviewModal
          draft={preview.draft}
          busy={busy}
          onClose={() => setPreview(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await preview.confirm(); setPreview(null); } finally { setBusy(false); }
          }}
        />
      )}
    </div>
  );
}

// Faktura kəsilməzdən əvvəl yaradılacaq sənədin ön baxışı.
function InvoicePreviewModal({ draft, busy, onClose, onConfirm }) {
  const blocked = (draft.warnings || []).length > 0;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(12,20,18,0.55)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fffdf7", borderRadius: 12, border: "1px solid #e6dfc9",
          width: "min(760px, 100%)", maxHeight: "88vh", overflow: "auto",
          padding: 20, boxShadow: "0 24px 60px rgba(0,0,0,.28)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#8a7a4a" }}>Faktura ön baxışı</div>
            <h3 style={{ margin: "4px 0 0" }}>{draft.title}</h3>
          </div>
          <button style={secondaryBtn} onClick={onClose}>Bağla</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, margin: "14px 0" }}>
          <Field label="Faktura №" value={draft.invoice_no} />
          <Field label="Müştəri" value={draft.customer_name} />
          <Field label="Tarix" value={draft.invoice_date} />
          <Field label="Son ödəniş" value={draft.due_date} />
          <Field label="Valyuta" value={draft.currency} />
        </div>

        <table style={table}>
          <thead>
            <tr>
              <th style={th}>#</th><th style={th}>Təsvir</th><th style={th}>Say</th>
              <th style={th}>Qiymət</th><th style={th}>End. %</th><th style={th}>ƏDV %</th><th style={th}>Cəm</th>
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row) => (
              <tr key={row.line_no}>
                <td style={td}>{row.line_no}</td>
                <td style={td}>{row.description || "—"}</td>
                <td style={td}>{row.qty}</td>
                <td style={td}>{azn(row.unit_price)}</td>
                <td style={td}>{row.discount_pct}</td>
                <td style={td}>{row.vat_rate}</td>
                <td style={{ ...td, fontWeight: 600 }}>{azn(row.line_total)}</td>
              </tr>
            ))}
            {!draft.rows.length && <tr><td style={td} colSpan={7}>Sətir yoxdur.</td></tr>}
          </tbody>
        </table>

        <div style={{ textAlign: "right", marginTop: 10, fontSize: 13, lineHeight: 1.8 }}>
          <div>Ara cəm: <b>{azn(draft.subtotal)}</b></div>
          <div>ƏDV: <b>{azn(draft.vat_total)}</b></div>
          <div style={{ fontSize: 16 }}>Yekun: <b style={{ color: "#064e3b" }}>{azn(draft.total)}</b></div>
        </div>

        {draft.notes && <div style={{ ...msgBox, marginTop: 12 }}>{draft.notes}</div>}
        {blocked && (
          <div style={{ ...msgBox, marginTop: 8, color: "#b23a3a" }}>
            {draft.warnings.join(" ")}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button style={secondaryBtn} onClick={onClose}>İmtina</button>
          <button style={primaryBtn} disabled={busy || blocked} onClick={onConfirm}>
            {busy ? "Yaradılır…" : "Təsdiqlə və faktura kəs"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={statLabel}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

