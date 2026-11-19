// Satıcı fakturasının ödənişi: ödəniş dialoqunu açma (kassa/bank və ƏDV hesablarını yükləmə) və server
// komandası ilə ödəmə (pay_vendor_invoice_atomic / pay_vendor_invoice_with_tax_atomic, idempotent request key).
// invoiceAttempt eyni cəhdin təkrarında eyni payload-u saxlayır. resetInvoicePayment sabitdir; səhifə onu
// load effect-ində çağırır. ProcurementPage.jsx ortaq setter-ləri ötürür; ödəniş məntiqini burada dəyişin.
import { useCallback, useRef, useState, type FormEvent } from "react";
import { supabase } from "../../integrations/supabase/client";
import { getError, toNumber, today } from "./procurementShared.jsx";

type Row = Record<string, any>;

export function useInvoicePayment({ tenantId, begin, saving, invoiceLinesByInvoice, load, setError, setNotice, setSaving }: {
  tenantId: string | null | undefined;
  begin: (key: string) => () => boolean;
  saving: boolean;
  invoiceLinesByInvoice: Map<string, Row[]>;
  load: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setSaving: (saving: boolean) => void;
}) {
  const invoiceAttempt = useRef<Row | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<Row | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<Row[]>([]);
  const [invoiceAccountId, setInvoiceAccountId] = useState("");
  const [taxAccounts, setTaxAccounts] = useState<Row[]>([]);
  const [invoiceTaxAccountId, setInvoiceTaxAccountId] = useState('');
  const [recoverableTax, setRecoverableTax] = useState(false);

  const resetInvoicePayment = useCallback(() => {
    setPayingInvoice(null); setPaymentAccounts([]); setInvoiceAccountId("");
    setTaxAccounts([]); setInvoiceTaxAccountId(''); setRecoverableTax(false);
    invoiceAttempt.current = null;
  }, []);

  async function openInvoicePayment(invoice: Row) {
    const isCurrent = begin('invoice-payment-dialog');
    const hasTax = (invoiceLinesByInvoice.get(invoice.id) || []).some(line => toNumber(line.tax_rate) > 0);
    // The server seeds "1400 Əvəzləşdirilən ƏDV" for every tenant (migration 20261119120000); the browser cannot call
    // ensure_inventory_accounts (EXECUTE is revoked from authenticated), so the old call here always failed silently.
    const [accounts, tax] = await Promise.all([
      supabase.from("cash_accounts").select("id,name,currency,gl_account_id")
        .eq("tenant_id", tenantId!).eq("is_active", true).eq("currency", invoice.currency),
      hasTax ? supabase.from('chart_of_accounts').select('id,code,name').eq('tenant_id', tenantId!)
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

  async function payInvoice(event: FormEvent) {
    event.preventDefault();
    if (saving || !invoiceAccountId || (payingInvoice!.hasTax && (!invoiceTaxAccountId || !recoverableTax))) return;
    setSaving(true); setError("");
    const isCurrent = begin('invoice-payment');
    try {
        if (invoiceAttempt.current?.invoice_id !== payingInvoice!.id || invoiceAttempt.current?.account_id !== invoiceAccountId
          || invoiceAttempt.current?.tax_account_id !== (payingInvoice!.hasTax ? invoiceTaxAccountId : undefined)) {
          invoiceAttempt.current = { invoice_id: payingInvoice!.id, account_id: invoiceAccountId, payment_date: today(),
            ...(payingInvoice!.hasTax ? { tax_account_id: invoiceTaxAccountId, tax_treatment: 'recoverable' } : {}) };
        }
      const { error: paymentError } = await supabase.rpc(payingInvoice!.hasTax ? 'pay_vendor_invoice_with_tax_atomic' : "pay_vendor_invoice_atomic", {
        _tenant_id: tenantId!, _request_key: `invoice-payment:${payingInvoice!.id}`,
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

  return {
    payingInvoice, setPayingInvoice, paymentAccounts, invoiceAccountId, setInvoiceAccountId, taxAccounts,
    invoiceTaxAccountId, setInvoiceTaxAccountId, recoverableTax, setRecoverableTax,
    resetInvoicePayment, openInvoicePayment, payInvoice,
  };
}
