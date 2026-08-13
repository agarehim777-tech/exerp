import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Eye,
  FileText,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Ship,
  Trash2,
  Truck,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { listWorkflowRecords, saveWorkflowRecord } from "../../services/enterpriseWorkflows.js";
import "./procurement.css";
import LandedCostPanel from "./LandedCostPanel.jsx";

const money = (value, currency = "AZN") =>
  `${Number(value || 0).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const qty = (value) => Number(value || 0).toLocaleString("az-AZ", { maximumFractionDigits: 3 });

const today = () => new Date().toISOString().slice(0, 10);
const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("az-AZ");

const toNumber = (value) => {
  const next = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(next) ? next : 0;
};

const PO_STATUS = {
  draft: { label: "Qaralama", tone: "neutral" },
  approved: { label: "Təsdiqli", tone: "info" },
  partial: { label: "Qismən mədaxil", tone: "warning" },
  received: { label: "Mədaxil tamam", tone: "success" },
  closed: { label: "Bağlandı", tone: "dark" },
  cancelled: { label: "Ləğv edildi", tone: "danger" },
};

const INVOICE_STATUS = {
  draft: { label: "Qaralama", tone: "neutral" },
  matched: { label: "Uyğundur", tone: "success" },
  exception: { label: "Fərq var", tone: "warning" },
  approved: { label: "Təsdiqli", tone: "info" },
  paid: { label: "Ödənilib", tone: "success" },
  cancelled: { label: "Ləğv edildi", tone: "danger" },
};

const emptyVendor = { name: "", tax_id: "", email: "", phone: "", address: "", is_active: true };
const emptyPo = { vendor_id: "", po_number: "", factory_name: "", order_date: today(), expected_date: "", currency: "AZN", exchange_rate: "1", payment_terms: "", notes: "" };
const emptyReceipt = { po_id: "", grn_number: "", receipt_date: today(), notes: "" };
const emptyInvoice = { po_id: "", invoice_number: "", invoice_date: today(), due_date: "", currency: "AZN", match_notes: "" };
const emptyPoLine = { product_id: "", product_sku: "", description: "", qty_ordered: "1", unit: "ədəd", unit_price: "0" };
const emptyRfq = { title: "", description: "", quantity: "1", due_at: "", vendor_ids: [] };
const emptyPoPayment = { po_id: "", amount: "", payment_date: today(), payment_method: "bank", reference_no: "", notes: "" };


function nextNumber(prefix) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function getError(error, fallback = "Əməliyyat tamamlanmadı") {
  return error?.message || fallback;
}

function lineAmount(line) {
  const base = toNumber(line.qty_ordered) * toNumber(line.unit_price);
  return base + (base * toNumber(line.tax_rate)) / 100;
}

function matchesQuery(values, query) {
  const needle = normalize(query);
  if (!needle) return true;
  return values.some((value) => normalize(value).includes(needle));
}

function groupBy(rows, key) {
  return rows.reduce((map, row) => {
    const id = row[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
    return map;
  }, new Map());
}

function StatusPill({ status, type = "po" }) {
  const meta = type === "invoice" ? INVOICE_STATUS[status] : PO_STATUS[status];
  const label = meta?.label || status || "Naməlum";
  return <span style={{ ...styles.badge, ...styles[`badge_${meta?.tone || "neutral"}`] }}>{label}</span>;
}

function IconButton({ icon: Icon, label, onClick, tone = "ghost", disabled = false, submit = false }) {
  return (
    <button
      type={submit ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
      style={{ ...styles.iconButton, ...styles[`button_${tone}`], opacity: disabled ? 0.5 : 1 }}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

function ProductAutocomplete({ products, value, onSelect }) {
  const selected = products.find((product) => product.id === value);
  const [query, setQuery] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selected?.name || "");
  }, [selected?.id, selected?.name]);

  const matches = useMemo(() => {
    const term = normalize(query);
    if (!term) return products.slice(0, 8);
    return products
      .filter((product) => normalize(`${product.name} ${product.sku}`).includes(term))
      .sort((a, b) => {
        const aStarts = normalize(a.name).startsWith(term) || normalize(a.sku).startsWith(term);
        const bStarts = normalize(b.name).startsWith(term) || normalize(b.sku).startsWith(term);
        return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name, "az");
      })
      .slice(0, 8);
  }, [products, query]);

  const choose = (product) => {
    setQuery(product.name);
    setOpen(false);
    setActiveIndex(0);
    onSelect(product);
  };

  return (
    <div className="product-autocomplete">
      <Search size={15} aria-hidden="true" />
      <input
        value={query}
        placeholder="Məhsul adı və ya SKU yazın"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
          if (event.key === "Enter" && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div className="product-autocomplete__menu">
          {matches.length ? matches.map((product, index) => (
            <button key={product.id} type="button" className={index === activeIndex ? "active" : ""} onMouseDown={() => choose(product)}>
              <span>{product.name}</span>
              <small>{product.sku || "SKU yoxdur"}</small>
            </button>
          )) : <div className="product-autocomplete__empty">Uyğun məhsul tapılmadı</div>}
        </div>
      )}
    </div>
  );
}

export default function ProcurementPage() {
  const { profile, user, activeTenantId } = useAuth();
  const tenantId = activeTenantId || profile?.active_tenant_id;

  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [poStatus, setPoStatusFilter] = useState("all");
  const [invoiceStatus, setInvoiceStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
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
  const [matchRows, setMatchRows] = useState({});
  const [rfqs, setRfqs] = useState([]);
  const [rfqForm, setRfqForm] = useState(emptyRfq);
  const [expandedPo, setExpandedPo] = useState(null);
  const [expandedReceipt, setExpandedReceipt] = useState(null);
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [paymentPoId, setPaymentPoId] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPoPayment);
  const [editingPaymentId, setEditingPaymentId] = useState(null);

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
    if (!tenantId) return;
    setLoading(true);
    setError("");
    const [vendorRes, productRes, poRes, lineRes, grnRes, grnLineRes, invoiceRes, invoiceLineRes, paymentRes] = await Promise.all([
      supabase.from("vendors").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("products").select("*").eq("tenant_id", tenantId).order("name", { ascending: true }),
      supabase.from("purchase_orders").select("*, vendors(name)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("purchase_order_lines").select("*").order("line_no", { ascending: true }),
      supabase.from("goods_receipts").select("*, purchase_orders(po_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("goods_receipt_lines").select("*, purchase_order_lines(po_id, product_sku, line_no)").order("created_at", { ascending: false }),
      supabase.from("vendor_invoices").select("*, vendors(name), purchase_orders(po_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("vendor_invoice_lines").select("*, purchase_order_lines(po_id, product_sku, line_no)").order("created_at", { ascending: false }),
      supabase.from("po_payments").select("*").eq("tenant_id", tenantId).order("payment_date", { ascending: false }),
    ]);

    const firstError = [vendorRes, productRes, poRes, lineRes, grnRes, grnLineRes, invoiceRes, invoiceLineRes, paymentRes].find((result) => result.error)?.error;
    if (firstError) setError(getError(firstError));

    setVendors(vendorRes.data || []);
    setProducts(productRes.data || []);
    setPurchaseOrders(poRes.data || []);
    setPoLines(lineRes.data || []);
    setGoodsReceipts(grnRes.data || []);
    setReceiptLines(grnLineRes.data || []);
    setInvoices(invoiceRes.data || []);
    setInvoiceLines(invoiceLineRes.data || []);
    setPoPayments(paymentRes.data || []);
    setLoading(false);
  }, [tenantId]);


  useEffect(() => {
    load();
  }, [load]);

  const loadRfqs = useCallback(async () => {
    if (!tenantId) return;
    try {
      setRfqs(await listWorkflowRecords({ tenantId, module: "procurement", recordType: "rfq" }));
    } catch (rfqError) {
      if (!String(rfqError?.message || "").includes("workflow_records")) setError(getError(rfqError));
    }
  }, [tenantId]);

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

  useEffect(() => {
    if (!tenantId) return undefined;
    const channel = supabase
      .channel(`procurement:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendors", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "goods_receipts", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_invoices", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "po_payments", filter: `tenant_id=eq.${tenantId}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, load]);


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
      map.set(invoice.id, lines.reduce((sum, line) => sum + toNumber(line.qty_invoiced) * toNumber(line.unit_price), 0));
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
    if (!window.confirm(`${vendor.name} vendorunu silmək istəyirsiniz?`)) return;
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
    if (!window.confirm(`${po.po_number} PO-sunu silmək istəyirsiniz?`)) return;
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
    setPaymentPoId(po.id);
    setEditingPaymentId(null);
    setPaymentForm({ ...emptyPoPayment, po_id: po.id, payment_date: today() });
    setExpandedPo(po.id);
  }

  function editPayment(payment) {
    const po = purchaseOrders.find((item) => item.id === payment.po_id);
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
    if (!window.confirm("Bu ödənişi silmək istəyirsiniz?")) return;
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
    if (!window.confirm(`${receipt.grn_number} GRN qeydini silmək istəyirsiniz?`)) return;
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
    await runMatch(invoiceId, false);
    setNotice(editingInvoiceId ? "Faktura yeniləndi və 3-way match hesablandı." : "Faktura yaradıldı və 3-way match hesablandı.");
    resetInvoiceForm();
    await load();
    setSaving(false);
  }

  async function runMatch(invoiceId, withNotice = true) {
    const [{ data: rows, error: evalError }, { error: applyError }] = await Promise.all([
      supabase.rpc("evaluate_invoice_match", { _invoice_id: invoiceId }),
      supabase.rpc("apply_invoice_match", { _invoice_id: invoiceId }),
    ]);
    if (evalError || applyError) {
      setError(getError(evalError || applyError));
      return;
    }
    setMatchRows((current) => ({ ...current, [invoiceId]: rows || [] }));
    if (withNotice) setNotice("3-way match yeniləndi.");
    await load();
  }

  async function updateInvoiceStatus(invoiceId, status) {
    setSaving(true);
    const { error: invoiceError } = await supabase.from("vendor_invoices").update({ status }).eq("id", invoiceId);
    if (invoiceError) setError(getError(invoiceError));
    else {
      setNotice(`Faktura statusu dəyişdi: ${INVOICE_STATUS[status]?.label || status}.`);
      await load();
    }
    setSaving(false);
  }

  async function deleteInvoice(invoice) {
    if (invoice.status === "paid") {
      setError("Ödənilmiş fakturanı silmək olmaz. Lazımdırsa əvvəl ödəniş düzəlişi aparılmalıdır.");
      return;
    }
    if (!window.confirm(`${invoice.invoice_number} fakturasını silmək istəyirsiniz?`)) return;
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
      <main style={styles.page} className="procurement-page">
        <section style={styles.emptyPanel}>
          <AlertTriangle size={28} />
          <h1>Aktiv şirkət seçilməyib</h1>
          <p>Satınalma modulundan istifadə etmək üçün əvvəl tenant/şirkət seçin.</p>
          <Link to="/" style={styles.linkButton}>
            <ArrowLeft size={16} />
            Panelə qayıt
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page} className="procurement-page">
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Satınalma</h1>
          <p style={styles.subtitle}>Vendor, zavod sifarişi, mədaxil və məhsulun maya dəyəri axını.</p>
        </div>
        <div style={styles.headerActions}>
          <IconButton icon={RefreshCw} label={loading ? "Yüklənir" : "Yenilə"} onClick={load} disabled={loading || saving} />
        </div>
      </header>

      <section style={styles.metricGrid} className="procurement-metrics">
        <Metric icon={Building2} label="Aktiv vendor" value={vendors.filter((vendor) => vendor.is_active).length} hint={`${vendors.length} vendor`} tone="blue" />
        <Metric icon={ShoppingCart} label="Açıq PO" value={stats.openPo.length} hint={`${purchaseOrders.length} ümumi PO`} tone="amber" />
        <Metric icon={Truck} label="Mədaxil gözləyir" value={stats.waitingReceipt.length} hint="Təsdiqli və qismən PO" tone="green" />
        <Metric icon={WalletCards} label="PO dəyəri" value={money(stats.approvedSpend)} hint={`${purchaseOrders.length} ümumi PO`} tone="rose" />
      </section>

      <section style={styles.toolbar}>
        <div style={styles.searchBox}>
          <Search size={17} />
          <input style={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Vendor, PO, GRN və ya SKU axtar..." />
        </div>
        {tab === "po" && (
          <select value={poStatus} onChange={(event) => setPoStatusFilter(event.target.value)} style={styles.select}>
            <option value="all">Bütün PO statusları</option>
            {Object.entries(PO_STATUS).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        )}
      </section>

      {(notice || error) && (
        <div style={{ ...styles.message, ...(error ? styles.messageError : styles.messageOk) }}>
          {error || notice}
          <button type="button" onClick={() => { setError(""); setNotice(""); }} style={styles.messageClose}>
            <X size={14} />
          </button>
        </div>
      )}

      <nav style={styles.tabs}>
        {[
          ["dashboard", BarChart3, "İcmal"],
          ["rfq", ClipboardCheck, "Təklif sorğuları"],
          ["vendors", Building2, "Vendorlar"],
          ["po", ShoppingCart, "PO"],
          ["grn", PackageCheck, "Mədaxil"],
          ["landed", Ship, "Göndəriş və maya"],
        ].map(([id, Icon, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ ...styles.tabButton, ...(tab === id ? styles.tabActive : {}) }}>
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <section style={styles.emptyPanel}>
          <RefreshCw size={26} />
          <h2>Məlumatlar yüklənir</h2>
          <p>Satınalma reyestri serverdən oxunur.</p>
        </section>
      ) : (
        <>
          {tab === "dashboard" && (
            <DashboardTab
              purchaseOrders={purchaseOrders}
              vendors={vendors}
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
              onPaid={(invoice) => updateInvoiceStatus(invoice.id, "paid")}
              onCancelInvoice={(invoice) => updateInvoiceStatus(invoice.id, "cancelled")}
              saving={saving}
            />
          )}
        </>
      )}
    </main>
  );
}

function RfqTab({ rfqs, vendors, form, setForm, onSubmit, onApprove, onReject, onConvert, saving }) {
  const vendorName = (id) => vendors.find((vendor) => vendor.id === id)?.name || "Vendor";
  const toggleVendor = (vendorId) => setForm({
    ...form,
    vendor_ids: form.vendor_ids.includes(vendorId)
      ? form.vendor_ids.filter((id) => id !== vendorId)
      : [...form.vendor_ids, vendorId],
  });

  return (
    <div style={styles.splitGrid}>
      <Panel title="Yeni təklif sorğusu" icon={ClipboardCheck}>
        <form style={{ ...styles.form, gridTemplateColumns: "1fr" }} onSubmit={onSubmit}>
          <Field label="Sorğunun adı" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required wide />
          <Field label="Məhsul / xidmət" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required wide />
          <Field label="Miqdar" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} required />
          <Field label="Təklif üçün son tarix" type="date" value={form.due_at} onChange={(value) => setForm({ ...form, due_at: value })} />
          <div style={styles.linesBlock}>
            <strong>Vendorlar</strong>
            {vendors.map((vendor) => (
              <label key={vendor.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={form.vendor_ids.includes(vendor.id)} onChange={() => toggleVendor(vendor.id)} />
                {vendor.name}
              </label>
            ))}
            {!vendors.length && <small>Əvvəl aktiv vendor yaradın.</small>}
          </div>
          <div style={styles.formActions}>
            <IconButton icon={Save} label="RFQ yarat" tone="primary" submit disabled={saving || !vendors.length} />
          </div>
        </form>
      </Panel>

      <Panel title="RFQ və vendor müqayisəsi" icon={BarChart3}>
        <DataTable
          columns={["RFQ", "Məhsul", "Vendorlar", "Son tarix", "Status", "Əməl"]}
          empty="Təklif sorğusu yoxdur."
          rows={rfqs.map((rfq) => {
            const line = rfq.workflow_lines?.[0];
            const invited = rfq.payload?.vendor_ids || [];
            return [
              <TwoLine title={rfq.record_no} subtitle={rfq.title} />,
              <TwoLine title={line?.description || "—"} subtitle={`${qty(line?.quantity)} vahid`} />,
              <TwoLine title={`${invited.length} vendor`} subtitle={invited.map(vendorName).join(", ") || "—"} />,
              rfq.due_at ? new Date(rfq.due_at).toLocaleDateString("az-AZ") : "—",
              <span style={{ ...styles.badge, ...(rfq.status === "approved" ? styles.badge_success : rfq.status === "rejected" ? styles.badge_danger : styles.badge_info) }}>{rfq.status}</span>,
              <div style={styles.rowActions}>
                {rfq.status === "sent" && <IconButton icon={CheckCircle2} label="Təsdiq" tone="success" onClick={() => onApprove(rfq)} />}
                {rfq.status === "sent" && <IconButton icon={XCircle} label="Rədd" tone="danger" onClick={() => onReject(rfq)} />}
                {rfq.status === "approved" && <IconButton icon={ShoppingCart} label="PO yarat" tone="primary" onClick={() => onConvert(rfq)} />}
              </div>,
            ];
          })}
        />
      </Panel>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, tone }) {
  return (
    <article style={styles.metricCard}>
      <div style={{ ...styles.metricIcon, ...styles[`metric_${tone}`] }}>
        <Icon size={20} />
      </div>
      <div>
        <span style={styles.metricLabel}>{label}</span>
        <strong style={styles.metricValue}>{value}</strong>
        <small style={styles.metricHint}>{hint}</small>
      </div>
    </article>
  );
}

function DashboardTab({ purchaseOrders, vendors, poMetrics, onCreatePo, onReceive }) {
  const latePo = purchaseOrders.filter((po) => po.expected_date && po.expected_date < today() && ["draft", "approved", "partial"].includes(po.status));
  const actionPo = purchaseOrders.filter((po) => ["approved", "partial"].includes(po.status)).slice(0, 6);

  return (
    <section style={styles.dashboardGrid} className="procurement-dashboard-grid">
      <Panel title="Satınalma axını" icon={ClipboardCheck}>
        <div style={styles.flowRow}>
          {[
            ["1", "Vendor", `${vendors.filter((vendor) => vendor.is_active).length} aktiv vendor`],
            ["2", "PO", "Qaralama → təsdiq"],
            ["3", "Mədaxil", "GRN ilə anbara qəbul"],
            ["4", "Maya", "Xərclərin bölgüsü və anbar qəbulu"],
          ].map(([step, title, text]) => (
            <div key={step} style={styles.flowItem}>
              <span>{step}</span>
              <strong>{title}</strong>
              <small>{text}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Təhvil/mədaxil gözləyən PO-lar" icon={Truck}>
        {actionPo.length === 0 ? (
          <Empty title="Mədaxil gözləyən PO yoxdur." />
        ) : (
          actionPo.map((po) => (
            <div key={po.id} style={styles.compactRow}>
              <div>
                <strong>{po.po_number}</strong>
                <small>{po.vendors?.name || "Vendor yoxdur"} · {money(poMetrics.get(po.id)?.total || 0, po.currency)}</small>
              </div>
              <div style={styles.rowActions}>
                <IconButton icon={PackageCheck} label="Mədaxil" onClick={() => onReceive(po.id)} />
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title="Risk və istisnalar" icon={AlertTriangle}>
        {latePo.length === 0 ? (
          <Empty title="Gecikən PO yoxdur." />
        ) : (
          <>
            {latePo.map((po) => (
              <div key={po.id} style={styles.warningRow}>
                <AlertTriangle size={16} />
                <div>
                  <strong>{po.po_number}</strong>
                  <small>Gözlənilən tarix keçib: {po.expected_date}</small>
                </div>
              </div>
            ))}
          </>
        )}
      </Panel>
    </section>
  );
}

function VendorsTab({ vendors, form, setForm, editingId, onSubmit, onCancel, onEdit, onToggle, onDelete, purchaseOrders, saving }) {
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { if (editingId) setShowForm(true); }, [editingId]);
  return (
    <section style={styles.stack}>
      <div style={styles.sectionActions}>
        <IconButton icon={showForm ? X : Plus} label={showForm ? "Formanı bağla" : "Yeni vendor"} tone={showForm ? "ghost" : "primary"} onClick={() => {
          if (showForm && editingId) onCancel();
          setShowForm((value) => !value);
        }} />
      </div>
      {showForm && (
      <Panel title={editingId ? "Vendoru redaktə et" : "Yeni vendor"} icon={Building2}>
        <form onSubmit={onSubmit} style={styles.form}>
          <Field label="Ad" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <Field label="VÖEN" value={form.tax_id} onChange={(value) => setForm({ ...form, tax_id: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Telefon" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Ünvan" value={form.address} onChange={(value) => setForm({ ...form, address: value })} wide />
          <label style={styles.checkLine}>
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Aktiv vendor kimi saxla
          </label>
          <div style={styles.formActions}>
            <IconButton icon={Save} label={editingId ? "Yadda saxla" : "Əlavə et"} tone="primary" disabled={saving} submit />
            {editingId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>
      )}

      <Panel title="Vendor reyestri" icon={Building2}>
        <DataTable
          columns={["Vendor", "Əlaqə", "PO sayı", "Status", "Əməl"]}
          empty="Vendor yoxdur. Sol tərəfdən ilk vendoru yaradın."
          rows={vendors.map((vendor) => {
            const vendorPo = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
            return [
              <TwoLine key="vendor" title={vendor.name} subtitle={vendor.tax_id || vendor.address || "VÖEN/ünvan qeyd edilməyib"} />,
              <TwoLine key="contact" title={vendor.phone || "Telefon yoxdur"} subtitle={vendor.email || "Email yoxdur"} />,
              vendorPo.length,
              <span key="status" style={{ ...styles.badge, ...(vendor.is_active ? styles.badge_success : styles.badge_neutral) }}>
                {vendor.is_active ? "Aktiv" : "Passiv"}
              </span>,
              <div key="actions" style={styles.rowActions}>
                <IconButton icon={Pencil} label="Edit" onClick={() => { setShowForm(true); onEdit(vendor); }} />
                <IconButton icon={vendor.is_active ? XCircle : CheckCircle2} label={vendor.is_active ? "Passiv" : "Aktiv"} onClick={() => onToggle(vendor)} />
                <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(vendor)} tone="danger" />
              </div>,
            ];
          })}
        />
      </Panel>
    </section>
  );
}

function PurchaseOrdersTab({
  vendors,
  products,
  purchaseOrders,
  allPurchaseOrders,
  linesByPo,
  poMetrics,
  paymentByPo,
  poPayments,
  acceptedByLine,
  invoicedByLine,
  expandedPo,
  setExpandedPo,
  form,
  setForm,
  draftLines,
  setDraftLines,
  setProductOnLine,
  editingPoId,
  paymentPoId,
  paymentForm,
  setPaymentForm,
  editingPaymentId,
  onPaymentOpen,
  onPaymentEdit,
  onPaymentSubmit,
  onPaymentDelete,
  onSubmit,
  onCancel,
  onEdit,
  onDelete,
  onApprove,
  onCancelPo,
  onClose,
  onReceive,
  onInvoice,
  saving,
}) {
  const activeVendors = vendors.filter((vendor) => vendor.is_active);
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { if (editingPoId) setShowForm(true); }, [editingPoId]);
  return (
    <section style={styles.stack}>
      <div style={styles.sectionActions}>
        <IconButton icon={showForm ? X : Plus} label={showForm ? "Formanı bağla" : "Yeni PO yarat"} tone={showForm ? "ghost" : "primary"} onClick={() => {
          if (showForm && editingPoId) onCancel();
          setShowForm((value) => !value);
        }} />
      </div>
      {showForm && (
      <Panel title={editingPoId ? "PO redaktəsi" : "Yeni satınalma sifarişi"} icon={ShoppingCart}>
        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.field}>
            <span>Vendor</span>
            <select value={form.vendor_id} onChange={(event) => setForm({ ...form, vendor_id: event.target.value })} required>
              <option value="">Vendor seçin</option>
              {activeVendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>
          <Field label="Zavod" value={form.factory_name} onChange={(value) => setForm({ ...form, factory_name: value })} />
          <Field label="PO nömrəsi" value={form.po_number} onChange={(value) => setForm({ ...form, po_number: value })} required />
          <Field label="Sifariş tarixi" type="date" value={form.order_date} onChange={(value) => setForm({ ...form, order_date: value })} />
          <Field label="Gözlənilən tarix" type="date" value={form.expected_date} onChange={(value) => setForm({ ...form, expected_date: value })} />
          <label style={styles.field}>
            <span>Valyuta</span>
            <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              <option value="AZN">AZN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <Field label="Məzənnə" type="number" value={form.exchange_rate} onChange={(value) => setForm({ ...form, exchange_rate: value })} />
          <Field label="Ödəniş şərti" value={form.payment_terms} onChange={(value) => setForm({ ...form, payment_terms: value })} />
          <Field label="Qeyd" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} wide />

          <div style={styles.linesBlock}>
            <div style={styles.linesHeader}>
              <strong>Məhsul sətirləri</strong>
              <IconButton icon={Plus} label="Sətir" onClick={() => setDraftLines([...draftLines, { ...emptyPoLine }])} />
            </div>
            <datalist id="procurement-products">
              {products.map((product) => (
                <option key={product.id} value={product.sku}>{product.name}</option>
              ))}
            </datalist>
            {draftLines.map((line, index) => (
              <div key={index} className="po-line-card">
                <div className="po-line-card__header">
                  <strong>Məhsul {index + 1}</strong>
                  <IconButton icon={Trash2} label="Sil" tone="danger" disabled={draftLines.length === 1} onClick={() => setDraftLines(draftLines.filter((_, itemIndex) => itemIndex !== index))} />
                </div>
                <div className="po-line-grid po-line-grid--main">
                  <label><span>SKU / məhsul kodu</span><input list="procurement-products" placeholder="Məsələn: SN-G5" value={line.product_sku} onChange={(event) => setProductOnLine(index, event.target.value)} /></label>
                  <label>
                    <span>Məhsul seçin</span>
                    <ProductAutocomplete products={products} value={line.product_id} onSelect={(product) => setProductOnLine(index, product.sku)} />
                  </label>
                  <label><span>Miqdar</span><input type="number" min="0" step="0.001" value={line.qty_ordered} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, qty_ordered: event.target.value } : item)))} /></label>
                  <label><span>Ölçü vahidi</span><input placeholder="ədəd" value={line.unit} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => itemIndex === index ? { ...item, unit:event.target.value } : item))} /></label>
                  <label><span>Vahid invoice qiyməti</span><input type="number" min="0" step="0.0001" value={line.unit_price} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, unit_price: event.target.value } : item)))} /></label>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.formActions}>
            <IconButton icon={Save} label={editingPoId ? "PO yenilə" : "PO yarat"} tone="primary" disabled={saving || activeVendors.length === 0} submit />
            {editingPoId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
          {activeVendors.length === 0 && <p style={styles.helperText}>PO yaratmaq üçün əvvəl aktiv vendor yaradın.</p>}
        </form>
      </Panel>
      )}

      <Panel title="PO reyestri" icon={ClipboardCheck}>
        <DataTable
          columns={["PO", "Vendor", "Dəyər", "Ödənilib", "Qalıq ödəniş", "Status", "Mədaxil", "Əməl"]}
          empty={allPurchaseOrders.length ? "Filterə uyğun PO yoxdur." : "PO yoxdur. Yuxarıdakı formadan ilk sifarişi yaradın."}
          rows={purchaseOrders.map((po) => {
            const metrics = poMetrics.get(po.id) || {};
            const payment = (paymentByPo && paymentByPo.get(po.id)) || { billed: 0, paid: 0 };
            const total = metrics.total || 0;
            const paid = payment.paid || 0;
            const due = Math.max(0, total - paid);
            const isExpanded = expandedPo === po.id;
            return [
              <button key="po" type="button" style={styles.linkCell} onClick={() => setExpandedPo(isExpanded ? null : po.id)}>
                <TwoLine title={po.po_number} subtitle={`${po.order_date || "tarixsiz"} → ${po.expected_date || "plan yoxdur"}`} />
              </button>,
              po.vendors?.name || "Vendor yoxdur",
              <TwoLine key="amount" title={money(total, po.currency)} subtitle={`${metrics.lineCount || 0} sətir`} />,
              <TwoLine key="paid" title={money(paid, po.currency)} subtitle={`Fakturalanıb: ${money(payment.billed || 0, po.currency)}`} />,
              <TwoLine key="due" title={money(due, po.currency)} subtitle={due <= 0 && total > 0 ? "Tam ödənilib" : `${total > 0 ? Math.round((paid / total) * 100) : 0}% ödənilib`} />,
              <StatusPill key="status" status={po.status} />,

              <Progress key="progress" value={metrics.progress || 0} label={`${qty(metrics.received)} / ${qty(metrics.ordered)} ədəd`} />,
              <div key="actions" style={styles.rowActions}>
                <IconButton icon={Pencil} label="Redaktə et" onClick={() => { setShowForm(true); onEdit(po); }} />
                <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(po)} tone="danger" />
                <IconButton icon={Eye} label={isExpanded ? "Bağla" : "Bax"} onClick={() => setExpandedPo(isExpanded ? null : po.id)} />
                {po.status === "draft" && <IconButton icon={CheckCircle2} label="Təsdiq" onClick={() => onApprove(po)} tone="success" />}
                {["approved", "partial"].includes(po.status) && <IconButton icon={PackageCheck} label="Mədaxil" onClick={() => onReceive(po.id)} tone="success" />}
                {po.status === "received" && <IconButton icon={CheckCircle2} label="Bağla" onClick={() => onClose(po)} />}
                {!["closed", "cancelled"].includes(po.status) && <IconButton icon={XCircle} label="Ləğv" onClick={() => onCancelPo(po)} tone="danger" />}
              </div>,
            ];
          })}
          detail={(po) =>
            expandedPo === po.id && (
              <LineDetailTable lines={linesByPo.get(po.id) || []} acceptedByLine={acceptedByLine} invoicedByLine={invoicedByLine} currency={po.currency} />
            )
          }
          sourceRows={purchaseOrders}
        />
      </Panel>
    </section>
  );
}

function ReceiptsTab({
  form,
  setForm,
  draftLines,
  setDraftLines,
  editingId,
  poOptions,
  goodsReceipts,
  receiptLinesByReceipt,
  poLines,
  expandedReceipt,
  setExpandedReceipt,
  onSubmit,
  onCancel,
  onEdit,
  onDelete,
  saving,
}) {
  return (
    <section style={styles.stack}>
      <Panel title={editingId ? "Mədaxili redaktə et" : "Yeni mədaxil (GRN)"} icon={PackageCheck}>
        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.field}>
            <span>PO</span>
            <select value={form.po_id} onChange={(event) => setForm({ ...form, po_id: event.target.value })} required disabled={!!editingId}>
              <option value="">PO seçin</option>
              {poOptions.map((po) => (
                <option key={po.id} value={po.id}>{po.po_number} · {po.vendors?.name || "Vendor"}</option>
              ))}
            </select>
          </label>
          <Field label="GRN nömrəsi" value={form.grn_number} onChange={(value) => setForm({ ...form, grn_number: value })} required />
          <Field label="Mədaxil tarixi" type="date" value={form.receipt_date} onChange={(value) => setForm({ ...form, receipt_date: value })} />
          <Field label="Qeyd" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} wide />

          <div style={styles.linesBlock}>
            <div style={styles.linesHeader}>
              <strong>Qəbul sətirləri</strong>
              <small>{draftLines.length ? "Qəbul/rədd miqdarlarını təsdiqləyin." : "PO seçdikdə sətirlər açılacaq."}</small>
            </div>
            {draftLines.map((line, index) => (
              <div key={line.po_line_id} style={styles.receiptLineGrid}>
                <TwoLine title={line.label} subtitle={`Sifariş: ${qty(line.ordered)} · Qalıq: ${qty(line.outstanding)}`} />
                <input type="number" min="0" max={line.outstanding} step="0.001" placeholder="Qəbul edildi" value={line.qty_received} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => {
                  if (itemIndex !== index) return item;
                  const raw = event.target.value;
                  if (raw === "") return { ...item, qty_received: "" };
                  const received = Math.min(Math.max(0, toNumber(raw)), toNumber(item.outstanding));
                  return { ...item, qty_received: String(received), qty_rejected: String(Math.min(toNumber(item.qty_rejected), received)) };
                }))} style={styles.input} />
                <input type="number" min="0.000001" step="0.000001" placeholder="Vahid həcm, m³" value={line.unit_volume_m3} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => itemIndex === index ? { ...item, unit_volume_m3: event.target.value } : item))} style={styles.input} />
                <input type="number" min="0" max={line.qty_received || 0} step="0.001" placeholder="Rədd edildi" value={line.qty_rejected} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => {
                  if (itemIndex !== index) return item;
                  const raw = event.target.value;
                  if (raw === "") return { ...item, qty_rejected: "" };
                  return { ...item, qty_rejected: String(Math.min(Math.max(0, toNumber(raw)), toNumber(item.qty_received))) };
                }))} style={styles.input} />
              </div>
            ))}
          </div>

          <div style={styles.formActions}>
            <IconButton icon={Save} label={editingId ? "GRN yenilə" : "Mədaxil et"} tone="primary" disabled={saving || !draftLines.length} submit />
            {editingId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>

      <Panel title="Mədaxil reyestri" icon={Truck}>
        <DataTable
          columns={["GRN", "PO", "Tarix", "Sətir", "Əməl"]}
          empty="Mədaxil qeydi yoxdur."
          rows={goodsReceipts.map((receipt) => {
            const lines = receiptLinesByReceipt.get(receipt.id) || [];
            const isExpanded = expandedReceipt === receipt.id;
            return [
              <button key="grn" type="button" style={styles.linkCell} onClick={() => setExpandedReceipt(isExpanded ? null : receipt.id)}>
                <TwoLine title={receipt.grn_number} subtitle={receipt.notes || "Qeyd yoxdur"} />
              </button>,
              receipt.purchase_orders?.po_number || "PO yoxdur",
              receipt.receipt_date,
              lines.length,
              <div key="actions" style={styles.rowActions}>
                <IconButton icon={Eye} label={isExpanded ? "Bağla" : "Bax"} onClick={() => setExpandedReceipt(isExpanded ? null : receipt.id)} />
                <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(receipt)} />
                <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(receipt)} tone="danger" />
              </div>,
            ];
          })}
          sourceRows={goodsReceipts}
          detail={(receipt) => expandedReceipt === receipt.id && <ReceiptLineTable lines={receiptLinesByReceipt.get(receipt.id) || []} poLines={poLines} />}
        />
      </Panel>
    </section>
  );
}

function InvoicesTab({
  form,
  setForm,
  draftLines,
  setDraftLines,
  editingId,
  poOptions,
  invoices,
  invoiceLinesByInvoice,
  poLines,
  invoiceTotals,
  matchRows,
  expandedInvoice,
  setExpandedInvoice,
  onSubmit,
  onCancel,
  onEdit,
  onDelete,
  onMatch,
  onApprove,
  onPaid,
  onCancelInvoice,
  saving,
}) {
  return (
    <section style={styles.stack}>
      <Panel title={editingId ? "Fakturanı redaktə et" : "Yeni vendor fakturası"} icon={Receipt}>
        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.field}>
            <span>PO</span>
            <select value={form.po_id} onChange={(event) => setForm({ ...form, po_id: event.target.value })} required disabled={!!editingId}>
              <option value="">PO seçin</option>
              {poOptions.map((po) => (
                <option key={po.id} value={po.id}>{po.po_number} · {po.vendors?.name || "Vendor"}</option>
              ))}
            </select>
          </label>
          <Field label="Faktura nömrəsi" value={form.invoice_number} onChange={(value) => setForm({ ...form, invoice_number: value })} required />
          <Field label="Faktura tarixi" type="date" value={form.invoice_date} onChange={(value) => setForm({ ...form, invoice_date: value })} />
          <Field label="Ödəniş tarixi" type="date" value={form.due_date} onChange={(value) => setForm({ ...form, due_date: value })} />
          <label style={styles.field}>
            <span>Valyuta</span>
            <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              <option value="AZN">AZN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <Field label="Match qeydi" value={form.match_notes} onChange={(value) => setForm({ ...form, match_notes: value })} wide />

          <div style={styles.linesBlock}>
            <div style={styles.linesHeader}>
              <strong>Faktura sətirləri</strong>
              <small>{draftLines.length ? "Qəbul və PO qiyməti ilə müqayisə olunacaq." : "PO seçdikdə sətirlər açılacaq."}</small>
            </div>
            {draftLines.map((line, index) => (
              <div key={line.po_line_id} style={styles.invoiceLineGrid}>
                <TwoLine title={line.label} subtitle={`Sifariş: ${qty(line.ordered)} · Qəbul: ${qty(line.accepted)}`} />
                <input type="number" min="0" step="0.001" placeholder="Faktura miqdarı" value={line.qty_invoiced} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, qty_invoiced: event.target.value } : item)))} style={styles.input} />
                <input type="number" min="0" step="0.0001" placeholder="Faktura qiyməti" value={line.unit_price} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, unit_price: event.target.value } : item)))} style={styles.input} />
                <input type="number" min="0" step="0.01" placeholder="ƏDV %" value={line.tax_rate} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, tax_rate: event.target.value } : item)))} style={styles.input} />
              </div>
            ))}
          </div>

          <div style={styles.formActions}>
            <IconButton icon={Save} label={editingId ? "Faktura yenilə" : "Faktura yarat"} tone="primary" disabled={saving || !draftLines.length} submit />
            {editingId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>

      <Panel title="Faktura və 3-way match" icon={FileText}>
        <DataTable
          columns={["Faktura", "Vendor / PO", "Məbləğ", "Status", "Əməl"]}
          empty="Faktura yoxdur."
          rows={invoices.map((invoice) => {
            const isExpanded = expandedInvoice === invoice.id;
            return [
              <button key="invoice" type="button" style={styles.linkCell} onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)}>
                <TwoLine title={invoice.invoice_number} subtitle={`${invoice.invoice_date || "tarixsiz"} · son ödəniş ${invoice.due_date || "qeyd yoxdur"}`} />
              </button>,
              <TwoLine key="vendor" title={invoice.vendors?.name || "Vendor yoxdur"} subtitle={`PO ${invoice.purchase_orders?.po_number || "yoxdur"}`} />,
              money(invoiceTotals.get(invoice.id) || 0, invoice.currency),
              <StatusPill key="status" status={invoice.status} type="invoice" />,
              <div key="actions" style={styles.rowActions}>
                <IconButton icon={Eye} label={isExpanded ? "Bağla" : "Bax"} onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)} />
                <IconButton icon={RefreshCw} label="Match" onClick={() => onMatch(invoice)} />
                <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(invoice)} disabled={invoice.status === "paid"} />
                {invoice.status === "matched" && <IconButton icon={CheckCircle2} label="Təsdiq" onClick={() => onApprove(invoice)} tone="success" />}
                {["matched", "approved"].includes(invoice.status) && <IconButton icon={WalletCards} label="Ödəndi" onClick={() => onPaid(invoice)} tone="success" />}
                {!["paid", "cancelled"].includes(invoice.status) && <IconButton icon={XCircle} label="Ləğv" onClick={() => onCancelInvoice(invoice)} tone="danger" />}
                {invoice.status !== "paid" && <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(invoice)} tone="danger" />}
              </div>,
            ];
          })}
          sourceRows={invoices}
          detail={(invoice) =>
            expandedInvoice === invoice.id && (
              <InvoiceDetailTable lines={invoiceLinesByInvoice.get(invoice.id) || []} poLines={poLines} matchRows={matchRows[invoice.id]} currency={invoice.currency} />
            )
          }
        />
      </Panel>
    </section>
  );
}

function LineDetailTable({ lines, acceptedByLine, invoicedByLine, currency }) {
  return (
    <DataTable
      columns={["SKU", "Məhsul", "Sifariş", "Mədaxil", "Faktura", "Qiymət", "Cəm"]}
      empty="PO sətri yoxdur."
      rows={lines.map((line) => [
        line.product_sku,
        line.description || "İzah yoxdur",
        qty(line.qty_ordered),
        qty(acceptedByLine.get(line.id) || 0),
        qty(invoicedByLine.get(line.id) || 0),
        money(line.unit_price, currency),
        money(lineAmount(line), currency),
      ])}
    />
  );
}

function ReceiptLineTable({ lines, poLines }) {
  return (
    <DataTable
      columns={["SKU", "Qəbul edildi", "Rədd edildi", "Net mədaxil"]}
      empty="Mədaxil sətri yoxdur."
      rows={lines.map((line) => {
        const poLine = poLines.find((item) => item.id === line.po_line_id);
        return [
          poLine?.product_sku || "SKU yoxdur",
          qty(line.qty_received),
          qty(line.qty_rejected),
          qty(Math.max(0, toNumber(line.qty_received) - toNumber(line.qty_rejected))),
        ];
      })}
    />
  );
}

function InvoiceDetailTable({ lines, poLines, matchRows, currency }) {
  return (
    <div style={styles.stackSmall}>
      <DataTable
        columns={["SKU", "Faktura miqdarı", "Faktura qiyməti", "Cəm"]}
        empty="Faktura sətri yoxdur."
        rows={lines.map((line) => {
          const poLine = poLines.find((item) => item.id === line.po_line_id);
          return [
            poLine?.product_sku || "SKU yoxdur",
            qty(line.qty_invoiced),
            money(line.unit_price, currency),
            money(toNumber(line.qty_invoiced) * toNumber(line.unit_price), currency),
          ];
        })}
      />
      {matchRows && (
        <DataTable
          columns={["SKU", "PO", "Mədaxil", "Faktura", "Qiymət", "Nəticə"]}
          empty="Match nəticəsi yoxdur."
          rows={matchRows.map((row) => [
            row.product_sku,
            qty(row.qty_ordered),
            qty(row.qty_accepted),
            qty(row.qty_invoiced),
            row.price_ok ? "Uyğun" : "Fərq var",
            <span key="match" style={{ ...styles.badge, ...(row.status === "matched" ? styles.badge_success : styles.badge_warning) }}>
              {row.status === "matched" ? "Uyğundur" : row.status}
            </span>,
          ])}
        />
      )}
    </div>
  );
}

function Panel({ title, icon: Icon, action, children }) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <h2>{title}</h2>
        <div style={styles.panelTools}>
          {Icon && <Icon size={18} />}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", required = false, wide = false }) {
  return (
    <label style={{ ...styles.field, ...(wide ? styles.fieldWide : {}) }}>
      <span>{label}</span>
      <input style={styles.input} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function TwoLine({ title, subtitle }) {
  return (
    <div style={styles.twoLine}>
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}

function Progress({ value, label }) {
  return (
    <div style={styles.progressWrap}>
      <div style={styles.progressTrack}>
        <span style={{ ...styles.progressFill, width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <small>{label}</small>
    </div>
  );
}

function Empty({ title }) {
  return (
    <div style={styles.emptyInline}>
      <PackagePlus size={20} />
      <span>{title}</span>
    </div>
  );
}

function DataTable({ columns, rows, empty, detail, sourceRows }) {
  const detailSource = sourceRows || rows;
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} style={styles.th}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const detailContent = detail?.(detailSource[rowIndex]);
            return (
              <Fragment key={detailSource[rowIndex]?.id || `row-${rowIndex}`}>
                <tr>
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} style={styles.td}>{cell}</td>
                  ))}
                </tr>
                {detailContent && (
                  <tr>
                    <td colSpan={columns.length} style={styles.detailCell}>{detailContent}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    boxSizing: "border-box",
    background: "transparent",
    color: "#0f172a",
    padding: "0",
    fontFamily: "inherit",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    width: "100%",
    margin: "0 0 14px",
  },
  headerActions: { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    color: "#2563eb",
    textDecoration: "none",
    fontSize: "13px",
    fontWeight: 700,
    marginBottom: "8px",
  },
  title: { margin: 0, fontSize: "22px", lineHeight: 1.25, color: "#15372d" },
  subtitle: { margin: "4px 0 0", color: "#71867f", fontSize: "12px" },
  metricGrid: {
    width: "100%",
    margin: "0 0 12px",
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "10px",
  },
  metricCard: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    background: "#fff",
    border: "1px solid #ded8c4",
    borderRadius: "12px",
    padding: "13px",
    boxShadow: "none",
  },
  metricIcon: { width: "44px", height: "44px", borderRadius: "10px", display: "grid", placeItems: "center" },
  metric_blue: { background: "#dff3e9", color: "#08745a" },
  metric_amber: { background: "#fef3c7", color: "#b45309" },
  metric_green: { background: "#dcfce7", color: "#15803d" },
  metric_rose: { background: "#ffe4e6", color: "#be123c" },
  metricLabel: { display: "block", color: "#64748b", fontSize: "12px", fontWeight: 700 },
  metricValue: { display: "block", fontSize: "22px", marginTop: "2px" },
  metricHint: { display: "block", color: "#94a3b8", marginTop: "2px" },
  toolbar: { width: "100%", margin: "0 0 10px", display: "flex", gap: "8px", alignItems: "center" },
  searchBox: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#fff",
    border: "1px solid #d8d3c2",
    borderRadius: "10px",
    padding: "0 12px",
    minHeight: "38px",
    color: "#64748b",
  },
  searchInput: { flex: 1, border: 0, outline: 0, minHeight: "38px", font: "inherit", background: "transparent" },
  select: { height: "42px", border: "1px solid #e5e7eb", borderRadius: "10px", background: "#fff", padding: "0 12px", fontWeight: 700 },
  tabs: { width: "100%", margin: "0 0 12px", display: "flex", gap: "6px", flexWrap: "wrap" },
  tabButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "36px",
    padding: "0 12px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#fff",
    color: "#475569",
    fontWeight: 800,
    cursor: "pointer",
  },
  tabActive: { border: "1px solid #08745a", color: "#075e4b", background: "#e8f5ef" },
  panel: { background: "#fff", border: "1px solid #ded8c4", borderRadius: "12px", padding: "15px", boxShadow: "none", minWidth: 0 },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px" },
  panelTools: { display: "flex", alignItems: "center", gap: "8px", color: "#64748b" },
  dashboardGrid: { width: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) repeat(2, minmax(250px, 1fr))", gap: "10px" },
  splitGrid: { width: "100%", display: "grid", gridTemplateColumns: "minmax(300px, 380px) minmax(0, 1fr)", gap: "10px" },
  stack: { width: "100%", display: "grid", gap: "10px" },
  sectionActions: { display: "flex", justifyContent: "flex-end", alignItems: "center", minHeight: "34px" },
  stackSmall: { display: "grid", gap: "10px" },
  form: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" },
  field: { display: "grid", gap: "6px", color: "#475569", fontSize: "12px", fontWeight: 800 },
  fieldWide: { gridColumn: "span 2" },
  input: {
    width: "100%",
    height: "38px",
    boxSizing: "border-box",
    border: "1px solid #dbe3ef",
    borderRadius: "8px",
    padding: "0 10px",
    font: "inherit",
    color: "#0f172a",
    background: "#fff",
  },
  linesBlock: { gridColumn: "1 / -1", border: "1px solid #edf2f7", background: "#f8fafc", borderRadius: "10px", padding: "12px", display: "grid", gap: "8px" },
  linesHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", color: "#334155" },
  lineGrid: { display: "grid", gridTemplateColumns: "1.1fr 1.4fr 0.7fr 0.8fr 0.65fr auto", gap: "8px", alignItems: "center" },
  receiptLineGrid: { display: "grid", gridTemplateColumns: "1.5fr 0.55fr 0.65fr 0.55fr", gap: "8px", alignItems: "center" },
  invoiceLineGrid: { display: "grid", gridTemplateColumns: "1.6fr 0.55fr 0.55fr 0.45fr", gap: "8px", alignItems: "center" },
  formActions: { gridColumn: "1 / -1", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  checkLine: { gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "8px", color: "#475569", fontWeight: 700 },
  helperText: { gridColumn: "1 / -1", margin: 0, color: "#b45309", fontSize: "13px", fontWeight: 700 },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minHeight: "34px",
    padding: "0 10px",
    borderRadius: "8px",
    border: "1px solid #dbe3ef",
    background: "#fff",
    color: "#334155",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  button_primary: { background: "#08745a", color: "#fff", borderColor: "#08745a" },
  button_success: { background: "#16a34a", color: "#fff", borderColor: "#16a34a" },
  button_danger: { background: "#fff1f2", color: "#be123c", borderColor: "#fecdd3" },
  button_ghost: {},
  rowActions: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th: { textAlign: "left", padding: "10px", background: "#f8fafc", color: "#64748b", borderBottom: "1px solid #e5e7eb", fontWeight: 900 },
  td: { padding: "10px", borderBottom: "1px solid #eef2f7", verticalAlign: "middle" },
  detailCell: { padding: "12px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" },
  linkCell: { border: 0, padding: 0, background: "transparent", textAlign: "left", color: "#0f172a", cursor: "pointer", font: "inherit" },
  twoLine: { display: "grid", gap: "2px" },
  badge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "24px", padding: "0 9px", borderRadius: "999px", fontSize: "12px", fontWeight: 900 },
  badge_success: { background: "#dcfce7", color: "#166534" },
  badge_warning: { background: "#fef3c7", color: "#92400e" },
  badge_danger: { background: "#ffe4e6", color: "#be123c" },
  badge_info: { background: "#dbeafe", color: "#1d4ed8" },
  badge_dark: { background: "#e2e8f0", color: "#334155" },
  badge_neutral: { background: "#f1f5f9", color: "#475569" },
  progressWrap: { display: "grid", gap: "5px", minWidth: "150px" },
  progressTrack: { height: "7px", background: "#e5e7eb", borderRadius: "999px", overflow: "hidden" },
  progressFill: { display: "block", height: "100%", background: "#2563eb", borderRadius: "999px" },
  emptyInline: { minHeight: "120px", display: "grid", placeItems: "center", gap: "8px", color: "#64748b", textAlign: "center" },
  flowRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" },
  flowItem: { border: "1px solid #e5e7eb", borderRadius: "9px", padding: "11px", background: "#f8fafc", display: "grid", gap: "4px", minWidth: 0 },
  compactRow: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eef2f7" },
  warningRow: { display: "flex", gap: "8px", alignItems: "center", padding: "10px", border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: "10px", marginBottom: "8px" },
  message: { maxWidth: "1440px", margin: "0 auto 12px", borderRadius: "10px", padding: "10px 42px 10px 12px", position: "relative", fontWeight: 800, fontSize: "13px" },
  messageOk: { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" },
  messageError: { background: "#ffe4e6", color: "#be123c", border: "1px solid #fecdd3" },
  messageClose: { position: "absolute", right: "10px", top: "8px", border: 0, background: "transparent", cursor: "pointer", color: "inherit" },
  emptyPanel: { maxWidth: "560px", margin: "90px auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "30px", textAlign: "center", display: "grid", gap: "10px", justifyItems: "center" },
  linkButton: { display: "inline-flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", borderRadius: "9px", padding: "10px 14px", textDecoration: "none", fontWeight: 800 },
};
