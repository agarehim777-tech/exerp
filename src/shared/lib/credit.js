import { addMonths, formatDateInput, formatPaymentDate, parsePaymentDate } from "../../services/date.js";
import { normalize } from "../../services/format.js";

export const creditTermOptions = [2, 3, 4, 5, 6, 12, 18, 24, 36, 48];
export const currentBusinessDate = formatDateInput(new Date());
export const baseCreditDate = currentBusinessDate;
export const dayInMs = 24 * 60 * 60 * 1000;

export function shiftPaymentDate(value, months) {
  const date = parsePaymentDate(value);
  if (!date) return baseCreditDate;
  date.setMonth(date.getMonth() + months);
  return formatDateInput(date);
}

export function getCreditPlanStartDate(credit) {
  const nextDate = parsePaymentDate(credit.next);
  if (!nextDate) return baseCreditDate;
  const nextInstallmentNumber = Math.max(1, Number(credit.paidMonths || 0) + 1);
  return shiftPaymentDate(formatDateInput(nextDate), -nextInstallmentNumber);
}

export function buildCreditPlan({ total, initialPayment = 0, months = 12, startDate = baseCreditDate }) {
  const term = creditTermOptions.includes(Number(months)) ? Number(months) : 12;
  const totalAmount = Math.max(0, Math.round(Number(total || 0)));
  const upfront = Math.min(totalAmount, Math.max(0, Math.round(Number(initialPayment || 0))));
  const balance = Math.max(0, totalAmount - upfront);
  let regularPayment = balance > 0 ? Math.round(balance / term) : 0;

  if (term > 1 && regularPayment * (term - 1) >= balance) {
    regularPayment = Math.floor(balance / term);
  }

  const installments = [];
  let accumulated = 0;

  for (let month = 1; month <= term; month += 1) {
    const isLast = month === term;
    const amount = isLast ? Math.max(0, balance - accumulated) : regularPayment;
    accumulated += amount;
    installments.push({
      month,
      amount,
      due: formatPaymentDate(addMonths(startDate, month)),
    });
  }

  return {
    total: totalAmount,
    initialPayment: upfront,
    balance,
    months: term,
    monthly: installments[0]?.amount || 0,
    lastPayment: installments[installments.length - 1]?.amount || 0,
    installments,
  };
}

export function getCreditDisplayPlan(credit) {
  const paidMonths = Number(credit.paidMonths || 0);
  const plan =
    Array.isArray(credit.installments) && credit.installments.length > 0
      ? {
          total: Number(credit.total || 0),
          initialPayment: Number(credit.initialPayment || 0),
          balance: Number(credit.balance ?? Math.max(0, credit.total - Number(credit.initialPayment || 0))),
          months: Number(credit.months || credit.installments.length),
          monthly: Number(credit.monthly ?? credit.installments[0]?.amount ?? 0),
          lastPayment: Number(
            credit.lastPayment ?? credit.installments[credit.installments.length - 1]?.amount ?? credit.monthly ?? 0,
          ),
          installments: credit.installments,
        }
      : (() => {
          const generatedPlan = buildCreditPlan({
          total: credit.total,
          initialPayment: credit.initialPayment || 0,
          months: credit.months,
          startDate: getCreditPlanStartDate(credit),
          });
          const installments = generatedPlan.installments.map((installment, index) =>
            index < paidMonths ? { ...installment, amount: 0 } : installment,
          );
          const paidPrincipal = generatedPlan.installments
            .slice(0, paidMonths)
            .reduce((sum, installment) => sum + Number(installment.amount || 0), 0);

          return {
            ...generatedPlan,
            balance:
              credit.balance === undefined
                ? Math.max(0, generatedPlan.balance - paidPrincipal)
                : Number(credit.balance || 0),
            installments,
          };
        })();

  return plan;
}

export function daysBetween(from, to) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / dayInMs);
}

export function addDays(dateValue, days) {
  const parsed = parsePaymentDate(dateValue);
  const date = parsed ? new Date(parsed.getTime()) : new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return parsePaymentDate(currentBusinessDate) || new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

export function roundMoney(value) {
  return Math.round(Number(value || 0));
}

export function isCreditClosed(credit, plan = getCreditDisplayPlan(credit)) {
  const status = normalize(credit?.status);
  const balance = Number(plan?.balance ?? credit?.balance ?? 0);
  const months = Number(plan?.months || credit?.months || 0);
  const paidMonths = Number(credit?.paidMonths || 0);

  return (
    status.includes("tamam") ||
    status.includes("bağlan") ||
    status.includes("baglan") ||
    status.includes("closed") ||
    balance <= 0 ||
    (months > 0 && paidMonths >= months)
  );
}

export function getCreditPaymentState(credit, plan = getCreditDisplayPlan(credit)) {
  if (isCreditClosed(credit, plan)) {
    return {
      nextInstallment: null,
      dueDate: null,
      daysOverdue: 0,
      isDueToday: false,
      isOverdue: false,
    };
  }

  const nextIndex = Math.min(Number(credit.paidMonths || 0), Math.max(0, plan.installments.length - 1));
  const scheduled = plan.installments[nextIndex] || plan.installments[0] || null;
  const due = credit.next && credit.next !== "—" ? credit.next : scheduled?.due;
  const nextInstallment = scheduled ? { ...scheduled, due } : null;
  const dueDate = parsePaymentDate(due);
  const today = parsePaymentDate(baseCreditDate);
  const dayDelta = dueDate && today ? daysBetween(dueDate, today) : 0;
  const statusOverdue = normalize(credit.status).includes("gecik");

  return {
    nextInstallment,
    dueDate,
    daysOverdue: Math.max(0, dayDelta),
    isDueToday: Boolean(dueDate && today && dayDelta === 0),
    isOverdue: Boolean((dueDate && today && dayDelta > 0) || statusOverdue),
  };
}

export function getCreditSourceLabel(credit) {
  return credit.salesSource || credit.orderId ? "Satışdan gələn" : "Manual kredit";
}

export function getCreditPaidTotal(plan) {
  return Math.max(0, Number(plan.total || 0) - Number(plan.balance || 0));
}

export function getCreditRemainingMonths(plan) {
  return (plan.installments || []).filter((installment) => Number(installment.amount || 0) > 0).length;
}

export function getCreditDebtFormula(item) {
  const paidTotal = getCreditPaidTotal(item.plan);
  return {
    total: Number(item.plan.total || 0),
    paid: paidTotal,
    balance: Number(item.plan.balance || 0),
    remainingMonths: getCreditRemainingMonths(item.plan),
    nextAmount: Number(item.paymentState.nextInstallment?.amount || 0),
  };
}

export function getCreditRiskLabel(item) {
  if (item.paymentState.isOverdue) return `${item.paymentState.daysOverdue} gün gecikib`;
  if (item.paymentState.isDueToday) return "Bu gün yığım";
  if (isCreditClosed(item.credit, item.plan)) return "Tamamlanıb";
  return "Aktiv izləmə";
}

export function matchesCreditDashboardFilter(item, filter) {
  if (filter === "Bu günə olan ödənişlər") return item.paymentState.isDueToday;
  if (filter === "Gecikən ödənişlər") return item.paymentState.isOverdue;
  if (filter === "Aktiv") return normalize(item.credit.status).includes("aktiv") && !isCreditClosed(item.credit, item.plan);
  if (filter === "Tamamlanan") return isCreditClosed(item.credit, item.plan);
  if (filter === "Satışdan gələn") return getCreditSourceLabel(item.credit) === "Satışdan gələn";
  if (filter === "Yüksək qalıq") return Number(item.plan.balance || 0) >= 3000;
  return true;
}

export function matchesCreditSourceFilter(item, sourceFilter) {
  return sourceFilter === "Bütün mənbələr" || getCreditSourceLabel(item.credit) === sourceFilter;
}

export const monthNamesAz = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "İyun",
  "İyul",
  "Avqust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

export function getCreditRowDate(item) {
  return parsePaymentDate(item.paymentState.nextInstallment?.due || item.credit.next || item.credit.date);
}

export function matchesCreditManagementFilter(item, filter) {
  if (filter === "Aktiv") return normalize(item.credit.status).includes("aktiv") && !isCreditClosed(item.credit, item.plan);
  if (filter === "Gözləyən") {
    return (
      !item.paymentState.isOverdue &&
      !item.paymentState.isDueToday &&
      !isCreditClosed(item.credit, item.plan)
    );
  }
  if (filter === "Gecikmiş") return item.paymentState.isOverdue;
  if (filter === "Bağlanmış") return isCreditClosed(item.credit, item.plan);
  if (filter === "Bugünkü") return item.paymentState.isDueToday;
  if (filter === "Cari ay") {
    const date = getCreditRowDate(item);
    const today = parsePaymentDate(baseCreditDate);
    return Boolean(date && today && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth());
  }
  return true;
}

export function matchesCreditSearch(item, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  const credit = item.credit;
  return normalize([
    credit.id,
    credit.customer,
    credit.fin,
    credit.contractId,
    credit.product,
    credit.device,
    credit.orderId,
    credit.warehouseName,
  ].join(" ")).includes(q);
}

export function getCreditInitials(name = "") {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("az-AZ");
}

export function getCreditManagementStatus(item) {
  if (isCreditClosed(item.credit, item.plan)) return "Bağlanmış";
  if (item.paymentState.isOverdue) return `${item.paymentState.daysOverdue} gün gecikib`;
  if (item.paymentState.isDueToday) return "Bugünkü ödəniş";
  return item.credit.status || "Aktiv";
}

export function applyCreditPrincipalPayment(credit, principalAmount) {
  const plan = getCreditDisplayPlan(credit);
  const requestedPrincipal = Math.max(0, Math.round(Number(principalAmount || 0)));
  const appliedPrincipal = Math.min(requestedPrincipal, plan.balance);
  let remainingPrincipal = appliedPrincipal;
  const startIndex = Math.min(Number(credit.paidMonths || 0), Math.max(0, plan.installments.length - 1));
  const currentDueBefore = Number(plan.installments[startIndex]?.amount || 0);
  const installments = plan.installments.map((installment, index) => ({
    ...installment,
    amount: index < startIndex ? 0 : Number(installment.amount || 0),
  }));

  for (let index = startIndex; index < installments.length && remainingPrincipal > 0; index += 1) {
    const dueAmount = Number(installments[index].amount || 0);
    const appliedToMonth = Math.min(dueAmount, remainingPrincipal);
    installments[index] = {
      ...installments[index],
      amount: Math.max(0, dueAmount - appliedToMonth),
    };
    remainingPrincipal -= appliedToMonth;
  }

  const nextIndex = installments.findIndex((installment) => Number(installment.amount || 0) > 0);
  const nextInstallment = nextIndex >= 0 ? installments[nextIndex] : null;
  const nextBalance = Math.max(0, plan.balance - appliedPrincipal);
  const extraPrincipal = Math.max(0, appliedPrincipal - currentDueBefore);

  return {
    appliedPrincipal,
    currentDueBefore,
    extraPrincipal,
    installments,
    nextBalance,
    nextPaidMonths: nextIndex >= 0 ? nextIndex : plan.months,
    nextDue: nextInstallment?.due || "—",
    nextMonthly: nextInstallment?.amount || 0,
    status: nextBalance <= 0 ? "Tamamlandı" : "Aktiv",
  };
}

export function getReceivableClosureAmount(row) {
  return Math.max(0, Number(row?.amount || 0));
}
