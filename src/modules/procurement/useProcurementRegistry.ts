// Satınalma reyestrinin yüklənməsi: tenant üzrə vendorlar, məhsullar, PO və sətirləri, mal qəbulları, vendor fakturaları
// və (köhnə cədvəl varsa) PO ödənişləri. Hər oxu readAllRows ilə səhifələnir; köhnə tenant-ın gecikmiş cavabı
// isCurrent() ilə atılır. ProcurementPage.jsx load()-u əməliyyatlardan sonra və realtime resync-də çağırır.
import { useCallback, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { readAllRows } from "../../services/readAllRows.js";
import { isMissingPoPaymentsTable, readLegacyPoPayments } from "./procurementSchema.js";
import { ENABLE_LEGACY_PAYMENTS, getError } from "./procurementShared.jsx";

type Row = Record<string, any>;

export interface ProcurementRegistry {
  loading: boolean;
  registryLoaded: boolean;
  vendors: Row[];
  products: Row[];
  purchaseOrders: Row[];
  poLines: Row[];
  goodsReceipts: Row[];
  receiptLines: Row[];
  invoices: Row[];
  invoiceLines: Row[];
  poPayments: Row[];
  poPaymentsAvailable: boolean;
  load: () => Promise<void>;
}

export function useProcurementRegistry({ tenantId, begin, setError }: {
  tenantId: string | null | undefined;
  begin: (lane?: string) => () => boolean;
  setError: (message: string) => void;
}): ProcurementRegistry {
  const [loading, setLoading] = useState(true);
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [vendors, setVendors] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<Row[]>([]);
  const [poLines, setPoLines] = useState<Row[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<Row[]>([]);
  const [receiptLines, setReceiptLines] = useState<Row[]>([]);
  const [invoices, setInvoices] = useState<Row[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<Row[]>([]);
  const [poPayments, setPoPayments] = useState<Row[]>([]);
  const [poPaymentsAvailable, setPoPaymentsAvailable] = useState(ENABLE_LEGACY_PAYMENTS);

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

  return {
    loading, registryLoaded, vendors, products, purchaseOrders, poLines, goodsReceipts, receiptLines,
    invoices, invoiceLines, poPayments, poPaymentsAvailable, load,
  };
}
