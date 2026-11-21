// RFQ (təklif sorğusu) əməliyyatları: siyahının yüklənməsi (köhnə tenant-ın gecikmiş cavabı atılır), yeni RFQ
// yaradılması (procurement və finance təsdiqi ilə), statusun yenilənməsi və seçilmiş vendorla PO formasına çevrilmə.
// ProcurementPage.jsx səhifənin ortaq setter-lərini və PO forma setter-lərini ötürür; RFQ məntiqini burada dəyişin.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { listWorkflowRecords as legacyListWorkflowRecords, saveWorkflowRecord as legacySaveWorkflowRecord } from "../../services/enterpriseWorkflows.js";
import { emptyPo, emptyPoLine, emptyRfq, getError, nextNumber } from "./procurementShared.jsx";

type Row = Record<string, any>;

// enterpriseWorkflows.js is untyped JS, so TypeScript would treat its optional arguments (status, lines, approvals) as required.
const listWorkflowRecords = legacyListWorkflowRecords as (args: Row) => Promise<Row[]>;
const saveWorkflowRecord = legacySaveWorkflowRecord as (args: Row) => Promise<unknown>;

export function useRfqActions({ tenantId, begin, setError, setNotice, setSaving, setPoForm, setPoDraftLines, setTab }: {
  tenantId: string | null | undefined;
  begin: (lane?: string) => () => boolean;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setSaving: (saving: boolean) => void;
  setPoForm: (form: Row) => void;
  setPoDraftLines: (lines: Row[]) => void;
  setTab: (tab: string) => void;
}) {
  const [rfqs, setRfqs] = useState<Row[]>([]);
  const [rfqForm, setRfqForm] = useState<Row>(emptyRfq);

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

  async function saveRfq(event: FormEvent) {
    event.preventDefault();
    if (!rfqForm.title.trim() || !rfqForm.description.trim() || Number(rfqForm.quantity) <= 0 || !rfqForm.vendor_ids.length) {
      setError("RFQ adı, məhsul, miqdar və ən azı bir təchizatçı tələb olunur.");
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
      setNotice("Təklif sorğusu yaradıldı və təchizatçı müqayisəsinə göndərildi.");
      await loadRfqs();
    } catch (rfqError) {
      setError(getError(rfqError));
    } finally {
      setSaving(false);
    }
  }

  async function updateRfq(rfq: Row, changes: Row) {
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

  function convertRfqToPo(rfq: Row) {
    const vendorId = rfq.payload?.selected_vendor_id || rfq.payload?.vendor_ids?.[0] || "";
    const line = rfq.workflow_lines?.[0];
    setPoForm({ ...emptyPo, vendor_id: vendorId, po_number: nextNumber("PO"), notes: `RFQ: ${rfq.record_no}` });
    setPoDraftLines([{ ...emptyPoLine, description: line?.description || rfq.title, qty_ordered: String(line?.quantity || 1) }]);
    setTab("po");
  }

  return { rfqs, rfqForm, setRfqForm, saveRfq, updateRfq, convertRfqToPo };
}
