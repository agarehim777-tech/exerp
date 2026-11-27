import { supabase } from "../../integrations/supabase/client";
import { ensureMainCashAccount } from "../../services/cashAccounts.js";
import { postCreditPayment, rescheduleCreditInstallment, startCreditContract } from "../../services/coreOperations.js";
import { money } from "../../services/format.js";
import { applyCreditPrincipalPayment, isCreditStarted } from "../lib/credit.js";
import { round2 } from "../utils/invoiceMath.js";

// Credit commands (payment schedule dates, payments, initial payments, activation, SMS).
// All of them go through the server commands
// (rescheduleCreditInstallment, postCreditPayment, startCreditContract); there is no browser credits list.
export function createCreditActions({ activeTenantId, auditOperation, creditRecords, notify, refreshDbOrders, requirePermission }) {
  function sendCreditSms() {
    if (!requirePermission("credits.manage", "kredit SMS göndərmək")) return;
    notify("SMS xidməti qoşulmayıb. Göndəriş icra olunmadı.", "warning");
  }

  async function updateCreditPaymentDate(creditId, month, due) {
    if (!requirePermission("credits.manage", "kredit ödəniş tarixini dəyişmək")) return false;
    const targetCredit = creditRecords.find((credit) => credit.id === creditId);
    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return false;
    }
    if (!isCreditStarted(targetCredit)) {
      notify("Ödəniş tarixləri kredit başladıldıqdan sonra dəyişdirilə bilər.", "warning");
      return false;
    }
    try {
      if (!activeTenantId) throw new Error("Şirkət seçilməyib.");
      await rescheduleCreditInstallment({ tenantId: activeTenantId, creditId, installmentNo: Number(month), dueDate: due });
      await refreshDbOrders();
    } catch (error) {
      notify(`Ödəniş tarixi dəyişdirilmədi: ${error.message || error}`, "error");
      return false;
    }
    notify("Ödəniş tarixi yeniləndi.");
    auditOperation({
      module: "Kredit",
      action: "Ödəniş tarixi redaktə edildi",
      detail: `${creditId} · ${month}. ay · ${due}`,
    });
    return true;
  }

  async function receiveCreditPayment(creditId, values) {
    if (!requirePermission("credits.manage", "kredit ödənişi qəbul etmək")) return false;

    const principalAmount = Math.max(0, round2(Number(values.principalAmount || 0)));
    const penaltyAmount = Math.max(0, round2(Number(values.penaltyAmount || 0)));
    const targetCredit = creditRecords.find((credit) => credit.id === creditId);

    if (principalAmount <= 0 && penaltyAmount <= 0) {
      notify("Ödəniş məbləği daxil edin.", "warning");
      return false;
    }

    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return false;
    }

    if (!isCreditStarted(targetCredit)) {
      notify("Ödəniş qəbul etmək üçün əvvəlcə krediti başladın.", "warning");
      return false;
    }
    if (!activeTenantId || !targetCredit.id || !values.receiptNo) {
      notify("Server bağlantısı və qəbz açarı olmadan ödəniş qəbul edilmir.", "error");
      return false;
    }

    const paymentResult = applyCreditPrincipalPayment(targetCredit, principalAmount);
    const cashAmount = paymentResult.appliedPrincipal + penaltyAmount;
    try {
      if (activeTenantId && targetCredit.id) {
        const cashAccount = await ensureMainCashAccount(activeTenantId);

        await postCreditPayment({
          tenantId: activeTenantId,
          creditId: targetCredit.id,
          receiptNo: values.receiptNo,
          amount: cashAmount,
          penaltyAmount,
          cashAccountId: cashAccount.id,
          paymentMethod: "cash",
          note: values.note || null,
        });
        await refreshDbOrders();
      }
    } catch (error) {
      notify(`Kredit ödənişi qeydə alınmadı: ${error.message}`, "error");
      return false;
    }

    notify(`${targetCredit.contractId || targetCredit.id}: ${money(cashAmount)} kassaya daxil oldu.`);
    return true;
  }

  async function payCreditInitial(creditId, amount) {
    if (!requirePermission("credits.manage", "ilkin ödəniş qəbul etmək")) return false;
    const targetCredit = creditRecords.find((credit) => credit.id === creditId);
    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return false;
    }
    const requiredInitial = Number(targetCredit.requiredInitial ?? targetCredit.initialPayment ?? 0);
    const alreadyPaid = Number(targetCredit.initialPaid ?? 0);
    const payment = Math.min(Math.max(0, round2(Number(amount || 0))), Math.max(0, round2(requiredInitial - alreadyPaid)));
    if (payment <= 0) {
      notify("Qəbul ediləcək məbləğ düzgün deyil.", "warning");
      return false;
    }

    try {
      if (!activeTenantId || !targetCredit.salesSource || !targetCredit.id) throw new Error("Kreditin server bağlantısı tapılmadı.");
      if (activeTenantId && targetCredit.salesSource && targetCredit.id) {
        const cashAccount = await ensureMainCashAccount(activeTenantId);
        const { error: rpcError } = await supabase.rpc("post_credit_initial_payment", {
          _tenant_id: activeTenantId,
          _credit_id: targetCredit.id,
          _amount: payment,
          _cash_account_id: cashAccount.id,
          _note: "İlkin ödəniş (beh) qəbulu",
        });
        if (rpcError) throw rpcError;
        await refreshDbOrders();
      }
    } catch (error) {
      notify(`İlkin ödəniş qeydə alınmadı: ${error.message}`, "error");
      return false;
    }

    notify(`${money(payment)} ilkin ödəniş kassaya qəbul edildi.`);
    return true;
  }


  async function startCredit(creditId, startDate) {
    if (!requirePermission("credits.manage", "krediti başlatmaq")) return false;
    const targetCredit = creditRecords.find((credit) => credit.id === creditId);
    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return false;
    }
    if (isCreditStarted(targetCredit)) {
      notify("Bu kredit artıq başladılıb.", "warning");
      return false;
    }
    const requiredInitial = Number(targetCredit.requiredInitial ?? targetCredit.initialPayment ?? 0);
    const initialPaid = Number(targetCredit.initialPaid ?? 0);
    if (round2(requiredInitial - initialPaid) > 0) {
      notify(
        `İlkin ödəniş tamamlanmayıb: ${money(initialPaid)} / ${money(requiredInitial)}. Kredit başladıla bilməz.`,
        "warning",
      );
      return false;
    }

    try {
      if (!activeTenantId || !targetCredit.id) throw new Error("Kreditin database bağlantısı tapılmadı.");
      await startCreditContract({ tenantId: activeTenantId, creditId: targetCredit.id, startDate });
      await refreshDbOrders();
    } catch (error) {
      notify(`Kredit başladılmadı: ${error.message || error}`, "error");
      return false;
    }

    notify("Kredit başladıldı və ödəniş cədvəli aktiv edildi.");
    return true;
  }

  return { sendCreditSms, updateCreditPaymentDate, receiveCreditPayment, payCreditInitial, startCredit };
}
