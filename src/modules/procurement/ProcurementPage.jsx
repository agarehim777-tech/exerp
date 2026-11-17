import LandedCostPanel from "./LandedCostPanel.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BarChart3, Building2, PackageCheck, Receipt, RefreshCw, Search, ShoppingCart, Ship, Truck, WalletCards, X } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { useTenantRequestScope } from "../../shared/hooks/useTenantRequestScope.js";
import { useRealtimeResync } from "../../shared/hooks/useRealtimeResync.js";
import "./procurement.css";
import { INVOICE_STATUS, IconButton, PO_STATUS, emptyInvoice, emptyPo, emptyPoLine, emptyReceipt, emptyVendor, getError, groupBy, matchesQuery, money, nextNumber, toNumber, today } from "./procurementShared.jsx";
import {
  buildAcceptedByLine,
  buildInvoicedByLine,
  buildPoMetrics,
  buildInvoiceTotals,
  buildPaymentByPo,
  filterVendors,
  filterPurchaseOrders,
  filterInvoices,
  buildProcurementStats,
} from "./procurementSelectors.ts";
import { useProcurementRegistry } from "./useProcurementRegistry.ts";
import { useVendorActions } from "./useVendorActions.ts";
import { useRfqActions } from "./useRfqActions.ts";
import { usePoActions } from "./usePoActions.ts";
import { usePoPaymentActions } from "./usePoPaymentActions.ts";
import { DashboardTab, InvoicesTab, Metric, PurchaseOrdersTab, ReceiptsTab, RfqTab, VendorsTab } from "./ProcurementTabs.jsx";

export default function ProcurementPage() {
  const { profile, user, activeTenantId } = useAuth();
  const tenantId = activeTenantId || profile?.active_tenant_id;
  return <ProcurementWorkspace key={tenantId || 'no-tenant'} tenantId={tenantId} user={user} />;
}

function ProcurementWorkspace({ tenantId, user }) {
  const { begin } = useTenantRequestScope(tenantId);
  const invoiceAttempt = useRef(null);

  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [poStatus, setPoStatusFilter] = useState("all");
  const [invoiceStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const {
    loading, registryLoaded, vendors, products, purchaseOrders, poLines, goodsReceipts, receiptLines,
    invoices, invoiceLines, poPayments, poPaymentsAvailable, load,
  } = useProcurementRegistry({ tenantId, begin, setError });
  const [matchRows, setMatchRows] = useState({});
  const [expandedPo, setExpandedPo] = useState(null);
  const [expandedReceipt, setExpandedReceipt] = useState(null);
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const { paymentPoId, paymentForm, setPaymentForm, editingPaymentId, openPaymentForm, editPayment, savePoPayment, deletePayment } = usePoPaymentActions({
    tenantId, user, poPaymentsAvailable, setExpandedPo, load, setError, setNotice, setSaving,
  });
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [invoiceAccountId, setInvoiceAccountId] = useState("");
  const [taxAccounts, setTaxAccounts] = useState([]);
  const [invoiceTaxAccountId, setInvoiceTaxAccountId] = useState('');
  const [recoverableTax, setRecoverableTax] = useState(false);

  const [poForm, setPoForm] = useState({ ...emptyPo, po_number: nextNumber("PO") });
  const [poDraftLines, setPoDraftLines] = useState([{ ...emptyPoLine }]);
  const [editingPoId, setEditingPoId] = useState(null);
  const [receiptForm, setReceiptForm] = useState({ ...emptyReceipt, grn_number: nextNumber("GRN") });
  const [receiptDraftLines, setReceiptDraftLines] = useState([]);
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({ ...emptyInvoice, invoice_number: nextNumber("INV") });
  const [invoiceDraftLines, setInvoiceDraftLines] = useState([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);

  useEffect(() => {
    setPayingInvoice(null); setPaymentAccounts([]); setInvoiceAccountId("");
    setTaxAccounts([]); setInvoiceTaxAccountId(''); setRecoverableTax(false);
    invoiceAttempt.current = null;
    load();
  }, [load]);

  const { rfqs, rfqForm, setRfqForm, saveRfq, updateRfq, convertRfqToPo } = useRfqActions({
    tenantId, begin, setError, setNotice, setSaving, setPoForm, setPoDraftLines, setTab,
  });

  useRealtimeResync(tenantId, ['vendors', 'purchase_orders', 'goods_receipts', 'vendor_invoices',
    ...(poPaymentsAvailable ? ['po_payments'] : [])], load, { channelPrefix: 'procurement' });

  const linesByPo = useMemo(() => groupBy(poLines, "po_id"), [poLines]);
  const receiptLinesByReceipt = useMemo(() => groupBy(receiptLines, "grn_id"), [receiptLines]);
  const invoiceLinesByInvoice = useMemo(() => groupBy(invoiceLines, "invoice_id"), [invoiceLines]);

  const acceptedByLine = useMemo(() => buildAcceptedByLine(receiptLines), [receiptLines]);

  const invoicedByLine = useMemo(() => buildInvoicedByLine(invoiceLines), [invoiceLines]);

  const poMetrics = useMemo(() => buildPoMetrics(purchaseOrders, linesByPo, acceptedByLine, invoicedByLine), [purchaseOrders, linesByPo, acceptedByLine, invoicedByLine]);

  const invoiceTotals = useMemo(() => buildInvoiceTotals(invoices, invoiceLinesByInvoice), [invoices, invoiceLinesByInvoice]);

  const paymentByPo = useMemo(() => buildPaymentByPo(invoices, invoiceTotals, poPayments), [invoices, invoiceTotals, poPayments]);

  const filteredVendors = useMemo(() => filterVendors(vendors, query), [vendors, query]);

  const filteredPurchaseOrders = useMemo(() => filterPurchaseOrders(purchaseOrders, poStatus, query, vendors), [purchaseOrders, poStatus, query, vendors]);

  const filteredInvoices = useMemo(() => filterInvoices(invoices, invoiceStatus, query), [invoices, invoiceStatus, query]);

  const activePoOptions = useMemo(() => purchaseOrders.filter((po) => ["approved", "partial"].includes(po.status)), [purchaseOrders]);
  const invoicePoOptions = useMemo(() => purchaseOrders.filter((po) => ["approved", "partial", "received"].includes(po.status)), [purchaseOrders]);

  const stats = useMemo(() => buildProcurementStats(purchaseOrders, invoices, poMetrics), [purchaseOrders, invoices, poMetrics]);

  const { resetPoForm, setProductOnLine, savePo, editPo, updatePoStatus, recomputePoStatus, deletePo } = usePoActions({
    tenantId, user, products, goodsReceipts, invoices, receiptLines, linesByPo,
    poForm, poDraftLines, editingPoId, setPoForm, setPoDraftLines, setEditingPoId,
    load, setError, setNotice, setSaving, setTab,
  });

  function resetReceiptForm() {
    setEditingReceiptId(null);
    setReceiptForm({ ...emptyReceipt, grn_number: nextNumber("GRN") });
    setReceiptDraftLines([]);
  }

  function resetInvoiceForm() {
    setEditingInvoiceId(null);
    setInvoiceForm({ ...emptyInvoice, invoice_number: nextNumber("INV") });
    setInvoiceDraftLines([]);
  }

  function buildReceiptLines(poId, receiptId = null) {
    const sourceLines = linesByPo.get(poId) || [];
    const existing = receiptId ? receiptLinesByReceipt.get(receiptId) || [] : [];
    return sourceLines.map((line) => {
      const existingLine = existing.find((item) => item.po_line_id === line.id);
      const accepted = acceptedByLine.get(line.id) || 0;
      const editAccepted = existingLine ? Math.max(0, toNumber(existingLine.qty_received) - toNumber(existingLine.qty_rejected)) : 0;
      const outstanding = Math.max(0, toNumber(line.qty_ordered) - accepted + editAccepted);
      return {
        po_line_id: line.id,
        label: `${line.product_sku}${line.description ? ` · ${line.description}` : ""}`,
        ordered: line.qty_ordered,
        outstanding,
        qty_received: existingLine ? String(existingLine.qty_received) : String(outstanding || ""),
        qty_rejected: existingLine ? String(existingLine.qty_rejected || 0) : "0",
        unit_volume_m3: existingLine ? String(existingLine.unit_volume_m3 || 0) : "",
      };
    });
  }

  function buildInvoiceLines(poId, invoiceId = null) {
    const sourceLines = linesByPo.get(poId) || [];
    const existing = invoiceId ? invoiceLinesByInvoice.get(invoiceId) || [] : [];
    return sourceLines.map((line) => {
      const existingLine = existing.find((item) => item.po_line_id === line.id);
      const accepted = acceptedByLine.get(line.id) || 0;
      const ordered = toNumber(line.qty_ordered);
      return {
        po_line_id: line.id,
        label: `${line.product_sku}${line.description ? ` · ${line.description}` : ""}`,
        ordered,
        accepted,
        qty_invoiced: existingLine ? String(existingLine.qty_invoiced) : String(accepted || ordered || ""),
        unit_price: existingLine ? String(existingLine.unit_price) : String(line.unit_price || 0),
        tax_rate: existingLine ? String(existingLine.tax_rate || line.tax_rate || 0) : String(line.tax_rate || 0),
      };
    });
  }

  const {
    vendorForm, setVendorForm, editingVendorId, setEditingVendorId, saveVendor, editVendor, toggleVendor, deleteVendor,
  } = useVendorActions({ tenantId, purchaseOrders, load, setError, setNotice, setSaving, setTab });

  function choosePoForReceipt(poId) {
    const po = purchaseOrders.find((item) => item.id === poId);
    if (!po) return;
    setEditingReceiptId(null);
    setReceiptForm({ ...emptyReceipt, po_id: poId, grn_number: nextNumber("GRN") });
    setReceiptDraftLines(buildReceiptLines(poId));
    setTab("grn");
  }

  function editReceipt(receipt) {
    setEditingReceiptId(receipt.id);
    setReceiptForm({
      po_id: receipt.po_id,
      grn_number: receipt.grn_number || "",
      receipt_date: receipt.receipt_date || today(),
      notes: receipt.notes || "",
    });
    setReceiptDraftLines(buildReceiptLines(receipt.po_id, receipt.id));
    setTab("grn");
  }

  async function saveReceipt(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!receiptForm.po_id || !receiptForm.grn_number.trim()) {
      setError("PO və GRN nömrəsi tələb olunur.");
      return;
    }
    const invalidLine = receiptDraftLines.find((line) => {
      const received = toNumber(line.qty_received);
      const rejected = toNumber(line.qty_rejected);
      return received < 0 || rejected < 0 || rejected > received || received > toNumber(line.outstanding) + 0.000001 || (received > rejected && toNumber(line.unit_volume_m3) <= 0);
    });
    if (invalidLine) {
      setError(`${invalidLine.label}: miqdarları yoxlayın və mədaxil edilən məhsul üçün vahid həcmi daxil edin.`);
      return;
    }
    const items = receiptDraftLines
      .filter((line) => toNumber(line.qty_received) > 0)
      .map((line) => ({
        po_line_id: line.po_line_id,
        qty_received: toNumber(line.qty_received),
        qty_rejected: toNumber(line.qty_rejected),
        unit_volume_m3: toNumber(line.unit_volume_m3),
      }));
    if (!items.length) {
      setError("Ən azı bir mədaxil sətri tələb olunur.");
      return;
    }
    setSaving(true);
    let receiptId = editingReceiptId;
    if (editingReceiptId) {
      const { error: receiptError } = await supabase
        .from("goods_receipts")
        .update({
          po_id: receiptForm.po_id,
          grn_number: receiptForm.grn_number.trim(),
          receipt_date: receiptForm.receipt_date || today(),
          notes: receiptForm.notes.trim() || null,
        })
        .eq("id", editingReceiptId);
      if (receiptError) {
        setError(getError(receiptError));
        setSaving(false);
        return;
      }
      const { error: deleteError } = await supabase.from("goods_receipt_lines").delete().eq("grn_id", editingReceiptId);
      if (deleteError) {
        setError(getError(deleteError));
        setSaving(false);
        return;
      }
    } else {
      const { data: receipt, error: receiptError } = await supabase
        .from("goods_receipts")
        .insert({
          tenant_id: tenantId,
          po_id: receiptForm.po_id,
          grn_number: receiptForm.grn_number.trim(),
          receipt_date: receiptForm.receipt_date || today(),
          notes: receiptForm.notes.trim() || null,
          received_by: user?.id || null,
        })
        .select()
        .single();
      if (receiptError) {
        setError(getError(receiptError));
        setSaving(false);
        return;
      }
      receiptId = receipt.id;
    }

    const { error: lineError } = await supabase.from("goods_receipt_lines").insert(items.map((line) => ({ ...line, grn_id: receiptId })));
    if (lineError) {
      setError(getError(lineError));
      setSaving(false);
      return;
    }

    const nextReceiptLines = [...receiptLines.filter((line) => line.grn_id !== receiptId), ...items.map((line) => ({ ...line, grn_id: receiptId }))];
    await recomputePoStatus(receiptForm.po_id, nextReceiptLines);
    setNotice(editingReceiptId ? "GRN yeniləndi və PO statusu hesablandı." : "Mədaxil qeyd edildi və PO statusu hesablandı.");
    resetReceiptForm();
    await load();
    setSaving(false);
  }

  async function deleteReceipt(receipt) {
    if (!(await appConfirm(`${receipt.grn_number} GRN qeydini silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: receiptError } = await supabase.from("goods_receipts").delete().eq("id", receipt.id);
    if (receiptError) setError(getError(receiptError));
    else {
      await recomputePoStatus(receipt.po_id, receiptLines.filter((line) => line.grn_id !== receipt.id));
      setNotice("GRN silindi və PO statusu yeniləndi.");
      await load();
    }
    setSaving(false);
  }

  function choosePoForInvoice(poId) {
    setEditingInvoiceId(null);
    const po = purchaseOrders.find((item) => item.id === poId);
    setInvoiceForm({
      ...emptyInvoice,
      po_id: poId,
      invoice_number: nextNumber("INV"),
      currency: po?.currency || "AZN",
    });
    setInvoiceDraftLines(buildInvoiceLines(poId));
    setTab("invoices");
  }

  function editInvoice(invoice) {
    setEditingInvoiceId(invoice.id);
    setInvoiceForm({
      po_id: invoice.po_id || "",
      invoice_number: invoice.invoice_number || "",
      invoice_date: invoice.invoice_date || today(),
      due_date: invoice.due_date || "",
      currency: invoice.currency || "AZN",
      match_notes: invoice.match_notes || "",
    });
    setInvoiceDraftLines(invoice.po_id ? buildInvoiceLines(invoice.po_id, invoice.id) : []);
    setTab("invoices");
  }

  async function saveInvoice(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!invoiceForm.po_id || !invoiceForm.invoice_number.trim()) {
      setError("PO və faktura nömrəsi tələb olunur.");
      return;
    }
    const po = purchaseOrders.find((item) => item.id === invoiceForm.po_id);
    if (!po) {
      setError("PO tapılmadı.");
      return;
    }
    const items = invoiceDraftLines
      .filter((line) => toNumber(line.qty_invoiced) > 0 && toNumber(line.unit_price) >= 0)
      .map((line) => ({
        po_line_id: line.po_line_id,
        qty_invoiced: toNumber(line.qty_invoiced),
        unit_price: toNumber(line.unit_price),
        tax_rate: toNumber(line.tax_rate),
      }));
    if (!items.length) {
      setError("Faktura üçün ən azı bir sətir tələb olunur.");
      return;
    }
    setSaving(true);
    let invoiceId = editingInvoiceId;
    const payload = {
      vendor_id: po.vendor_id,
      po_id: po.id,
      invoice_number: invoiceForm.invoice_number.trim(),
      invoice_date: invoiceForm.invoice_date || today(),
      due_date: invoiceForm.due_date || null,
      currency: invoiceForm.currency || po.currency || "AZN",
      match_notes: invoiceForm.match_notes.trim() || null,
      created_by: user?.id || null,
    };

    if (editingInvoiceId) {
      const { error: invoiceError } = await supabase.from("vendor_invoices").update(payload).eq("id", editingInvoiceId);
      if (invoiceError) {
        setError(getError(invoiceError));
        setSaving(false);
        return;
      }
      const { error: deleteError } = await supabase.from("vendor_invoice_lines").delete().eq("invoice_id", editingInvoiceId);
      if (deleteError) {
        setError(getError(deleteError));
        setSaving(false);
        return;
      }
    } else {
      const { data: invoice, error: invoiceError } = await supabase
        .from("vendor_invoices")
        .insert({ ...payload, tenant_id: tenantId, status: "draft" })
        .select()
        .single();
      if (invoiceError) {
        setError(getError(invoiceError));
        setSaving(false);
        return;
      }
      invoiceId = invoice.id;
    }

    const { error: lineError } = await supabase.from("vendor_invoice_lines").insert(items.map((line) => ({ ...line, invoice_id: invoiceId })));
    if (lineError) {
      setError(getError(lineError));
      setSaving(false);
      return;
    }
    if (!await runMatch(invoiceId, false)) {
      setEditingInvoiceId(invoiceId);
      setSaving(false);
      return;
    }
    setNotice(editingInvoiceId ? "Faktura yeniləndi və 3-way match hesablandı." : "Faktura yaradıldı və 3-way match hesablandı.");
    resetInvoiceForm();
    setSaving(false);
  }

  async function runMatch(invoiceId, withNotice = true) {
    const [{ data: rows, error: evalError }, { error: applyError }] = await Promise.all([
      supabase.rpc("evaluate_invoice_match", { _invoice_id: invoiceId }),
      supabase.rpc("apply_invoice_match", { _invoice_id: invoiceId }),
    ]);
    if (evalError || applyError) {
      setError(getError(evalError || applyError));
      return false;
    }
    setMatchRows((current) => ({ ...current, [invoiceId]: rows || [] }));
    if (withNotice) setNotice("3-way match yeniləndi.");
    await load();
    return true;
  }

  async function updateInvoiceStatus(invoiceId, status) {
    if (status === "paid") throw new Error("Invoice payment requires the server command");
    setSaving(true);
    const { error: invoiceError } = await supabase.from("vendor_invoices").update({ status }).eq("id", invoiceId);
    if (invoiceError) setError(getError(invoiceError));
    else {
      setNotice(`Faktura statusu dəyişdi: ${INVOICE_STATUS[status]?.label || status}.`);
      await load();
    }
    setSaving(false);
  }

  async function openInvoicePayment(invoice) {
    const isCurrent = begin('invoice-payment-dialog');
    const hasTax = (invoiceLinesByInvoice.get(invoice.id) || []).some(line => toNumber(line.tax_rate) > 0);
    // Seeds the standard "1400 Əvəzləşdirilən ƏDV" account if missing (idempotent).
    if (hasTax) await supabase.rpc('ensure_inventory_accounts', { _tenant: tenantId }).then(() => null, () => null);
    const [accounts, tax] = await Promise.all([
      supabase.from("cash_accounts").select("id,name,currency,gl_account_id")
        .eq("tenant_id", tenantId).eq("is_active", true).eq("currency", invoice.currency),
      hasTax ? supabase.from('chart_of_accounts').select('id,code,name').eq('tenant_id', tenantId)
        .eq('type', 'asset').eq('is_active', true).eq('currency', invoice.currency).order('code') : Promise.resolve({ data: [], error: null }),
    ]);
    if (!isCurrent()) return;
    if (accounts.error || tax.error) { setError(getError(accounts.error || tax.error)); return; }
    setPaymentAccounts(accounts.data || []);
    setInvoiceAccountId(accounts.data?.[0]?.id || "");
    setTaxAccounts((tax.data || []).filter(row => !['1000', '1010', '1200', '2050'].includes(row.code)
      && !accounts.data?.some(account => account.gl_account_id === row.id)));
    const taxCandidates = (tax.data || []).filter(row => !['1000', '1010', '1200', '2050'].includes(row.code)
      && !accounts.data?.some(account => account.gl_account_id === row.id));
    setInvoiceTaxAccountId(taxCandidates.find(row => row.code === '1400')?.id || ''); setRecoverableTax(false);
    setPayingInvoice({ ...invoice, hasTax });
  }

  async function payInvoice(event) {
    event.preventDefault();
    if (saving || !invoiceAccountId || (payingInvoice.hasTax && (!invoiceTaxAccountId || !recoverableTax))) return;
    setSaving(true); setError("");
    const isCurrent = begin('invoice-payment');
    try {
        if (invoiceAttempt.current?.invoice_id !== payingInvoice.id || invoiceAttempt.current?.account_id !== invoiceAccountId
          || invoiceAttempt.current?.tax_account_id !== (payingInvoice.hasTax ? invoiceTaxAccountId : undefined)) {
          invoiceAttempt.current = { invoice_id: payingInvoice.id, account_id: invoiceAccountId, payment_date: today(),
            ...(payingInvoice.hasTax ? { tax_account_id: invoiceTaxAccountId, tax_treatment: 'recoverable' } : {}) };
        }
      const { error: paymentError } = await supabase.rpc(payingInvoice.hasTax ? 'pay_vendor_invoice_with_tax_atomic' : "pay_vendor_invoice_atomic", {
        _tenant_id: tenantId, _request_key: `invoice-payment:${payingInvoice.id}`,
        _payload: invoiceAttempt.current,
      });
      if (paymentError) throw paymentError;
        if (!isCurrent()) return;
        invoiceAttempt.current = null;
      setNotice("Faktura ödənişi kassaya və mühasibat jurnalına yazıldı.");
      setPayingInvoice(null); await load();
      } catch (paymentError) { if (isCurrent()) setError(getError(paymentError)); }
    finally { if (isCurrent()) setSaving(false); }
  }

  async function deleteInvoice(invoice) {
    if (invoice.status === "paid") {
      setError("Ödənilmiş fakturanı silmək olmaz. Lazımdırsa əvvəl ödəniş düzəlişi aparılmalıdır.");
      return;
    }
    if (!(await appConfirm(`${invoice.invoice_number} fakturasını silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: invoiceError } = await supabase.from("vendor_invoices").delete().eq("id", invoice.id);
    if (invoiceError) setError(getError(invoiceError));
    else {
      setNotice("Faktura silindi.");
      await load();
    }
    setSaving(false);
  }

  if (!tenantId) {
    return (
      <main className="procurement-page procurement-page-styles-page">
        <section className="procurement-page-styles-empty-panel">
          <AlertTriangle size={28} />
          <h1>Aktiv şirkət seçilməyib</h1>
          <p>Satınalma modulundan istifadə etmək üçün əvvəl tenant/şirkət seçin.</p>
          <Link to="/" className="procurement-page-styles-link-button">
            <ArrowLeft size={16} />
            Panelə qayıt
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="procurement-page procurement-page-styles-page" aria-busy={loading || saving}>
      <header className="procurement-page-styles-header">
        <div>
          <h1 className="procurement-page-styles-title">Satınalma</h1>
          <p className="procurement-page-styles-subtitle">Vendor, zavod sifarişi, mədaxil və məhsulun maya dəyəri axını.</p>
        </div>
        <div className="procurement-page-styles-header-actions">
          <IconButton icon={RefreshCw} label={loading ? "Yüklənir" : "Yenilə"} onClick={load} disabled={loading || saving} />
        </div>
      </header>

      <section className="procurement-metrics procurement-page-styles-metric-grid">
        <Metric icon={Building2} label="Aktiv vendor" value={vendors.filter((vendor) => vendor.is_active).length} hint={`${vendors.length} vendor`} tone="blue" />
        <Metric icon={ShoppingCart} label="Açıq PO" value={stats.openPo.length} hint={`${purchaseOrders.length} ümumi PO`} tone="amber" />
        <Metric icon={Truck} label="Mədaxil gözləyir" value={stats.waitingReceipt.length} hint="Təsdiqli və qismən PO" tone="green" />
        <Metric icon={WalletCards} label="PO dəyəri" value={money(stats.approvedSpend)} hint={`${purchaseOrders.length} ümumi PO`} tone="rose" />
      </section>

      <section className="procurement-page-styles-toolbar">
        <div className="procurement-page-styles-search-box">
          <Search size={17} />
          <input className="procurement-page-styles-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Vendor, PO, GRN və ya SKU axtar..." />
        </div>
        {tab === "po" && (
          <select value={poStatus} onChange={(event) => setPoStatusFilter(event.target.value)} className="procurement-page-styles-select">
            <option value="all">Bütün PO statusları</option>
            {Object.entries(PO_STATUS).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        )}
      </section>

      {(notice || error) && (
        <div className={`procurement-page-styles-message ${error ? "procurement-page-styles-message-error" : "procurement-page-styles-message-ok"}`}>
          {error || notice}
          <button type="button" onClick={() => { setError(""); setNotice(""); }} className="procurement-page-styles-message-close">
            <X size={14} />
          </button>
        </div>
      )}

      {!poPaymentsAvailable && !loading && (
        <div role="status" className="procurement-page-styles-message procurement-page-styles-message-error">
          Birbaşa PO ödənişi bağlıdır. Ödəniş üçün uyğun vendor fakturası tələb olunur.
        </div>
      )}

      <nav className="procurement-page-styles-tabs">
        {[
          ["dashboard", BarChart3, "İcmal"],
          ["vendors", Building2, "Vendorlar"],
          ["po", ShoppingCart, "PO"],
          ["grn", PackageCheck, "Mədaxil"],
          ["landed", Ship, "Göndəriş və maya"],
          ["invoices", Receipt, "Fakturalar"],
        ].map(([id, Icon, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`procurement-page-styles-tab-button ${tab === id ? "procurement-page-styles-tab-active" : ""}`}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {loading && !registryLoaded ? (
        <section className="procurement-page-styles-empty-panel">
          <RefreshCw size={26} />
          <h2>Məlumatlar yüklənir</h2>
          <p>Satınalma reyestri serverdən oxunur.</p>
        </section>
      ) : (
        <>
          {tab === "dashboard" && (
            <DashboardTab
              purchaseOrders={purchaseOrders}
              poMetrics={poMetrics}
              onCreatePo={() => { resetPoForm(); setTab("po"); }}
              onReceive={choosePoForReceipt}
 />
          )}
          {tab === "landed" && <LandedCostPanel tenantId={tenantId} />}
          {tab === "rfq" && (
            <RfqTab
              rfqs={rfqs}
              vendors={vendors.filter((vendor) => vendor.is_active)}
              form={rfqForm}
              setForm={setRfqForm}
              onSubmit={saveRfq}
              onApprove={(rfq) => updateRfq(rfq, { status: "approved" })}
              onReject={(rfq) => updateRfq(rfq, { status: "rejected" })}
              onConvert={convertRfqToPo}
              saving={saving}
 />
          )}
          {tab === "vendors" && (
            <VendorsTab
              vendors={filteredVendors}
              form={vendorForm}
              setForm={setVendorForm}
              editingId={editingVendorId}
              onSubmit={saveVendor}
              onCancel={() => { setEditingVendorId(null); setVendorForm(emptyVendor); }}
              onEdit={editVendor}
              onToggle={toggleVendor}
              onDelete={deleteVendor}
              purchaseOrders={purchaseOrders}
              saving={saving}
 />
          )}
          {tab === "po" && (
            <PurchaseOrdersTab
              vendors={vendors}
              products={products}
              purchaseOrders={filteredPurchaseOrders}
              allPurchaseOrders={purchaseOrders}
              linesByPo={linesByPo}
              poMetrics={poMetrics}
              paymentByPo={paymentByPo}
              poPayments={poPayments}
              poPaymentsAvailable={poPaymentsAvailable}
              acceptedByLine={acceptedByLine}
              invoicedByLine={invoicedByLine}
              expandedPo={expandedPo}
              setExpandedPo={setExpandedPo}
              form={poForm}
              setForm={setPoForm}
              draftLines={poDraftLines}
              setDraftLines={setPoDraftLines}
              setProductOnLine={setProductOnLine}
              editingPoId={editingPoId}
              paymentPoId={paymentPoId}
              paymentForm={paymentForm}
              setPaymentForm={setPaymentForm}
              editingPaymentId={editingPaymentId}
              onPaymentOpen={openPaymentForm}
              onPaymentEdit={editPayment}
              onPaymentSubmit={savePoPayment}
              onPaymentDelete={deletePayment}
              onSubmit={savePo}
              onCancel={resetPoForm}
              onEdit={editPo}
              onDelete={deletePo}
              onApprove={(po) => updatePoStatus(po.id, "approved")}
              onCancelPo={(po) => updatePoStatus(po.id, "cancelled")}
              onClose={(po) => updatePoStatus(po.id, "closed")}
              onReceive={choosePoForReceipt}
              onInvoice={choosePoForInvoice}
              saving={saving}
 />
          )}
          {tab === "grn" && (
            <ReceiptsTab
              form={receiptForm}
              setForm={(next) => {
                setReceiptForm(next);
                if (next.po_id !== receiptForm.po_id) setReceiptDraftLines(next.po_id ? buildReceiptLines(next.po_id) : []);
              }}
              draftLines={receiptDraftLines}
              setDraftLines={setReceiptDraftLines}
              editingId={editingReceiptId}
              poOptions={activePoOptions}
              goodsReceipts={goodsReceipts.filter((receipt) => matchesQuery([receipt.grn_number, receipt.purchase_orders?.po_number], query))}
              receiptLinesByReceipt={receiptLinesByReceipt}
              poLines={poLines}
              expandedReceipt={expandedReceipt}
              setExpandedReceipt={setExpandedReceipt}
              onSubmit={saveReceipt}
              onCancel={resetReceiptForm}
              onEdit={editReceipt}
              onDelete={deleteReceipt}
              saving={saving}
 />
          )}
          {tab === "invoices" && (
            <InvoicesTab
              form={invoiceForm}
              setForm={(next) => {
                setInvoiceForm(next);
                if (next.po_id !== invoiceForm.po_id) setInvoiceDraftLines(next.po_id ? buildInvoiceLines(next.po_id, editingInvoiceId) : []);
              }}
              draftLines={invoiceDraftLines}
              setDraftLines={setInvoiceDraftLines}
              editingId={editingInvoiceId}
              poOptions={invoicePoOptions}
              invoices={filteredInvoices}
              invoiceLinesByInvoice={invoiceLinesByInvoice}
              poLines={poLines}
              invoiceTotals={invoiceTotals}
              matchRows={matchRows}
              expandedInvoice={expandedInvoice}
              setExpandedInvoice={setExpandedInvoice}
              onSubmit={saveInvoice}
              onCancel={resetInvoiceForm}
              onEdit={editInvoice}
              onDelete={deleteInvoice}
              onMatch={(invoice) => runMatch(invoice.id)}
              onApprove={(invoice) => updateInvoiceStatus(invoice.id, "approved")}
              onPaid={openInvoicePayment}
              onCancelInvoice={(invoice) => updateInvoiceStatus(invoice.id, "cancelled")}
              saving={saving}
 />
          )}
        </>
      )}
      {payingInvoice && <section role="dialog" aria-modal="true" aria-label="Vendor fakturasının ödənişi" className="modal-backdrop">
        <form className="modal-card" onSubmit={payInvoice}>
          <h2>{payingInvoice.invoice_number}</h2>
          <strong>{money(invoiceTotals.get(payingInvoice.id), payingInvoice.currency)}</strong>
          {payingInvoice.hasTax && <small>Məbləğ ƏDV daxil olmaqla göstərilir və kassadan bu məbləğ çıxılacaq.</small>}
          {payingInvoice.currency !== 'AZN' && <p role="alert">Xarici valyutada ({payingInvoice.currency}) olan fakturaların ödənişi hələ dəstəklənmir. Fakturanı AZN ilə qeyd edin və ya mühasibat jurnalında əl ilə yazılış edin.</p>}
          {payingInvoice.currency === 'AZN' && !paymentAccounts.length && <p role="alert">AZN valyutasında aktiv kassa/bank hesabı yoxdur. Əvvəlcə Kassa bölməsində hesab yaradın.</p>}
          {payingInvoice.hasTax && !taxAccounts.length && <p role="alert">Uyğun ƏDV aktiv hesabı tapılmadı. Hesablar planında "1400 · Əvəzləşdirilən ƏDV" hesabını yaradın.</p>}
          <label>Ödəniş hesabı<select aria-label="Ödəniş hesabı" value={invoiceAccountId} disabled={saving}
            onChange={event => setInvoiceAccountId(event.target.value)} required>
            <option value="">Hesab seçin</option>
            {paymentAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
          </select></label>
          {payingInvoice.hasTax && <>
            <label>ƏDV uçot hesabı<select aria-label="ƏDV uçot hesabı" value={invoiceTaxAccountId} disabled={saving}
              onChange={event => setInvoiceTaxAccountId(event.target.value)} required>
              <option value="">Hesab seçin</option>
              {taxAccounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
            </select></label>
            <label><input type="checkbox" checked={recoverableTax} disabled={saving}
              onChange={event => setRecoverableTax(event.target.checked)} /> Əvəzləşdirilən ƏDV kimi təsdiqləyirəm</label>
          </>}
          <div className="modal-actions">
            <button type="button" className="secondary-btn" disabled={saving} onClick={() => setPayingInvoice(null)}>Ləğv et</button>
            <button type="submit" className="primary-btn" disabled={saving || payingInvoice.currency !== 'AZN' || !invoiceAccountId || (payingInvoice.hasTax && (!invoiceTaxAccountId || !recoverableTax))}>{saving ? "Qeydə alınır..." : "Ödənişi təsdiq et"}</button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      </section>}
    </main>
  );
}
