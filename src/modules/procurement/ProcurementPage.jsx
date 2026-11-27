import LandedCostPanel from "./LandedCostPanel.jsx";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BarChart3, Building2, PackageCheck, Receipt, RefreshCw, Search, ShoppingCart, Ship, Truck, WalletCards, X } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useTenantRequestScope } from "../../shared/hooks/useTenantRequestScope.js";
import { useRealtimeResync } from "../../shared/hooks/useRealtimeResync.js";
import "./procurement.css";
import { IconButton, PO_STATUS, emptyPo, emptyPoLine, emptyVendor, groupBy, matchesQuery, money, nextNumber } from "./procurementShared.jsx";
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
import { useReceiptActions } from "./useReceiptActions.ts";
import { useInvoiceActions } from "./useInvoiceActions.ts";
import { useInvoicePayment } from "./useInvoicePayment.ts";
import { DashboardTab, InvoicesTab, Metric, PurchaseOrdersTab, ReceiptsTab, RfqTab, VendorsTab } from "./ProcurementTabs.jsx";

export default function ProcurementPage() {
  const { profile, user, activeTenantId } = useAuth();
  const tenantId = activeTenantId || profile?.active_tenant_id;
  return <ProcurementWorkspace key={tenantId || 'no-tenant'} tenantId={tenantId} user={user} />;
}

function ProcurementWorkspace({ tenantId, user }) {
  const { begin } = useTenantRequestScope(tenantId);

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
  const [expandedPo, setExpandedPo] = useState(null);
  const [expandedReceipt, setExpandedReceipt] = useState(null);
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const { paymentPoId, paymentForm, setPaymentForm, editingPaymentId, openPaymentForm, editPayment, savePoPayment, deletePayment } = usePoPaymentActions({
    tenantId, user, poPaymentsAvailable, setExpandedPo, load, setError, setNotice, setSaving,
  });
  const invoiceLinesByInvoice = useMemo(() => groupBy(invoiceLines, "invoice_id"), [invoiceLines]);
  const {
    payingInvoice, setPayingInvoice, paymentAccounts, invoiceAccountId, setInvoiceAccountId, taxAccounts,
    invoiceTaxAccountId, setInvoiceTaxAccountId, recoverableTax, setRecoverableTax,
    resetInvoicePayment, openInvoicePayment, payInvoice,
  } = useInvoicePayment({ tenantId, begin, saving, invoiceLinesByInvoice, load, setError, setNotice, setSaving });

  const [poForm, setPoForm] = useState({ ...emptyPo, po_number: nextNumber("PO") });
  const [poDraftLines, setPoDraftLines] = useState([{ ...emptyPoLine }]);
  const [editingPoId, setEditingPoId] = useState(null);

  useEffect(() => {
    resetInvoicePayment();
    load();
  }, [load, resetInvoicePayment]);

  const { rfqs, rfqForm, setRfqForm, saveRfq, updateRfq, convertRfqToPo } = useRfqActions({
    tenantId, begin, setError, setNotice, setSaving, setPoForm, setPoDraftLines, setTab,
  });

  useRealtimeResync(tenantId, ['vendors', 'purchase_orders', 'goods_receipts', 'vendor_invoices',
    ...(poPaymentsAvailable ? ['po_payments'] : [])], load, { channelPrefix: 'procurement' });

  const linesByPo = useMemo(() => groupBy(poLines, "po_id"), [poLines]);
  const receiptLinesByReceipt = useMemo(() => groupBy(receiptLines, "grn_id"), [receiptLines]);

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

  const {
    vendorForm, setVendorForm, editingVendorId, setEditingVendorId, saveVendor, editVendor, toggleVendor, deleteVendor,
  } = useVendorActions({ tenantId, purchaseOrders, load, setError, setNotice, setSaving, setTab });

  const {
    receiptForm, setReceiptForm, receiptDraftLines, setReceiptDraftLines, editingReceiptId,
    resetReceiptForm, buildReceiptLines, choosePoForReceipt, editReceipt, saveReceipt, deleteReceipt,
  } = useReceiptActions({
    tenantId, user, purchaseOrders, receiptLines, linesByPo, receiptLinesByReceipt, acceptedByLine, recomputePoStatus,
    load, setError, setNotice, setSaving, setTab,
  });

  const {
    invoiceForm, setInvoiceForm, invoiceDraftLines, setInvoiceDraftLines, editingInvoiceId, matchRows,
    resetInvoiceForm, buildInvoiceLines, choosePoForInvoice, editInvoice, saveInvoice, runMatch, updateInvoiceStatus, deleteInvoice,
  } = useInvoiceActions({
    tenantId, user, purchaseOrders, linesByPo, invoiceLinesByInvoice, acceptedByLine,
    load, setError, setNotice, setSaving, setTab,
  });

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
      <header className="procurement-page-styles-header procurement-page-styles-header-actions-only">
        <div className="procurement-page-styles-header-actions">
          <IconButton icon={RefreshCw} label={loading ? "Yüklənir" : "Yenilə"} onClick={load} disabled={loading || saving} />
        </div>
      </header>

      <section className="procurement-metrics procurement-page-styles-metric-grid">
        <Metric icon={Building2} label="Aktiv təchizatçı" value={vendors.filter((vendor) => vendor.is_active).length} hint={`${vendors.length} təchizatçı`} tone="blue" />
        <Metric icon={ShoppingCart} label="Açıq PO" value={stats.openPo.length} hint={`${purchaseOrders.length} ümumi PO`} tone="amber" />
        <Metric icon={Truck} label="Mədaxil gözləyir" value={stats.waitingReceipt.length} hint="Təsdiqli və qismən PO" tone="green" />
        <Metric icon={WalletCards} label="PO dəyəri" value={money(stats.approvedSpend)} hint={`${purchaseOrders.length} ümumi PO`} tone="rose" />
      </section>

      <section className="procurement-page-styles-toolbar">
        <div className="procurement-page-styles-search-box">
          <Search size={16} />
          <input className="procurement-page-styles-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Təchizatçı, PO, GRN və ya SKU axtar..." />
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
          Birbaşa PO ödənişi bağlıdır. Ödəniş üçün uyğun təchizatçı fakturası tələb olunur.
        </div>
      )}

      <nav className="procurement-page-styles-tabs">
        {[
          ["dashboard", BarChart3, "İcmal"],
          ["vendors", Building2, "Təchizatçılar"],
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
          <RefreshCw size={24} />
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
      {payingInvoice && <section role="dialog" aria-modal="true" aria-label="Təchizatçı fakturasının ödənişi" className="modal-backdrop">
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
