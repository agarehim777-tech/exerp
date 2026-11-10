import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { readAllRows } from "../../services/readAllRows.js";
import { AlertTriangle, ArrowLeft, BarChart3, Building2, PackageCheck, Receipt, RefreshCw, Search, ShoppingCart, Ship, Truck, WalletCards, X } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { listWorkflowRecords, saveWorkflowRecord } from "../../services/enterpriseWorkflows.js";
import { isMissingPoPaymentsTable, readLegacyPoPayments } from "./procurementSchema.js";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { vendorInvoiceTotal } from "./procurementMath.js";
import { useTenantRequestScope } from "../../shared/hooks/useTenantRequestScope.js";
import { useRealtimeResync } from "../../shared/hooks/useRealtimeResync.js";
import "./procurement.css";
import { ENABLE_LEGACY_PAYMENTS, INVOICE_STATUS, IconButton, PO_STATUS, emptyInvoice, emptyPo, emptyPoLine, emptyPoPayment, emptyReceipt, emptyRfq, emptyVendor, getError, groupBy, lineAmount, matchesQuery, money, nextNumber, toNumber, today } from "./procurementShared.jsx";
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
  const [loading, setLoading] = useState(true);
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poLines, setPoLines] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [receiptLines, setReceiptLines] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [poPayments, setPoPayments] = useState([]);
  const [poPaymentsAvailable, setPoPaymentsAvailable] = useState(ENABLE_LEGACY_PAYMENTS);
  const [matchRows, setMatchRows] = useState({});
  const [rfqs, setRfqs] = useState([]);
  const [rfqForm, setRfqForm] = useState(emptyRfq);
  const [expandedPo, setExpandedPo] = useState(null);
  const [expandedReceipt, setExpandedReceipt] = useState(null);
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [paymentPoId, setPaymentPoId] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPoPayment);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [invoiceAccountId, setInvoiceAccountId] = useState("");
  const [taxAccounts, setTaxAccounts] = useState([]);
  const [invoiceTaxAccountId, setInvoiceTaxAccountId] = useState('');
  const [recoverableTax, setRecoverableTax] = useState(false);

  const [vendorForm, setVendorForm] = useState(emptyVendor);
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [poForm, setPoForm] = useState({ ...emptyPo, po_number: nextNumber("PO") });
  const [poDraftLines, setPoDraftLines] = useState([{ ...emptyPoLine }]);
  const [editingPoId, setEditingPoId] = useState(null);
  const [receiptForm, setReceiptForm] = useState({ ...emptyReceipt, grn_number: nextNumber("GRN") });
  const [receiptDraftLines, setReceiptDraftLines] = useState([]);
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({ ...emptyInvoice, invoice_number: nextNumber("INV") });
  const [invoiceDraftLines, setInvoiceDraftLines] = useState([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);


  const load = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    const isCurrent = begin('registry');
    setLoading(true);
    setError("");
    try {
      const [vendorRes, productRes, poRes, lineRes, grnRes, grnLineRes, invoiceRes, invoiceLineRes, paymentRes] = await Promise.all([
        readAllRows(() => supabase.from("vendors").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id")),
        readAllRows(() => supabase.from("products").select("*").eq("tenant_id", tenantId).order("name", { ascending: true }).order("id")),
        readAllRows(() => supabase.from("purchase_orders").select("*, vendors(name)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id")),
        readAllRows(() => supabase.from("purchase_order_lines").select("*, purchase_orders!inner(tenant_id)").eq("purchase_orders.tenant_id", tenantId).order("line_no", { ascending: true }).order("id")),
        readAllRows(() => supabase.from("goods_receipts").select("*, purchase_orders(po_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id")),
        readAllRows(() => supabase.from("goods_receipt_lines").select("*, goods_receipts!inner(tenant_id), purchase_order_lines(po_id, product_sku, line_no)").eq("goods_receipts.tenant_id", tenantId).order("created_at", { ascending: false }).order("id")),
        readAllRows(() => supabase.from("vendor_invoices").select("*, vendors(name), purchase_orders(po_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id")),
        readAllRows(() => supabase.from("vendor_invoice_lines").select("*, vendor_invoices!inner(tenant_id), purchase_order_lines(po_id, product_sku, line_no)").eq("vendor_invoices.tenant_id", tenantId).order("created_at", { ascending: false }).order("id")),
        readLegacyPoPayments(supabase, tenantId, ENABLE_LEGACY_PAYMENTS),
      ]);
      if (!isCurrent()) return;

      const coreResults = [vendorRes, productRes, poRes, lineRes, grnRes, grnLineRes, invoiceRes, invoiceLineRes];
      const firstError = coreResults.find((result) => result.error)?.error
        || (paymentRes.error && !isMissingPoPaymentsTable(paymentRes.error) ? paymentRes.error : null);
      if (firstError) throw firstError;

      const paymentTableMissing = isMissingPoPaymentsTable(paymentRes.error);
      setPoPaymentsAvailable(ENABLE_LEGACY_PAYMENTS && !paymentTableMissing && !paymentRes.error);

      setVendors(vendorRes.data || []);
      setProducts(productRes.data || []);
      setPurchaseOrders(poRes.data || []);
      setPoLines(lineRes.data || []);
      setGoodsReceipts(grnRes.data || []);
      setReceiptLines(grnLineRes.data || []);
      setInvoices(invoiceRes.data || []);
      setInvoiceLines(invoiceLineRes.data || []);
      setPoPayments(paymentTableMissing ? [] : (paymentRes.data || []));
      setRegistryLoaded(true);
    } catch (loadError) {
      if (isCurrent()) setError(getError(loadError));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [tenantId, begin]);


  useEffect(() => {
    setPayingInvoice(null); setPaymentAccounts([]); setInvoiceAccountId("");
    setTaxAccounts([]); setInvoiceTaxAccountId(''); setRecoverableTax(false);
    invoiceAttempt.current = null;
    load();
  }, [load]);

  const loadRfqs = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin('rfq');
    try {
      const rows = await listWorkflowRecords({ tenantId, module: "procurement", recordType: "rfq" });
      if (isCurrent()) setRfqs(rows);
    } catch (rfqError) {
      if (isCurrent()) setError(getError(rfqError));
    }
  }, [tenantId, begin]);

  useEffect(() => { loadRfqs(); }, [loadRfqs]);

  async function saveRfq(event) {
    event.preventDefault();
    if (!rfqForm.title.trim() || !rfqForm.description.trim() || Number(rfqForm.quantity) <= 0 || !rfqForm.vendor_ids.length) {
      setError("RFQ adı, məhsul, miqdar və ən azı bir vendor tələb olunur.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveWorkflowRecord({
        tenantId,
        module: "procurement",
        record: {
          record_type: "rfq", record_no: nextNumber("RFQ"), status: "sent", title: rfqForm.title.trim(),
          due_at: rfqForm.due_at ? `${rfqForm.due_at}T18:00:00` : null,
          payload: { vendor_ids: rfqForm.vendor_ids, selected_vendor_id: null, bids: [] },
        },
        lines: [{ description: rfqForm.description.trim(), quantity: Number(rfqForm.quantity), unit_price: 0 }],
        approvals: [{ role_code: "procurement_manager" }, { role_code: "finance_manager" }],
      });
      setRfqForm(emptyRfq);
      setNotice("Təklif sorğusu yaradıldı və vendor müqayisəsinə göndərildi.");
      await loadRfqs();
    } catch (rfqError) {
      setError(getError(rfqError));
    } finally {
      setSaving(false);
    }
  }

  async function updateRfq(rfq, changes) {
    setSaving(true);
    try {
      const { workflow_lines: _lines, workflow_approvals: _approvals, ...record } = rfq;
      await saveWorkflowRecord({ tenantId, module: "procurement", record: { ...record, ...changes } });
      await loadRfqs();
      setNotice("RFQ statusu yeniləndi.");
    } catch (rfqError) {
      setError(getError(rfqError));
    } finally {
      setSaving(false);
    }
  }

  function convertRfqToPo(rfq) {
    const vendorId = rfq.payload?.selected_vendor_id || rfq.payload?.vendor_ids?.[0] || "";
    const line = rfq.workflow_lines?.[0];
    setPoForm({ ...emptyPo, vendor_id: vendorId, po_number: nextNumber("PO"), notes: `RFQ: ${rfq.record_no}` });
    setPoDraftLines([{ ...emptyPoLine, description: line?.description || rfq.title, qty_ordered: String(line?.quantity || 1) }]);
    setTab("po");
  }

  useRealtimeResync(tenantId, ['vendors', 'purchase_orders', 'goods_receipts', 'vendor_invoices',
    ...(poPaymentsAvailable ? ['po_payments'] : [])], load, { channelPrefix: 'procurement' });


  const linesByPo = useMemo(() => groupBy(poLines, "po_id"), [poLines]);
  const receiptLinesByReceipt = useMemo(() => groupBy(receiptLines, "grn_id"), [receiptLines]);
  const invoiceLinesByInvoice = useMemo(() => groupBy(invoiceLines, "invoice_id"), [invoiceLines]);

  const acceptedByLine = useMemo(() => {
    const map = new Map();
    receiptLines.forEach((line) => {
      const accepted = Math.max(0, toNumber(line.qty_received) - toNumber(line.qty_rejected));
      map.set(line.po_line_id, (map.get(line.po_line_id) || 0) + accepted);
    });
    return map;
  }, [receiptLines]);

  const invoicedByLine = useMemo(() => {
    const map = new Map();
    invoiceLines.forEach((line) => {
      map.set(line.po_line_id, (map.get(line.po_line_id) || 0) + toNumber(line.qty_invoiced));
    });
    return map;
  }, [invoiceLines]);

  const poMetrics = useMemo(() => {
    const map = new Map();
    purchaseOrders.forEach((po) => {
      const lines = linesByPo.get(po.id) || [];
      const total = lines.reduce((sum, line) => sum + lineAmount(line), 0);
      const ordered = lines.reduce((sum, line) => sum + toNumber(line.qty_ordered), 0);
      const received = lines.reduce((sum, line) => sum + (acceptedByLine.get(line.id) || 0), 0);
      const invoiced = lines.reduce((sum, line) => sum + (invoicedByLine.get(line.id) || 0), 0);
      map.set(po.id, {
        total,
        ordered,
        received,
        invoiced,
        lineCount: lines.length,
        progress: ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0,
      });
    });
    return map;
  }, [purchaseOrders, linesByPo, acceptedByLine, invoicedByLine]);

  const invoiceTotals = useMemo(() => {
    const map = new Map();
    invoices.forEach((invoice) => {
      const lines = invoiceLinesByInvoice.get(invoice.id) || [];
      map.set(invoice.id, vendorInvoiceTotal(lines));
    });
    return map;
  }, [invoices, invoiceLinesByInvoice]);

  const paymentByPo = useMemo(() => {
    const map = new Map();
    invoices.forEach((invoice) => {
      if (!invoice.po_id || invoice.status === "cancelled") return;
      const amount = invoiceTotals.get(invoice.id) || 0;
      const current = map.get(invoice.po_id) || { billed: 0, paid: 0 };
      current.billed += amount;
      if (invoice.status === "paid") current.paid += amount;
      map.set(invoice.po_id, current);
    });
    poPayments.forEach((payment) => {
      const current = map.get(payment.po_id) || { billed: 0, paid: 0 };
      current.paid += toNumber(payment.amount);
      map.set(payment.po_id, current);
    });
    return map;
  }, [invoices, invoiceTotals, poPayments]);



  const filteredVendors = useMemo(
    () => vendors.filter((vendor) => matchesQuery([vendor.name, vendor.tax_id, vendor.email, vendor.phone], query)),
    [vendors, query],
  );

  const filteredPurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter((po) => {
        const statusOk = poStatus === "all" || po.status === poStatus;
        const vendorName = po.vendors?.name || vendors.find((vendor) => vendor.id === po.vendor_id)?.name;
        return statusOk && matchesQuery([po.po_number, vendorName, po.status, po.notes], query);
      }),
    [purchaseOrders, poStatus, query, vendors],
  );

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        const statusOk = invoiceStatus === "all" || invoice.status === invoiceStatus;
        return statusOk && matchesQuery([invoice.invoice_number, invoice.vendors?.name, invoice.purchase_orders?.po_number, invoice.status], query);
      }),
    [invoices, invoiceStatus, query],
  );

  const activePoOptions = useMemo(() => purchaseOrders.filter((po) => ["approved", "partial"].includes(po.status)), [purchaseOrders]);
  const invoicePoOptions = useMemo(() => purchaseOrders.filter((po) => ["approved", "partial", "received"].includes(po.status)), [purchaseOrders]);

  const stats = useMemo(() => {
    const openPo = purchaseOrders.filter((po) => ["draft", "approved", "partial"].includes(po.status));
    const waitingReceipt = purchaseOrders.filter((po) => ["approved", "partial"].includes(po.status));
    const exceptions = invoices.filter((invoice) => invoice.status === "exception");
    const approvedSpend = purchaseOrders
      .filter((po) => po.status !== "cancelled")
      .reduce((sum, po) => sum + (poMetrics.get(po.id)?.total || 0), 0);
    return { openPo, waitingReceipt, exceptions, approvedSpend };
  }, [purchaseOrders, invoices, poMetrics]);

  function resetPoForm() {
    setEditingPoId(null);
    setPoForm({ ...emptyPo, po_number: nextNumber("PO") });
    setPoDraftLines([{ ...emptyPoLine }]);
  }

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

  function setProductOnLine(index, sku) {
    const product = products.find((item) => item.sku === sku);
    setPoDraftLines((lines) =>
      lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              product_id: product?.id || line.product_id || "",
              product_sku: sku,
              description: product?.name || line.description,
              unit_price: product ? String(product.price || 0) : line.unit_price,
            }
          : line,
      ),
    );
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

  async function saveVendor(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!vendorForm.name.trim()) {
      setError("Vendor adı tələb olunur.");
      return;
    }
    setSaving(true);
    const payload = {
      name: vendorForm.name.trim(),
      tax_id: vendorForm.tax_id.trim() || null,
      email: vendorForm.email.trim() || null,
      phone: vendorForm.phone.trim() || null,
      address: vendorForm.address.trim() || null,
      is_active: !!vendorForm.is_active,
    };
    const { error: vendorError } = editingVendorId
      ? await supabase.from("vendors").update(payload).eq("id", editingVendorId)
      : await supabase.from("vendors").insert({ ...payload, tenant_id: tenantId });

    if (vendorError) setError(getError(vendorError));
    else {
      setNotice(editingVendorId ? "Vendor məlumatları yeniləndi." : "Vendor yaradıldı.");
      setVendorForm(emptyVendor);
      setEditingVendorId(null);
      await load();
    }
    setSaving(false);
  }

  function editVendor(vendor) {
    setEditingVendorId(vendor.id);
    setVendorForm({
      name: vendor.name || "",
      tax_id: vendor.tax_id || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      address: vendor.address || "",
      is_active: vendor.is_active,
    });
    setTab("vendors");
  }

  async function toggleVendor(vendor) {
    setSaving(true);
    const { error: vendorError } = await supabase.from("vendors").update({ is_active: !vendor.is_active }).eq("id", vendor.id);
    if (vendorError) setError(getError(vendorError));
    else {
      setNotice(`${vendor.name} ${vendor.is_active ? "passiv edildi" : "aktiv edildi"}.`);
      await load();
    }
    setSaving(false);
  }

  async function deleteVendor(vendor) {
    const linkedPo = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
    if (linkedPo.length) {
      setError("");
      setNotice("Bu vendor üzrə PO tarixi var. Silmək əvəzinə passiv statusa keçirildi.");
      await supabase.from("vendors").update({ is_active: false }).eq("id", vendor.id);
      await load();
      return;
    }
    if (!(await appConfirm(`${vendor.name} vendorunu silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: vendorError } = await supabase.from("vendors").delete().eq("id", vendor.id);
    if (vendorError) setError(getError(vendorError));
    else {
      setNotice("Vendor silindi.");
      await load();
    }
    setSaving(false);
  }

  async function savePo(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!poForm.vendor_id || !poForm.po_number.trim()) {
      setError("Vendor və PO nömrəsi tələb olunur.");
      return;
    }
    const validLines = poDraftLines
      .filter((line) => line.product_sku.trim() && toNumber(line.qty_ordered) > 0 && toNumber(line.unit_price) >= 0)
      .map((line, index) => ({
        line_no: index + 1,
        product_sku: line.product_sku.trim(),
        description: line.description.trim() || null,
        qty_ordered: toNumber(line.qty_ordered),
        unit_price: toNumber(line.unit_price),
        tax_rate: 0,
        product_id: line.product_id || null,
        unit: line.unit || "ədəd",
      }));
    if (!validLines.length) {
      setError("PO üçün ən azı bir məhsul sətri tələb olunur.");
      return;
    }

    setSaving(true);
    const payload = {
      vendor_id: poForm.vendor_id,
      po_number: poForm.po_number.trim(),
      order_date: poForm.order_date || today(),
      expected_date: poForm.expected_date || null,
      currency: poForm.currency || "AZN",
      factory_name: poForm.factory_name?.trim() || null,
      exchange_rate: toNumber(poForm.exchange_rate) || 1,
      payment_terms: poForm.payment_terms?.trim() || null,
      notes: poForm.notes.trim() || null,
      created_by: user?.id || null,
    };

    if (editingPoId) {
      const currentPoLines = linesByPo.get(editingPoId) || [];
      const hasMovements =
        receiptLines.some((line) => currentPoLines.some((poLine) => poLine.id === line.po_line_id)) ||
        invoiceLines.some((line) => currentPoLines.some((poLine) => poLine.id === line.po_line_id));
      const { error: poError } = await supabase.from("purchase_orders").update(payload).eq("id", editingPoId);
      if (poError) {
        setError(getError(poError));
        setSaving(false);
        return;
      }
      if (!hasMovements) {
        const { error: deleteError } = await supabase.from("purchase_order_lines").delete().eq("po_id", editingPoId);
        if (deleteError) {
          setError(getError(deleteError));
          setSaving(false);
          return;
        }
        const { error: lineError } = await supabase.from("purchase_order_lines").insert(validLines.map((line) => ({ ...line, po_id: editingPoId })));
        if (lineError) {
          setError(getError(lineError));
          setSaving(false);
          return;
        }
      }
      setNotice(hasMovements ? "PO başlığı yeniləndi. Mədaxil/faktura olan PO sətirləri qorundu." : "PO yeniləndi.");
    } else {
      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .insert({ ...payload, tenant_id: tenantId, status: "draft" })
        .select()
        .single();
      if (poError) {
        setError(getError(poError));
        setSaving(false);
        return;
      }
      const { error: lineError } = await supabase.from("purchase_order_lines").insert(validLines.map((line) => ({ ...line, po_id: po.id })));
      if (lineError) {
        setError(getError(lineError));
        setSaving(false);
        return;
      }
      setNotice("PO yaradıldı və qaralama statusunda saxlanıldı.");
    }

    resetPoForm();
    await load();
    setSaving(false);
  }

  function editPo(po) {
    const lines = linesByPo.get(po.id) || [];
    setEditingPoId(po.id);
    setPoForm({
      vendor_id: po.vendor_id,
      po_number: po.po_number || "",
      order_date: po.order_date || today(),
      expected_date: po.expected_date || "",
      currency: po.currency || "AZN",
      factory_name: po.factory_name || "",
      exchange_rate: String(po.exchange_rate || 1),
      payment_terms: po.payment_terms || "",
      notes: po.notes || "",
    });
    setPoDraftLines(
      lines.length
        ? lines.map((line) => ({
            product_sku: line.product_sku || "",
            description: line.description || "",
            qty_ordered: String(line.qty_ordered || ""),
            unit_price: String(line.unit_price || ""),
            tax_rate: String(line.tax_rate || 0),
            product_id: line.product_id || "",
            unit: line.unit || "ədəd",
            unit_volume_m3: String(line.unit_volume_m3 || 0),
            unit_net_weight_kg: String(line.unit_net_weight_kg || 0),
            unit_gross_weight_kg: String(line.unit_gross_weight_kg || 0),
            hs_code: line.hs_code || "",
            duty_rate: String(line.duty_rate || 0),
          }))
        : [{ ...emptyPoLine }],
    );
    setTab("po");
  }

  async function updatePoStatus(poId, status) {
    setSaving(true);
    const { error: statusError } = await supabase.from("purchase_orders").update({ status }).eq("id", poId);
    if (statusError) setError(getError(statusError));
    else {
      setNotice(`PO statusu dəyişdi: ${PO_STATUS[status]?.label || status}.`);
      await load();
    }
    setSaving(false);
  }

  async function recomputePoStatus(poId, sourceReceiptLines = receiptLines) {
    const lines = linesByPo.get(poId) || [];
    if (!lines.length) return;
    const map = new Map();
    sourceReceiptLines.forEach((line) => {
      const accepted = Math.max(0, toNumber(line.qty_received) - toNumber(line.qty_rejected));
      map.set(line.po_line_id, (map.get(line.po_line_id) || 0) + accepted);
    });
    const anyReceived = lines.some((line) => (map.get(line.id) || 0) > 0);
    const allReceived = lines.every((line) => (map.get(line.id) || 0) >= toNumber(line.qty_ordered));
    const nextStatus = allReceived ? "received" : anyReceived ? "partial" : "approved";
    await supabase.from("purchase_orders").update({ status: nextStatus }).eq("id", poId);
  }

  async function deletePo(po) {
    const hasReceipts = goodsReceipts.some((receipt) => receipt.po_id === po.id);
    const hasInvoices = invoices.some((invoice) => invoice.po_id === po.id);
    if (hasReceipts || hasInvoices) {
      setError("Bu PO üzrə mədaxil və ya faktura var. Silmək əvəzinə ləğv edin/bağlayın.");
      return;
    }
    if (!(await appConfirm(`${po.po_number} PO-sunu silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: poError } = await supabase.from("purchase_orders").delete().eq("id", po.id);
    if (poError) setError(getError(poError));
    else {
      setNotice("PO silindi.");
      await load();
    }
    setSaving(false);
  }

  function openPaymentForm(po) {
    if (!poPaymentsAvailable) return;
    setPaymentPoId(po.id);
    setEditingPaymentId(null);
    setPaymentForm({ ...emptyPoPayment, po_id: po.id, payment_date: today() });
    setExpandedPo(po.id);
  }

  function editPayment(payment) {
    setPaymentPoId(payment.po_id);
    setEditingPaymentId(payment.id);
    setPaymentForm({
      po_id: payment.po_id,
      amount: String(payment.amount || ""),
      payment_date: payment.payment_date || today(),
      payment_method: payment.payment_method || "bank",
      reference_no: payment.reference_no || "",
      notes: payment.notes || "",
    });
    setExpandedPo(payment.po_id);
  }

  async function savePoPayment(event) {
    event.preventDefault();
    if (!poPaymentsAvailable) {
      setError("Satınalma ödənişləri bağlıdır. Server ledger ödəniş komandası tətbiq edilməlidir.");
      return;
    }
    if (!paymentForm.po_id || toNumber(paymentForm.amount) <= 0) {
      setError("PO və ödəniş məbləği tələb olunur.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      po_id: paymentForm.po_id,
      amount: toNumber(paymentForm.amount),
      payment_date: paymentForm.payment_date || today(),
      payment_method: paymentForm.payment_method?.trim() || "bank",
      reference_no: paymentForm.reference_no?.trim() || null,
      notes: paymentForm.notes?.trim() || null,
    };
    const { error: paymentError } = editingPaymentId
      ? await supabase.from("po_payments").update(payload).eq("id", editingPaymentId)
      : await supabase.from("po_payments").insert({ ...payload, tenant_id: tenantId, created_by: user?.id || null });
    if (paymentError) setError(getError(paymentError));
    else {
      setNotice(editingPaymentId ? "Ödəniş yeniləndi." : "PO ödənişi qeyd edildi.");
      setPaymentForm(emptyPoPayment);
      setEditingPaymentId(null);
      setPaymentPoId(null);
      await load();
    }
    setSaving(false);
  }

  async function deletePayment(payment) {
    if (!poPaymentsAvailable) return;
    if (!(await appConfirm("Bu ödənişi silmək istəyirsiniz?", { danger: true }))) return;
    setSaving(true);
    const { error: paymentError } = await supabase.from("po_payments").delete().eq("id", payment.id);
    if (paymentError) setError(getError(paymentError));
    else {
      setNotice("Ödəniş silindi.");
      await load();
    }
    setSaving(false);
  }


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
