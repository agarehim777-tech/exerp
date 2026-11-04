import { ENABLE_LEGACY_WRITES } from "../../config/legacyWrites.js";
import { supabase } from "../../integrations/supabase/client";
import { ensureMainCashAccount } from "../../services/cashAccounts.js";
import { postCreditPayment, startCreditContract } from "../../services/coreOperations.js";
import { money } from "../../services/format.js";
import { baseCreditDate } from "../lib/appDomain.jsx";
import { buildAllCreditRecords, getCreditIdForOrder } from "../lib/appHelpers.jsx";
import { applyCreditPrincipalPayment, buildCreditPlan, getCreditDisplayPlan, isCreditStarted } from "../lib/credit.js";
import { round2 } from "../utils/invoiceMath.js";

// Credit commands (payment schedule dates, payments, initial payments, activation, SMS),
// moved out of App.jsx unchanged. Payments and activation go through the server commands
// (postCreditPayment, startCreditContract); App passes in the state and its helpers.
export function createCreditActions({ activeTenantId, auditOperation, creditRecords, notify, refreshDbOrders, requirePermission, setState, state }) {
  function sendCreditSms() {
    if (!requirePermission("credits.manage", "kredit SMS göndərmək")) return;
    notify("SMS xidməti qoşulmayıb. Göndəriş icra olunmadı.", "warning");
  }

  function updateCreditPaymentDate(creditId, month, due) {
    if (!requirePermission("credits.manage", "kredit ödəniş tarixini dəyişmək")) return;

    const targetCredit = buildAllCreditRecords(state.orders, state.credits).find((credit) => credit.id === creditId);

    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return;
    }

    setState((current) => ({
      ...current,
      credits: (() => {
        const exists = current.credits.some((credit) => credit.id === creditId);
        const source = exists ? null : targetCredit;
        const nextCredits = exists ? current.credits : [source, ...current.credits];

        return nextCredits.map((credit) => {
          if (credit.id !== creditId) return credit;

          const plan = getCreditDisplayPlan(credit);
          const installments = plan.installments.map((installment) =>
            installment.month === month ? { ...installment, due } : installment,
          );
          const nextIndex = Math.min(Number(credit.paidMonths || 0), Math.max(0, installments.length - 1));

          return {
            ...credit,
            installments,
            next: installments[nextIndex]?.due || credit.next,
          };
        });
      })(),
    }));
    notify("Ödəniş tarixi yeniləndi.");
    auditOperation({
      module: "Kredit",
      action: "Ödəniş tarixi redaktə edildi",
      detail: `${creditId} · ${month}. ay · ${due}`,
    });
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

    if (!ENABLE_LEGACY_WRITES) {
      notify(`${targetCredit.contractId || targetCredit.id}: ${money(cashAmount)} kassaya daxil oldu.`);
      return true;
    }

    const cashEntry = {
      id: `KS-${Date.now()}`,
      source: "Kredit ödənişi",
      creditId,
      orderId: targetCredit.orderId,
      customer: targetCredit.customer,
      contractId: targetCredit.contractId,
      device: targetCredit.device || targetCredit.product,
      principal: paymentResult.appliedPrincipal,
      penalty: penaltyAmount,
      amount: cashAmount,
      date: baseCreditDate,
      note: values.note || "",
    };

    setState((current) => {
      return {
        ...current,
        cashEntries: [cashEntry, ...(current.cashEntries || [])],
        orders: current.orders.map((order) => {
          const isLinkedOrder = targetCredit.orderId
            ? order.id === targetCredit.orderId
            : order.creditId === creditId || getCreditIdForOrder(order) === creditId;

          if (!isLinkedOrder) return order;

          const nextPaid = Math.min(
            Number(order.amount || 0),
            Number(order.paid || 0) + paymentResult.appliedPrincipal,
          );

          return {
            ...order,
            paid: nextPaid,
            creditBalance: paymentResult.nextBalance,
            creditMonthly: paymentResult.nextMonthly,
            creditLastPayment: paymentResult.installments[paymentResult.installments.length - 1]?.amount || 0,
            paymentStatus: paymentResult.nextBalance <= 0 ? "Ödənilib" : "Kredit satış",
          };
        }),
        credits: (() => {
          const exists = current.credits.some((credit) => credit.id === creditId);
          const source = exists ? null : targetCredit;
          const nextCredits = exists ? current.credits : [source, ...current.credits];

          return nextCredits.map((item) =>
            item.id === creditId
              ? {
                ...item,
                balance: paymentResult.nextBalance,
                installments: paymentResult.installments,
                paidMonths: paymentResult.nextPaidMonths,
                rate: Math.round((paymentResult.nextPaidMonths / Math.max(1, Number(item.months || 12))) * 100),
                monthly: paymentResult.nextMonthly,
                next: paymentResult.nextDue,
                status: paymentResult.status,
                payments: [
                  {
                    date: baseCreditDate,
                    principal: paymentResult.appliedPrincipal,
                    penalty: penaltyAmount,
                    cashIn: cashAmount,
                    extraApplied: paymentResult.extraPrincipal,
                  },
                  ...(item.payments || []),
                ],
              }
              : item,
          );
        })(),
      };
    });

    notify(
      `${targetCredit.id}: ${money(cashAmount)} kassaya daxil oldu. Əsas borc ${money(paymentResult.appliedPrincipal)} azaldı.`,
    );
    auditOperation({
      module: "Kredit/Maliyyə",
      action: "Kredit ödənişi qəbul edildi",
      detail: `${creditId}: əsas ${money(paymentResult.appliedPrincipal)}, gecikmə ${money(penaltyAmount)}`,
    });
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

    const nextPaid = round2(alreadyPaid + payment);
    if (!ENABLE_LEGACY_WRITES) {
      notify(`${money(payment)} ilkin ödəniş kassaya qəbul edildi.`);
      return true;
    }
    setState((current) => ({
      ...current,
      cashEntries: [
        {
          id: `KS-${Date.now()}`,
          source: "Kredit ilkin ödənişi",
          creditId,
          orderId: targetCredit.orderId,
          customer: targetCredit.customer,
          contractId: targetCredit.contractId,
          amount: payment,
          principal: payment,
          penalty: 0,
          date: baseCreditDate,
          note: "İlkin ödəniş (beh)",
        },
        ...(current.cashEntries || []),
      ],
      orders: current.orders.map((order) => {
        const isLinkedOrder = targetCredit.orderId
          ? order.id === targetCredit.orderId
          : order.creditId === creditId || getCreditIdForOrder(order) === creditId;
        if (!isLinkedOrder) return order;
        return {
          ...order,
          paid: Math.min(Number(order.amount || 0), Number(order.paid || 0) + payment),
          initialPaid: nextPaid,
        };
      }),
      credits: (() => {
        const exists = current.credits.some((credit) => credit.id === creditId);
        const nextCredits = exists ? current.credits : [targetCredit, ...current.credits];
        return nextCredits.map((item) =>
          item.id === creditId ? { ...item, requiredInitial, initialPaid: nextPaid } : item,
        );
      })(),
    }));

    notify(`${money(payment)} ilkin ödəniş qəbul edildi. Yığılıb: ${money(nextPaid)} / ${money(requiredInitial)}.`);
    auditOperation({
      module: "Kredit/Maliyyə",
      action: "İlkin ödəniş qəbul edildi",
      detail: `${creditId}: ${money(payment)} · toplam ${money(nextPaid)}/${money(requiredInitial)}`,
    });
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

    if (!ENABLE_LEGACY_WRITES) {
      notify("Kredit başladıldı və ödəniş cədvəli aktiv edildi.");
      return true;
    }

    const plan = buildCreditPlan({
      total: targetCredit.total,
      initialPayment: targetCredit.initialPayment,
      months: targetCredit.months,
      startDate,
    });
    const startedAt = new Date().toISOString();
    const startedCredit = {
      ...targetCredit,
      status: "Aktiv",
      startDate,
      startedAt,
      installments: plan.installments,
      monthly: plan.monthly,
      lastPayment: plan.lastPayment,
      next: plan.installments[0]?.due || "—",
    };

    setState((current) => {
      const exists = current.credits.some((credit) => credit.id === creditId);
      return {
        ...current,
        credits: exists
          ? current.credits.map((credit) => (credit.id === creditId ? startedCredit : credit))
          : [startedCredit, ...current.credits],
      };
    });
    notify("Kredit başladıldı və ödəniş cədvəli aktiv edildi.");
    auditOperation({
      module: "Kredit",
      action: "Kredit başladıldı",
      detail: `${creditId} · başlanma ${startDate} · ilk ödəniş ${plan.installments[0]?.due || "—"}`,
    });
    return true;
  }

  return { sendCreditSms, updateCreditPaymentDate, receiveCreditPayment, payCreditInitial, startCredit };
}
