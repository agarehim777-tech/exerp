// Billing run moved unchanged from SalesInvoicesPage.jsx: unbilled orders and projects, and the editable invoice
// preview that is confirmed into a draft invoice. SalesInvoicesPage passes customers, products, nextInvoiceNo and
// onCreateDraft; change the billing run UI here.
import { useEffect, useMemo, useState } from "react";
import { useBillingSources } from "../../../shared/hooks/useBillingSources.js";
import { buildOrderInvoiceDraft, buildProjectInvoiceDraft, computeDraftTotals, validateDraft } from "../../../lib/invoiceDraft.js";
import ProductSearchSelect from "../../../components/ProductSearchSelect.jsx";
import { azn } from "../../../shared/ui/tokens.js";
import { Button, Input, Select, Table } from "../../../shared/ui/primitives.tsx";

export default function BillingRunPanel({ tenantId, customers, products, nextInvoiceNo, onCreateDraft, invoicesVersion }) {
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
