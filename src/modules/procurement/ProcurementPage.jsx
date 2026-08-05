import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
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
  Trash2,
  Truck,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { listWorkflowRecords, saveWorkflowRecord } from "../../services/enterpriseWorkflows.js";

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
  approved: { label: "TЙ™sdiqli", tone: "info" },
  partial: { label: "QismЙ™n mЙ™daxil", tone: "warning" },
  received: { label: "MЙ™daxil tamam", tone: "success" },
  closed: { label: "BaДџlandД±", tone: "dark" },
  cancelled: { label: "LЙ™Дџv edildi", tone: "danger" },
};

const INVOICE_STATUS = {
  draft: { label: "Qaralama", tone: "neutral" },
  matched: { label: "UyДџundur", tone: "success" },
  exception: { label: "FЙ™rq var", tone: "warning" },
  approved: { label: "TЙ™sdiqli", tone: "info" },
  paid: { label: "Г–dЙ™nilib", tone: "success" },
  cancelled: { label: "LЙ™Дџv edildi", tone: "danger" },
};

const emptyVendor = { name: "", tax_id: "", email: "", phone: "", address: "", is_active: true };
const emptyPo = { vendor_id: "", po_number: "", order_date: today(), expected_date: "", currency: "AZN", notes: "" };
const emptyReceipt = { po_id: "", grn_number: "", receipt_date: today(), notes: "" };
const emptyInvoice = { po_id: "", invoice_number: "", invoice_date: today(), due_date: "", currency: "AZN", match_notes: "" };
const emptyPoLine = { product_sku: "", description: "", qty_ordered: "1", unit_price: "0", tax_rate: "0" };
const emptyRfq = { title: "", description: "", quantity: "1", due_at: "", vendor_ids: [] };

function nextNumber(prefix) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function getError(error, fallback = "ЖЏmЙ™liyyat tamamlanmadД±") {
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
  const label = meta?.label || status || "NamЙ™lum";
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
  const [matchRows, setMatchRows] = useState({});
  const [rfqs, setRfqs] = useState([]);
  const [rfqForm, setRfqForm] = useState(emptyRfq);
  const [expandedPo, setExpandedPo] = useState(null);
  const [expandedReceipt, setExpandedReceipt] = useState(null);
  const [expandedInvoice, setExpandedInvoice] = useState(null);

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
    const [vendorRes, productRes, poRes, lineRes, grnRes, grnLineRes, invoiceRes, invoiceLineRes] = await Promise.all([
      supabase.from("vendors").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("products").select("*").eq("tenant_id", tenantId).order("name", { ascending: true }),
      supabase.from("purchase_orders").select("*, vendors(name)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("purchase_order_lines").select("*").order("line_no", { ascending: true }),
      supabase.from("goods_receipts").select("*, purchase_orders(po_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("goods_receipt_lines").select("*, purchase_order_lines(po_id, product_sku, line_no)").order("created_at", { ascending: false }),
      supabase.from("vendor_invoices").select("*, vendors(name), purchase_orders(po_number)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("vendor_invoice_lines").select("*, purchase_order_lines(po_id, product_sku, line_no)").order("created_at", { ascending: false }),
    ]);

    const firstError = [vendorRes, productRes, poRes, lineRes, grnRes, grnLineRes, invoiceRes, invoiceLineRes].find((result) => result.error)?.error;
    if (firstError) setError(getError(firstError));

    setVendors(vendorRes.data || []);
    setProducts(productRes.data || []);
    setPurchaseOrders(poRes.data || []);
    setPoLines(lineRes.data || []);
    setGoodsReceipts(grnRes.data || []);
    setReceiptLines(grnLineRes.data || []);
    setInvoices(invoiceRes.data || []);
    setInvoiceLines(invoiceLineRes.data || []);
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
      setError("RFQ adД±, mЙ™hsul, miqdar vЙ™ Й™n azД± bir vendor tЙ™lЙ™b olunur.");
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
      setNotice("TЙ™klif sorДџusu yaradД±ldД± vЙ™ vendor mГјqayisЙ™sinЙ™ gГ¶ndЙ™rildi.");
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
      setNotice("RFQ statusu yenilЙ™ndi.");
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
      .channel(`procurement:${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendors", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "goods_receipts", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_invoices", filter: `tenant_id=eq.${tenantId}` }, load)
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
              product_sku: sku,
              description: product?.name || line.description,
              unit_price: product ? String(product.price || 0) : line.unit_price,
              tax_rate: product ? String(product.vat_rate || 0) : line.tax_rate,
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
        label: `${line.product_sku}${line.description ? ` В· ${line.description}` : ""}`,
        ordered: line.qty_ordered,
        outstanding,
        qty_received: existingLine ? String(existingLine.qty_received) : String(outstanding || ""),
        qty_rejected: existingLine ? String(existingLine.qty_rejected || 0) : "0",
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
        label: `${line.product_sku}${line.description ? ` В· ${line.description}` : ""}`,
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
      setError("Vendor adД± tЙ™lЙ™b olunur.");
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
      setNotice(editingVendorId ? "Vendor mЙ™lumatlarД± yenilЙ™ndi." : "Vendor yaradД±ldД±.");
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
      is…12418 tokens truncated…"} icon={Receipt}>
        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.field}>
            <span>PO</span>
            <select value={form.po_id} onChange={(event) => setForm({ ...form, po_id: event.target.value })} required disabled={!!editingId}>
              <option value="">PO seГ§in</option>
              {poOptions.map((po) => (
                <option key={po.id} value={po.id}>{po.po_number} В· {po.vendors?.name || "Vendor"}</option>
              ))}
            </select>
          </label>
          <Field label="Faktura nГ¶mrЙ™si" value={form.invoice_number} onChange={(value) => setForm({ ...form, invoice_number: value })} required />
          <Field label="Faktura tarixi" type="date" value={form.invoice_date} onChange={(value) => setForm({ ...form, invoice_date: value })} />
          <Field label="Г–dЙ™niЕџ tarixi" type="date" value={form.due_date} onChange={(value) => setForm({ ...form, due_date: value })} />
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
              <strong>Faktura sЙ™tirlЙ™ri</strong>
              <small>{draftLines.length ? "QЙ™bul vЙ™ PO qiymЙ™ti ilЙ™ mГјqayisЙ™ olunacaq." : "PO seГ§dikdЙ™ sЙ™tirlЙ™r aГ§Д±lacaq."}</small>
            </div>
            {draftLines.map((line, index) => (
              <div key={line.po_line_id} style={styles.invoiceLineGrid}>
                <TwoLine title={line.label} subtitle={`SifariЕџ: ${qty(line.ordered)} В· QЙ™bul: ${qty(line.accepted)}`} />
                <input type="number" min="0" step="0.001" placeholder="Faktura miqdarД±" value={line.qty_invoiced} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, qty_invoiced: event.target.value } : item)))} style={styles.input} />
                <input type="number" min="0" step="0.0001" placeholder="Faktura qiymЙ™ti" value={line.unit_price} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, unit_price: event.target.value } : item)))} style={styles.input} />
                <input type="number" min="0" step="0.01" placeholder="ЖЏDV %" value={line.tax_rate} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, tax_rate: event.target.value } : item)))} style={styles.input} />
              </div>
            ))}
          </div>

          <div style={styles.formActions}>
            <IconButton icon={Save} label={editingId ? "Faktura yenilЙ™" : "Faktura yarat"} tone="primary" disabled={saving || !draftLines.length} submit />
            {editingId && <IconButton icon={X} label="LЙ™Дџv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>

      <Panel title="Faktura vЙ™ 3-way match" icon={FileText}>
        <DataTable
          columns={["Faktura", "Vendor / PO", "MЙ™blЙ™Дџ", "Status", "ЖЏmЙ™l"]}
          empty="Faktura yoxdur."
          rows={invoices.map((invoice) => {
            const isExpanded = expandedInvoice === invoice.id;
            return [
              <button key="invoice" type="button" style={styles.linkCell} onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)}>
                <TwoLine title={invoice.invoice_number} subtitle={`${invoice.invoice_date || "tarixsiz"} В· son Г¶dЙ™niЕџ ${invoice.due_date || "qeyd yoxdur"}`} />
              </button>,
              <TwoLine key="vendor" title={invoice.vendors?.name || "Vendor yoxdur"} subtitle={`PO ${invoice.purchase_orders?.po_number || "yoxdur"}`} />,
              money(invoiceTotals.get(invoice.id) || 0, invoice.currency),
              <StatusPill key="status" status={invoice.status} type="invoice" />,
              <div key="actions" style={styles.rowActions}>
                <IconButton icon={Eye} label={isExpanded ? "BaДџla" : "Bax"} onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)} />
                <IconButton icon={RefreshCw} label="Match" onClick={() => onMatch(invoice)} />
                <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(invoice)} disabled={invoice.status === "paid"} />
                {invoice.status === "matched" && <IconButton icon={CheckCircle2} label="TЙ™sdiq" onClick={() => onApprove(invoice)} tone="success" />}
                {["matched", "approved"].includes(invoice.status) && <IconButton icon={WalletCards} label="Г–dЙ™ndi" onClick={() => onPaid(invoice)} tone="success" />}
                {!["paid", "cancelled"].includes(invoice.status) && <IconButton icon={XCircle} label="LЙ™Дџv" onClick={() => onCancelInvoice(invoice)} tone="danger" />}
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
      columns={["SKU", "MЙ™hsul", "SifariЕџ", "MЙ™daxil", "Faktura", "QiymЙ™t", "CЙ™m"]}
      empty="PO sЙ™tri yoxdur."
      rows={lines.map((line) => [
        line.product_sku,
        line.description || "Д°zah yoxdur",
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
      columns={["SKU", "QЙ™bul edildi", "RЙ™dd edildi", "Net mЙ™daxil"]}
      empty="MЙ™daxil sЙ™tri yoxdur."
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
        columns={["SKU", "Faktura miqdarД±", "Faktura qiymЙ™ti", "CЙ™m"]}
        empty="Faktura sЙ™tri yoxdur."
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
          columns={["SKU", "PO", "MЙ™daxil", "Faktura", "QiymЙ™t", "NЙ™ticЙ™"]}
          empty="Match nЙ™ticЙ™si yoxdur."
          rows={matchRows.map((row) => [
            row.product_sku,
            qty(row.qty_ordered),
            qty(row.qty_accepted),
            qty(row.qty_invoiced),
            row.price_ok ? "UyДџun" : "FЙ™rq var",
            <span key="match" style={{ ...styles.badge, ...(row.status === "matched" ? styles.badge_success : styles.badge_warning) }}>
              {row.status === "matched" ? "UyДџundur" : row.status}
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
    minHeight: "100vh",
    background: "#f5f7fb",
    color: "#0f172a",
    padding: "24px",
    fontFamily: "Manrope, system-ui, sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "18px",
    maxWidth: "1440px",
    margin: "0 auto 18px",
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
  title: { margin: 0, fontFamily: "Sora, sans-serif", fontSize: "30px", color: "#0f172a" },
  subtitle: { margin: "6px 0 0", color: "#64748b" },
  metricGrid: {
    maxWidth: "1440px",
    margin: "0 auto 16px",
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "12px",
  },
  metricCard: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "16px",
    boxShadow: "0 8px 28px rgba(15, 23, 42, 0.05)",
  },
  metricIcon: { width: "44px", height: "44px", borderRadius: "10px", display: "grid", placeItems: "center" },
  metric_blue: { background: "#dbeafe", color: "#1d4ed8" },
  metric_amber: { background: "#fef3c7", color: "#b45309" },
  metric_green: { background: "#dcfce7", color: "#15803d" },
  metric_rose: { background: "#ffe4e6", color: "#be123c" },
  metricLabel: { display: "block", color: "#64748b", fontSize: "12px", fontWeight: 700 },
  metricValue: { display: "block", fontSize: "22px", marginTop: "2px" },
  metricHint: { display: "block", color: "#94a3b8", marginTop: "2px" },
  toolbar: { maxWidth: "1440px", margin: "0 auto 12px", display: "flex", gap: "10px", alignItems: "center" },
  searchBox: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    padding: "0 12px",
    minHeight: "42px",
    color: "#64748b",
  },
  searchInput: { flex: 1, border: 0, outline: 0, minHeight: "38px", font: "inherit", background: "transparent" },
  select: { height: "42px", border: "1px solid #e5e7eb", borderRadius: "10px", background: "#fff", padding: "0 12px", fontWeight: 700 },
  tabs: { maxWidth: "1440px", margin: "0 auto 16px", display: "flex", gap: "8px", flexWrap: "wrap" },
  tabButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "40px",
    padding: "0 14px",
    border: "1px solid #e5e7eb",
    borderRadius: "10px",
    background: "#fff",
    color: "#475569",
    fontWeight: 800,
    cursor: "pointer",
  },
  tabActive: { border: "1px solid #2563eb", color: "#1d4ed8", background: "#eff6ff" },
  panel: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "18px", boxShadow: "0 8px 28px rgba(15, 23, 42, 0.05)" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px" },
  panelTools: { display: "flex", alignItems: "center", gap: "8px", color: "#64748b" },
  dashboardGrid: { maxWidth: "1440px", margin: "0 auto", display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: "12px" },
  splitGrid: { maxWidth: "1440px", margin: "0 auto", display: "grid", gridTemplateColumns: "390px 1fr", gap: "12px" },
  stack: { maxWidth: "1440px", margin: "0 auto", display: "grid", gap: "12px" },
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
  receiptLineGrid: { display: "grid", gridTemplateColumns: "1.6fr 0.6fr 0.6fr", gap: "8px", alignItems: "center" },
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
  button_primary: { background: "#2563eb", color: "#fff", borderColor: "#2563eb" },
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
  flowRow: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" },
  flowItem: { border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px", background: "#f8fafc", display: "grid", gap: "5px" },
  compactRow: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eef2f7" },
  warningRow: { display: "flex", gap: "8px", alignItems: "center", padding: "10px", border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", borderRadius: "10px", marginBottom: "8px" },
  message: { maxWidth: "1440px", margin: "0 auto 12px", borderRadius: "10px", padding: "10px 42px 10px 12px", position: "relative", fontWeight: 800, fontSize: "13px" },
  messageOk: { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" },
  messageError: { background: "#ffe4e6", color: "#be123c", border: "1px solid #fecdd3" },
  messageClose: { position: "absolute", right: "10px", top: "8px", border: 0, background: "transparent", cursor: "pointer", color: "inherit" },
  emptyPanel: { maxWidth: "560px", margin: "90px auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "30px", textAlign: "center", display: "grid", gap: "10px", justifyItems: "center" },
  linkButton: { display: "inline-flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", borderRadius: "9px", padding: "10px 14px", textDecoration: "none", fontWeight: 800 },
};

