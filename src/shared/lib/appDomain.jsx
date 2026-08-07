import { AvatarLine, DataTable, EmptyState, Panel, PanelHeader, ProgressRow, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { Building2, Check, ChevronRight, CreditCard, Download, FileText, Filter, Package, Pencil, Plus, Trash2, Users, Wallet, X } from "lucide-react";
import { daysBetween, getCreditDisplayPlan, getCreditInitials, getCreditManagementStatus, getCreditPaidTotal, getCreditPaymentState, getCreditSourceLabel, isCreditClosed } from "../../shared/lib/credit.js";
import { money, normalize, percent } from "../../services/format.js";
import { navItems, stages } from "../../data.js";
import { formatDateInput, parsePaymentDate } from "../../services/date.js";
import { total } from "../../shared/utils/aggregate.js";
import { useEffect, useMemo, useState } from "react";
import { daysBetween, roundMoney } from "./credit.js";
export function buildAccountingCloseChecklist(accounting, closeRun) {
  const { balance, pl, cashFlow, journalRows, chartRows } = accounting;
  const cashAccount = chartRows.find((row) => row.code === "1010");
  const equationDiff = Math.round(Number(balance.assets || 0) - Number(balance.liabilities || 0) - Number(balance.equity || 0));
  const cashDiff = Math.round(Number(cashAccount?.balance || 0) - Number(cashFlow.closing || 0));
  const checks = [
    {
      label: "Balans bərabərliyi",
      detail: `Aktiv - öhdəlik - kapital = ${money(equationDiff)}`,
      status: Math.abs(equationDiff) <= 1 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Kassa uzlaşması",
      detail: `1010 hesabı ilə cash-flow fərqi ${money(cashDiff)}`,
      status: Math.abs(cashDiff) <= 1 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Jurnal yazılışları",
      detail: `${journalRows.length} jurnal sətri formalaşıb`,
      status: journalRows.length > 0 ? "Tamamlandı" : "Gözləyir",
    },
    {
      label: "ƏDV öhdəliyi",
      detail: `${money(accounting.vatPayable)} öhdəlik hesablandı`,
      status: Number(accounting.vatPayable || 0) >= 0 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Ay bağlanışı",
      detail: closeRun ? `${closeRun.period} export edilib` : "Jurnal export gözləyir",
      status: closeRun ? "Tamamlandı" : "Gözləyir",
    },
  ];

  return {
    checks,
    readyCount: checks.filter((check) => check.status === "Tamamlandı").length,
    warningCount: checks.filter((check) => check.status !== "Tamamlandı").length,
    equationDiff,
    cashDiff,
    closeReady: checks.every((check) => check.status === "Tamamlandı"),
    retainedEarnings: Number(pl.netProfit || 0),
  };
}

export function buildSupportTicketContext(ticket, { orders = [], credits = [], customers = [], conversations = [] }) {
  const order =
    orders.find((item) => item.id === ticket.orderId || (ticket.linkedType === "order" && item.id === ticket.linkedId)) ||
    orders.find((item) => item.creditId === ticket.creditId);
  const credit =
    credits.find((item) => item.id === ticket.creditId || (ticket.linkedType === "credit" && item.id === ticket.linkedId)) ||
    credits.find((item) => item.orderId === order?.id);
  const customer =
    customers.find((item) => item.fin === ticket.fin || item.fin === order?.fin || item.fin === credit?.fin) ||
    customers.find((item) => normalize(item.name) === normalize(ticket.customer || order?.customer || credit?.customer));
  const thread = conversations.find((conversation) => conversation.id === getSupportThreadId(ticket) || conversation.ticketId === ticket.id);
  const comments = Array.isArray(ticket.comments) ? ticket.comments : [];
  const linkedLabel =
    ticket.linkedLabel ||
    credit?.contractId ||
    order?.id ||
    customer?.name ||
    ticket.linkedId ||
    "Ümumi task";

  return {
    ...ticket,
    order,
    credit,
    customerRecord: customer,
    thread,
    comments,
    linkedLabel,
    commentCount: comments.length + (thread?.messages?.length || 0),
    latestComment: comments[comments.length - 1]?.text || thread?.preview || "Comment yoxdur",
  };
}

export function getSupportThreadId(ticket) {
  return ticket.threadId || `MSG-${ticket.id}`;
}

export function buildKpiEmployeeScoreRows(employees = [], salesBonuses = []) {
  const bonusBySeller = salesBonuses.reduce((map, row) => {
    const key = normalize(row.seller);
    if (!key) return map;
    const current = map.get(key) || { orders: 0, paid: 0, bonus: 0 };
    current.orders += 1;
    current.paid += Number(row.paid || 0);
    current.bonus += Number(row.bonusAmount || 0);
    map.set(key, current);
    return map;
  }, new Map());

  return buildHrEmployeeRecords(employees).map((employee) => {
    const sellerBonus = bonusBySeller.get(normalize(employee.name)) || { orders: 0, paid: 0, bonus: 0 };
    const performanceBonus = Number(employee.bonus || 0);
    const salesBonus = Math.round(sellerBonus.bonus || 0);
    const payoutAmount = performanceBonus + salesBonus;

    return {
      ...employee,
      salesOrders: sellerBonus.orders,
      salesPaid: Math.round(sellerBonus.paid || 0),
      salesBonus,
      performanceBonus,
      payoutAmount,
      payoutStatus: payoutAmount > 0 ? "Payout hazır" : Number(employee.kpi || 0) < 95 ? "Hədəfdən aşağı" : "İzləmə",
    };
  });
}

export function getKpiPeriodKey(date = currentBusinessDate) {
  return String(date || currentBusinessDate).slice(0, 7);
}

export const currentBusinessDate = formatDateInput(new Date());

export function buildHrEmployeeRecords(employees, leaveRequests = []) {
  const leaveUsage = buildHrLeaveUsageMap(leaveRequests);
  return employees.map((employee) => {
    const salary = Number(employee.salary || 0);
    const kpi = Number(employee.kpi || 0);
    const bonus = kpi >= 105 ? Math.round(salary * 0.14) : kpi >= 95 ? Math.round(salary * 0.07) : 0;
    const payrollTax = calculatePayrollTax2026(salary + bonus);
    const tax = payrollTax.incomeTax;
    const social = payrollTax.employeeSocial + payrollTax.employeeUnemployment;
    const netSalary = payrollTax.net;
    const documentReviewRequired = Boolean(employee.documentReviewRequired || employee.hrStatus === "Məlumat gözləyir");
    const documentsComplete = documentReviewRequired ? Number(employee.documentsComplete || 0) : 100;
    const attendanceRate = Number(employee.attendanceRate || 0);
    const lateDays = Number(employee.lateDays || 0);
    const employeeKey = getEmployeeKey(employee);
    const leave = leaveUsage.get(employeeKey) || leaveUsage.get(employee.name) || { approved: 0, pending: 0 };
    const baseLeaveBalance = Number(employee.leaveBalance || 0);
    const usedLeave = Number(employee.usedLeave || 0) + Number(leave.approved || 0);
    const leaveBalance = Math.max(0, baseLeaveBalance - Number(leave.approved || 0));
    const documentHealth = getHrDocumentHealth({ ...employee, documentsComplete });
    const payrollStatus =
      employee.payrollPaidAt
        ? "Ödənildi"
        : documentHealth.missingCount > 0
          ? "Sənəd gözləyir"
          : employee.payrollStatus || "Hesablama hazırdır";

    return {
      ...employee,
      employeeKey,
      level: getEmployeeLevel(employee),
      managerName: getEmployeeManagerName(employee, employees),
      hireDate: employee.hireDate || "",
      workMode: employee.workMode || "Təyin edilməyib",
      shift: employee.shift || "Təyin edilməyib",
      employmentType: employee.employmentType || "Təyin edilməyib",
      leaveBalance,
      leaveBaseBalance: baseLeaveBalance,
      usedLeave,
      pendingLeaveDays: Number(leave.pending || 0),
      attendanceRate,
      lateDays,
      documentsComplete,
      documentRows: documentHealth.documents,
      documentStatus: documentHealth.status,
      missingDocumentCount: documentHealth.missingCount,
      skills: Array.isArray(employee.skills) ? employee.skills : [],
      nextReview: employee.nextReview || "",
      bonus,
      tax,
      social,
      employerSocial: payrollTax.employerSocial,
      employerUnemployment: payrollTax.employerUnemployment,
      employerCost: payrollTax.employerCost,
      netSalary,
      payrollStatus,
      payrollPeriod: employee.payrollPeriod || baseFinanceDate.slice(0, 7),
      payrollPaidAt: employee.payrollPaidAt || "",
      hrStatus: employee.hrStatus || "Stabil",
    };
  });
}

export function buildHrLeaveUsageMap(leaveRequests = []) {
  return leaveRequests.reduce((map, request) => {
    const key = request.employeeId || request.employeeName;
    if (!key) return map;
    const current = map.get(key) || { approved: 0, pending: 0 };
    if (request.status === "Təsdiq edildi") current.approved += Number(request.days || 0);
    if (request.status === "Təsdiq gözləyir") current.pending += Number(request.days || 0);
    map.set(key, current);
    if (request.employeeName && request.employeeName !== key) {
      const byName = map.get(request.employeeName) || { approved: 0, pending: 0 };
      if (request.status === "Təsdiq edildi") byName.approved += Number(request.days || 0);
      if (request.status === "Təsdiq gözləyir") byName.pending += Number(request.days || 0);
      map.set(request.employeeName, byName);
    }
    return map;
  }, new Map());
}

export function calculatePayrollTax2026(grossValue) {
  const gross = Math.max(0, roundMoney(grossValue));
  const incomeTax =
    gross <= 2500
      ? Math.max(0, Math.round((gross - 200) * 0.03))
      : gross <= 8000
        ? Math.round(75 + (gross - 2500) * 0.1)
        : Math.round(625 + (gross - 8000) * 0.14);
  const employeeSocial = gross <= 200 ? Math.round(gross * 0.03) : Math.round(6 + (gross - 200) * 0.1);
  const employerSocial =
    gross <= 200
      ? Math.round(gross * 0.22)
      : gross <= 8000
        ? Math.round(44 + (gross - 200) * 0.15)
        : Math.round(44 + 7800 * 0.15 + (gross - 8000) * 0.11);
  const employeeUnemployment = Math.round(gross * 0.005);
  const employerUnemployment = Math.round(gross * 0.005);
  const totalDeductions = incomeTax + employeeSocial + employeeUnemployment;

  return {
    gross,
    incomeTax,
    employeeSocial,
    employeeUnemployment,
    totalDeductions,
    net: Math.max(0, gross - totalDeductions),
    employerSocial,
    employerUnemployment,
    employerCost: gross + employerSocial + employerUnemployment,
  };
}

export function getEmployeeKey(employee = {}) {
  return employee.id || `EMP-${normalize(employee.name)}`;
}

export function getHrDocumentHealth(record = {}) {
  const documents = getHrDocumentRows(record);
  const missing = documents.filter((document) => !document.complete);
  return {
    documents,
    missingCount: missing.length,
    status:
      missing.length === 0
        ? "Tamam"
        : missing.some((document) => document.status === "Yenilənməlidir")
          ? "Yenilənməlidir"
          : "Təsdiq gözləyir",
  };
}

export function getEmployeeLevel(employee) {
  if (employee.level) return employee.level;

  const position = normalize(employee.position);
  if (position.includes("direktor")) return "Rəhbərlik";
  if (position.includes("baş") || position.includes("rəhbər")) return "Şöbə rəhbəri";
  return "Komanda üzvü";
}

export function getEmployeeManagerName(employee, employees) {
  const savedManager = getEmployeeManager(employee, employees);
  if (savedManager) return savedManager.name;
  if (employee.managerName !== undefined) return employee.managerName;

  const position = normalize(employee.position);
  if (position.includes("direktor") || position.includes("baş") || position.includes("rəhbər")) return "";

  const departmentLead = employees.find((item) => {
    if (item.name === employee.name || item.department !== employee.department) return false;
    const leadPosition = normalize(item.position);
    return leadPosition.includes("baş") || leadPosition.includes("rəhbər");
  });

  return departmentLead?.name || "";
}

export const baseFinanceDate = currentBusinessDate;

export function getEmployeeManager(employee, employees = []) {
  const employeeKey = getEmployeeKey(employee);
  const byId = employee.managerId
    ? employees.find((item) => getEmployeeKey(item) === employee.managerId)
    : null;
  if (byId && getEmployeeKey(byId) !== employeeKey) return byId;

  const byName = employee.managerName
    ? employees.find((item) => item.name === employee.managerName && getEmployeeKey(item) !== employeeKey)
    : null;
  return byName || null;
}

export function getHrDocumentRows(employee = {}) {
  const score = Math.max(0, Math.min(100, Number(employee.documentsComplete || 0)));
  const rows = [
    { key: "identity", title: "Şəxsiyyət/FİN", threshold: 25 },
    { key: "contract", title: "Əmək müqaviləsi", threshold: 60 },
    { key: "job", title: "Vəzifə təlimatı", threshold: 80 },
    { key: "policy", title: "NDA / daxili qaydalar", threshold: 100 },
  ];

  return rows.map((row) => {
    const complete = score >= row.threshold;
    const critical = !complete && row.threshold <= 60;
    return {
      ...row,
      complete,
      status: complete ? "Tamam" : critical ? "Yenilənməlidir" : "Təsdiq gözləyir",
      progress: Math.min(100, Math.round((score / row.threshold) * 100)),
    };
  });
}

export function buildReceivableAgingSummary(rows = []) {
  const buckets = ["Cari", "1-30 gün", "31-60 gün", "61-90 gün", "90+ gün"];
  return buckets.map((bucket) => {
    const bucketRows = rows.filter((row) => row.agingBucket === bucket);
    return {
      bucket,
      count: bucketRows.length,
      amount: bucketRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  });
}

export const currentBusinessYear = currentBusinessDate.slice(0, 4);

export function buildInvoiceControlSummary(invoices) {
  const today = parsePaymentDate(currentBusinessDate);
  const openInvoices = invoices.filter((invoice) => Number(invoice.balance || 0) > 0);
  const overdue = openInvoices.filter((invoice) => {
    const dueDate = parsePaymentDate(invoice.dueDate);
    return dueDate && today && daysBetween(dueDate, today) > 0;
  });
  const dueSoon = openInvoices.filter((invoice) => {
    const dueDate = parsePaymentDate(invoice.dueDate);
    if (!dueDate || !today) return false;
    const diff = daysBetween(today, dueDate);
    return diff >= 0 && diff <= 7;
  });

  return {
    sent: invoices.filter((invoice) => invoice.invoiceSentAt || invoice.eTaxStatus === "E-qaimə göndərildi").length,
    ready: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
    overdueCount: overdue.length,
    overdueBalance: total(overdue, "balance"),
    dueSoonCount: dueSoon.length,
    dueSoonBalance: total(dueSoon, "balance"),
    openBalance: total(openInvoices, "balance"),
  };
}

export function buildInvoiceAgingRows(invoices) {
  const buckets = ["Vaxtında", "1-7 gün", "8-30 gün", "30+ gün", "Ödənilib"];
  const rows = buckets.map((bucket) => ({
    bucket,
    count: 0,
    balance: 0,
    total: 0,
  }));
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));

  invoices.forEach((invoice) => {
    const bucket = getInvoiceAgingBucket(invoice);
    const row = byBucket.get(bucket);
    if (!row) return;
    row.count += 1;
    row.balance += Number(invoice.balance || 0);
    row.total += Number(invoice.totalAmount || 0);
  });

  return rows;
}

export function InvoicePrintModal({ invoice, invoiceSettings = {}, onClose }) {
  function downloadHtml() {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.id}</title></head><body><h1>${invoice.id}</h1><p>${invoice.customer}</p><p>${invoice.products}</p><p>Cəmi: ${money(invoice.totalAmount)}</p><p>ƏDV: ${money(invoice.vatAmount)}</p></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.id}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card invoice-print-card">
        <div className="modal-head">
          <div>
            <h2>{invoice.id}</h2>
            <p>Faktura/e-qaimə çap görünüşü və HTML/PDF export hazırlığı.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <section className="invoice-paper">
          <div className="invoice-paper-head">
            <div>
              <span>Satıcı</span>
              <strong>{invoice.seller}</strong>
              <small>VÖEN {invoice.voen}</small>
            </div>
            <div>
              <span>Faktura</span>
              <strong>{invoice.id}</strong>
              <small>{invoice.date} · {invoice.currency}</small>
            </div>
          </div>
          <div className="invoice-paper-grid">
            <TwoLine title="Alıcı" subtitle={`${invoice.customer} · FİN ${invoice.fin}`} />
            <TwoLine title="Sifariş/Müqavilə" subtitle={`${invoice.orderId} · ${invoice.contractId}`} />
            <TwoLine title="Ödəniş tipi" subtitle={invoice.paymentMethod} />
            <TwoLine title="Son tarix" subtitle={invoice.dueDate} />
          </div>
          <div className="invoice-product-box">
            <span>Məhsul/Xidmət</span>
            <strong>{invoice.products}</strong>
          </div>
          <div className="invoice-total-grid">
            <TwoLine title="Net məbləğ" subtitle={money(invoice.netAmount)} />
            <TwoLine title={`ƏDV ${invoiceSettings.vatRate || 18}%`} subtitle={money(invoice.vatAmount)} />
            <TwoLine title="Cəmi" subtitle={money(invoice.totalAmount)} />
            <TwoLine title="Qalıq" subtitle={invoice.balance > 0 ? money(invoice.balance) : "Yoxdur"} />
          </div>
          <StatusBadge status={invoice.eTaxStatus} />
        </section>
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={downloadHtml}>
            <Download size={16} />
            HTML export
          </button>
          <button type="button" className="primary-btn" onClick={() => window.print()}>
            <FileText size={16} />
            Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function getInvoiceAgingBucket(invoice) {
  if (Number(invoice.balance || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(invoice.dueDate);
  const today = parsePaymentDate(currentBusinessDate);
  const days = dueDate && today ? daysBetween(dueDate, today) : 0;
  if (days <= 0) return "Vaxtında";
  if (days <= 7) return "1-7 gün";
  if (days <= 30) return "8-30 gün";
  return "30+ gün";
}

export function enrichDeliveryOrder(order) {
  const stageIndex = getDeliveryStageIndex(order);
  return {
    ...order,
    stageIndex,
    progress: ((stageIndex + 1) / stages.length) * 100,
    ageDays: getDeliveryAgeDays(order),
    risk: getDeliveryRisk(order),
    balance: getOrderBalance(order),
    deliveryStatusText: getOrderDeliveryStatus(order),
  };
}

export function getDeliveryStockCheck(order, warehouseStock = {}) {
  if (!order) {
    return { ok: false, status: "Sifariş yoxdur", reason: "Sifariş tapılmadı.", issues: [] };
  }

  if (order.status === "Təhvil verilib") {
    return { ok: false, status: "Təhvil verilib", reason: "Bu sifariş artıq təhvil verilib.", issues: [], plan: null };
  }

  const productLines = normalizeOrderProductLines(order.productLines || []);
  if (productLines.length === 0) {
    return { ok: false, status: "Məhsul yoxdur", reason: "Sifarişdə təhvil veriləcək məhsul yoxdur.", issues: [] };
  }

  const warehouseId = order.warehouseId;
  if (!warehouseId) {
    return { ok: false, status: "Anbar seçilməyib", reason: "Sifariş üçün anbar seçilməyib.", issues: [] };
  }

  const plan = getDeliveryPlan({ ...order, warehouseId }, warehouseStock);

  if (plan.remainingTotal === 0) {
    return { ok: false, status: "Təhvil verilib", reason: "Sifarişin bütün məhsulları təhvil verilib.", issues: [], plan };
  }

  const issues = plan.lines
    .filter((line) => line.shortage > 0)
    .map(
      (line) =>
        `${line.product}: anbarda ${line.deliverable}/${line.remaining} ədəd var — ${line.shortage} ədəd təchizat gözlənilir (backorder)`,
    );

  if (plan.deliverableTotal === 0) {
    return {
      ok: false,
      status: "Çatışmazlıq (backorder)",
      reason: issues[0] || "Anbarda təhvil üçün qalıq yoxdur.",
      issues,
      plan,
    };
  }

  if (plan.shortageTotal > 0) {
    return {
      ok: true,
      partial: true,
      status: "Qismən təhvilə hazır",
      reason: `${plan.deliverableTotal}/${plan.remainingTotal} ədəd indi təhvil verilə bilər, ${plan.shortageTotal} ədəd backorder qalır.`,
      issues,
      plan,
    };
  }

  return {
    ok: true,
    partial: false,
    status: "Təhvilə hazır",
    reason: "Bütün qalan məhsullar anbardadır və çıxarıla bilər.",
    issues: [],
    plan,
  };
}

export function getDeliveryDisplayStage(order) {
  if (order?.status === "Təhvil verilib") return "Təhvil verildi";
  return "Anbarda";
}

export function getDeliveryTotalQuantity(order) {
  return normalizeOrderProductLines(order?.productLines || []).reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

export function isDeliveryQueueOrder(order) {
  return Boolean(
    order &&
      order.status !== "Təhvil verilib" &&
      Array.isArray(order.productLines) &&
      normalizeOrderProductLines(order.productLines).length > 0,
  );
}

export function getOrderPaymentMethod(order) {
  return order.paymentMethod || (getOrderBalance(order) > 0 ? "Qalıqlı" : "Nağd");
}

export function summarizeOrderProducts(order) {
  if (Array.isArray(order.productLines) && order.productLines.length > 0) {
    return order.productLines
      .map((line) => `${line.product}${Number(line.qty || 1) > 1 ? ` x${Number(line.qty)}` : ""}`)
      .join(", ");
  }
  return order.products || "Cihaz qeyd edilməyib";
}

export function exportDeliveryQueueCsv(rows) {
  const headers = ["Sifariş", "Müqavilə", "Kredit", "Müştəri", "FIN", "Məhsul", "Miqdar", "Anbar", "Ödəniş", "Qalıq", "Stok statusu", "Qeyd"];
  const escapeValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csvRows = rows.map((order) => [
    order.id,
    order.contractId || "",
    order.creditId || "",
    order.customer,
    order.fin || "",
    summarizeOrderProducts(order),
    order.deliveryQty || getDeliveryTotalQuantity(order),
    order.warehouseName || "",
    order.paymentStatus || getOrderPaymentMethod(order),
    getOrderBalance(order),
    order.stockCheck?.status || getDeliveryStockCheck(order).status,
    order.stockCheck?.reason || "",
  ].map(escapeValue).join(","));
  const blob = new Blob([`\uFEFF${headers.map(escapeValue).join(",")}\n${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tehvil-reyestri-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function OrderProductLines({ lines }) {
  return (
    <div className="order-product-lines">
      {lines.map((line) => (
        <span key={`${line.product}-${line.qty}`}>
          {line.product} <strong>x{line.qty}</strong>
          {Array.isArray(line.serials) && line.serials.length > 0 && (
            <small>{line.serials.join(", ")}</small>
          )}
        </span>
      ))}
    </div>
  );
}

export function getOrderBalance(order) {
  return Math.max(0, Number(order.amount || 0) - Number(order.paid || 0));
}

export function normalizeOrderProductLines(rows = []) {
  return rows
    .filter((row) => row?.product)
    .map((row) => ({
      product: String(row.product || "").trim(),
      qty: Math.max(1, Math.round(Number(row.qty || 1))),
      price: Math.max(0, Number(row.price || 0)),
      serials: Array.isArray(row.serials) ? row.serials.filter(Boolean) : [],
    }));
}

export function getDeliveryPlan(order, warehouseStock = {}) {
  const productLines = normalizeOrderProductLines(order?.productLines || []);
  const warehouseId = order?.warehouseId;
  const rows = (warehouseId && warehouseStock?.[warehouseId]) || [];
  const deliveredMap = getDeliveredQuantities(order);
  const stockLeft = new Map();

  const lines = productLines.map((line) => {
    const ordered = Number(line.qty || 0);
    const delivered = Math.min(ordered, deliveredMap.get(line.product) || 0);
    const remaining = Math.max(0, ordered - delivered);
    const item = rows.find((row) => row.product === line.product);
    if (!stockLeft.has(line.product)) {
      stockLeft.set(line.product, Math.max(0, Number(item?.total || 0)));
    }
    const physical = stockLeft.get(line.product);
    const deliverable = Math.max(0, Math.min(remaining, physical));
    stockLeft.set(line.product, physical - deliverable);
    return {
      product: line.product,
      price: Number(line.price || 0),
      ordered,
      delivered,
      remaining,
      physical,
      deliverable,
      shortage: Math.max(0, remaining - deliverable),
      hasStockRow: Boolean(item),
    };
  });

  const orderedTotal = lines.reduce((sum, line) => sum + line.ordered, 0);
  const deliveredTotal = lines.reduce((sum, line) => sum + line.delivered, 0);
  const remainingTotal = lines.reduce((sum, line) => sum + line.remaining, 0);
  const deliverableTotal = lines.reduce((sum, line) => sum + line.deliverable, 0);
  const shortageTotal = lines.reduce((sum, line) => sum + line.shortage, 0);

  return {
    lines,
    orderedTotal,
    deliveredTotal,
    remainingTotal,
    deliverableTotal,
    shortageTotal,
    partial: deliverableTotal > 0 && shortageTotal > 0,
    complete: remainingTotal === 0,
  };
}

export function getDeliveredQuantities(order) {
  const raw = order?.deliveredQuantities;
  const map = new Map();
  if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([product, qty]) => {
      map.set(String(product), Math.max(0, Number(qty || 0)));
    });
  }
  return map;
}

// Qismən təhvil planı: hər sətir üçün nə qədəri anbardan verilə bilər, nə qədəri backorder qalır.

export function getDeliveryStageIndex(order) {
  return Math.max(0, stages.indexOf(order.status));
}

export function getDeliveryAgeDays(order) {
  const orderDate = parsePaymentDate(order.date);
  const today = parsePaymentDate(baseDeliveryDate);
  if (!orderDate || !today) return 0;
  return Math.max(0, daysBetween(orderDate, today));
}

export function getDeliveryRisk(order) {
  if (order.status === "Təhvil verilib") return "Tamamlandı";
  if (getDeliveryStageIndex(order) >= 2 && (!order.driver || order.driver === "—")) return "Sürücü yoxdur";
  if (order.status === "Təhvilə çıxıb" || order.status === "Hazırdır") return "Bu gün prioritet";
  if (getDeliveryAgeDays(order) >= 6) return "Gecikmə riski";
  return "Normal";
}

export function getOrderDeliveryStatus(order) {
  if (order.status === "Təhvil verilib") return "Təhvil verilib";
  return order.deliveryStatus || "Təhvil gözləyir";
}

export const baseDeliveryDate = currentBusinessDate;


export const PLATFORM_MODULE_CHOICES = navItems
  .filter((n) => !["platform"].includes(n.id))
  .map((n) => ({ id: n.id, label: n.label }));

export function slugifyPlatform(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export const dayInMs = 24 * 60 * 60 * 1000;

export const PLATFORM_PLANS = ["starter", "business", "enterprise"];

export function buildHrStructure(employees, departmentRecords = []) {
  const normalizedEmployees = employees.map((employee) => ({
    ...employee,
    managerName: getEmployeeManagerName(employee, employees),
    level: getEmployeeLevel(employee),
  }));
  const departmentNames = [...new Set(normalizedEmployees.map((employee) => employee.department || "Şöbəsiz"))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );

  const structures = departmentNames.map((department) => {
    const departmentRows = normalizedEmployees.filter((employee) => (employee.department || "Şöbəsiz") === department);
    const departmentNames = new Set(departmentRows.map((employee) => employee.name));
    const byManager = new Map();

    departmentRows.forEach((employee) => {
      const manager = departmentNames.has(employee.managerName) ? employee.managerName : "";
      const children = byManager.get(manager) || [];
      children.push(employee);
      byManager.set(manager, children);
    });

    const buildNode = (employee, visited = new Set()) => {
      if (visited.has(employee.name)) {
        return { ...employee, children: [] };
      }
      const nextVisited = new Set(visited);
      nextVisited.add(employee.name);
      const children = (byManager.get(employee.name) || [])
        .filter((child) => child.name !== employee.name)
        .sort((a, b) => a.name.localeCompare(b.name, "az"))
        .map((child) => buildNode(child, nextVisited));

      return { ...employee, children };
    };

    return {
      department,
      parentDepartment: departmentRows.map((employee) => getDepartmentParentName(employee)).find(Boolean) || "",
      leadCount: departmentRows.filter((employee) => isHrLeadershipLevel(employee.level)).length,
      salary: total(departmentRows, "salary"),
      avgKpi: departmentRows.length ? Math.round(total(departmentRows, "kpi") / departmentRows.length) : 0,
      roots: (byManager.get("") || []).sort((a, b) => a.name.localeCompare(b.name, "az")).map((employee) => buildNode(employee)),
      count: departmentRows.length,
    };
  });

  const structuresByDepartment = new Map(structures.map((department) => [department.department, department]));
  departmentRecords.forEach((record) => {
    const department = String(record.name || "").trim();
    if (!department) return;

    const existing = structuresByDepartment.get(department);
    if (existing) {
      existing.parentDepartment = String(record.parentDepartment || existing.parentDepartment || "").trim();
      return;
    }

    structuresByDepartment.set(department, {
      department,
      parentDepartment: String(record.parentDepartment || "").trim(),
      leadCount: 0,
      salary: 0,
      avgKpi: 0,
      roots: [],
      count: 0,
    });
  });

  return [...structuresByDepartment.values()].sort((left, right) => left.department.localeCompare(right.department, "az"));
}

export function isHrLeadershipLevel(level) {
  const text = normalize(level);
  return text.includes("rəhb") || text.includes("lider") || text.includes("direktor");
}

export function buildHrPlanningRows(structure) {
  return structure.map((department, index) => {
    const vacancyNeed = department.count < 2 ? 1 : department.avgKpi < 90 ? 1 : 0;
    const trainingNeed = department.avgKpi < 95 ? "Təlim planı" : "Standart izləmə";
    const payrollForecast = Math.round(Number(department.salary || 0) * 1.08);

    return {
      department: department.department,
      headcount: department.count,
      leaders: department.leadCount,
      avgKpi: department.avgKpi,
      vacancyNeed,
      trainingNeed,
      payrollForecast,
      onboarding: vacancyNeed > 0 ? (index % 2 ? "Satış təcrübəçisi" : "Əməliyyat assistenti") : "Yeni qəbul yoxdur",
      status: vacancyNeed > 0 ? "Vakansiya aç" : department.avgKpi < 95 ? "Təlim lazımdır" : "Stabil",
    };
  });
}

export function buildHrAttendanceRows(records) {
  return records.filter((record) => record.checkIn || record.checkOut).map((record) => ({
    id: `${record.name}-attendance`,
    employee: record.name,
    department: record.department,
    shift: record.shift,
    checkIn: record.checkIn || "—",
    checkOut: record.checkOut || "—",
    lateDays: record.lateDays,
    attendanceRate: record.attendanceRate,
    status: record.attendanceRate < 90 ? "Nəzarət" : record.lateDays > 2 ? "Gecikmə var" : "Normal",
  }));
}

export function buildHrLeaveRows(records, leaveRequests = []) {
  const recordByKey = new Map(records.map((record) => [getEmployeeKey(record), record]));
  return leaveRequests.map((request) => {
    const employee = recordByKey.get(request.employeeId) || records.find((record) => record.name === request.employeeName);
    return {
      id: request.id,
      employee: employee?.name || request.employeeName || "Əməkdaş silinib",
      department: employee?.department || request.department || "—",
      type: request.type,
      from: request.from,
      to: request.to,
      days: Number(request.days || 0),
      balance: Math.max(0, Number(employee?.leaveBalance || 0)),
      pendingDays: Number(employee?.pendingLeaveDays || 0),
      approver: request.approver || employee?.managerName || "HR",
      status: request.status || "Təsdiq gözləyir",
      decidedAt: request.decidedAt || "",
    };
  });
}

export function buildHrPayrollRows(records) {
  return records.map((record) => ({
    employeeKey: record.employeeKey,
    employee: record.name,
    department: record.department,
    salary: Number(record.salary || 0),
    bonus: record.bonus,
    deductions: record.tax + record.social,
    netSalary: record.netSalary,
    employerCost: record.employerCost,
    period: record.payrollPeriod,
    paidAt: record.payrollPaidAt,
    documentStatus: record.documentStatus,
    status: record.payrollStatus,
  }));
}

export function buildHrRecruitmentRows(planningRows, vacancies = []) {
  const activeVacancies = vacancies.map((vacancy) => ({
    ...vacancy,
    candidates: Number(vacancy.candidates || 0),
    stage: vacancy.stage || "Namizəd gözlənilir",
    status: vacancy.status || "Aktiv vakansiya",
  }));
  const knownDepartments = new Set(activeVacancies.map((vacancy) => vacancy.department));
  const plannedVacancies = planningRows
    .filter((row) => Number(row.vacancyNeed || 0) > 0 && !knownDepartments.has(row.department))
    .map((row) => ({
      id: `PLAN-${row.department}`,
      role: `${row.department} üzrə mütəxəssis`,
      department: row.department,
      candidates: 0,
      stage: "Planlanır",
      owner: "HR",
      targetDate: "Təyin edilməyib",
      status: "Planlanır",
    }));
  return [...activeVacancies, ...plannedVacancies];
}

export const hrPlatformTabs = ["Komanda", "İş vaxtı", "Məzuniyyət", "Payroll", "Recruitment"];

export function HrEmployeePlatform({ records, selectedRecord, onSelect, onEdit, onDelete, onUpdateDocuments }) {
  if (!selectedRecord) return <EmptyState title={records.length ? "Əməkdaş seçilməyib" : "Filterə uyğun əməkdaş tapılmadı"} />;

  const documentRows = selectedRecord.documentRows || getHrDocumentRows(selectedRecord);

  return (
    <section className="hr-employee-platform">
      <div className="hr-people-list">
        {records.map((record) => (
          <button
            key={record.name}
            className={`hr-person-row ${selectedRecord.name === record.name ? "active" : ""}`}
            onClick={() => onSelect(record.name)}
          >
            <AvatarLine initials={record.initials} title={record.name} subtitle={`${record.department} · ${record.position}`} />
            <div className="hr-person-status-stack">
              <StatusBadge status={record.hrStatus} />
              <StatusBadge status={record.documentStatus} />
            </div>
          </button>
        ))}
      </div>

      <div className="hr-profile-360" data-testid="hr-employee-360">
        <div className="hr-profile-head">
          <div className="avatar large">{selectedRecord.initials}</div>
          <div>
            <span>{selectedRecord.level}</span>
            <h3>{selectedRecord.name}</h3>
            <p>{selectedRecord.position} · {selectedRecord.department}</p>
          </div>
          <div className="hr-profile-actions">
            <StatusBadge status={selectedRecord.hrStatus} />
            <button className="icon-btn hr-profile-edit" title="Əməkdaşı redaktə et" aria-label={`${selectedRecord.name} əməkdaşını redaktə et`} onClick={() => onEdit(selectedRecord)}><Pencil size={16} /></button>
            <button className="icon-btn hr-row-delete hr-profile-delete" title="Əməkdaşı sil" aria-label={`${selectedRecord.name} əməkdaşını sil`} onClick={() => onDelete(selectedRecord)}><Trash2 size={16} /></button>
          </div>
        </div>
        <div className="hr-profile-grid">
          <TwoLine title="Rəhbər" subtitle={selectedRecord.managerName || "Birbaşa rəhbərlik"} />
          <TwoLine title="İş rejimi" subtitle={`${selectedRecord.workMode} · ${selectedRecord.shift}`} />
          <TwoLine title="İşə qəbul" subtitle={selectedRecord.hireDate} />
          <TwoLine title="Növbəti review" subtitle={selectedRecord.nextReview} />
          <TwoLine title="Attendance" subtitle={percent(selectedRecord.attendanceRate)} />
          <TwoLine title="Məzuniyyət balansı" subtitle={`${selectedRecord.leaveBalance} gün`} />
          <TwoLine title="Sənəd uyğunluğu" subtitle={percent(selectedRecord.documentsComplete)} />
          <TwoLine title="Net payroll" subtitle={money(selectedRecord.netSalary)} />
          <TwoLine title="Payroll statusu" subtitle={selectedRecord.payrollStatus} />
          <TwoLine title="Payroll periodu" subtitle={selectedRecord.payrollPeriod} />
          <TwoLine title="Ödənilmə tarixi" subtitle={selectedRecord.payrollPaidAt || "Hələ bağlanmayıb"} />
          <TwoLine title="Sənəd statusu" subtitle={selectedRecord.documentStatus} />
        </div>
        <div className="hr-profile-snapshot">
          <div>
            <span>Məzuniyyət</span>
            <strong>{selectedRecord.leaveBalance} gün qalıq</strong>
            <small>{selectedRecord.usedLeave} gün istifadə · {selectedRecord.pendingLeaveDays} gün təsdiqdə</small>
          </div>
          <div>
            <span>Payroll</span>
            <strong>{selectedRecord.payrollStatus}</strong>
            <small>{money(selectedRecord.netSalary)} net · {money(selectedRecord.employerCost)} işəgötürən xərci</small>
          </div>
          <div>
            <span>Sənədlər</span>
            <strong>{selectedRecord.documentStatus}</strong>
            <small>{selectedRecord.missingDocumentCount} açıq sənəd · {percent(selectedRecord.documentsComplete)}</small>
          </div>
        </div>
        <div className="hr-skill-strip">
          {(selectedRecord.skills.length ? selectedRecord.skills : ["Profil bacarıqları əlavə edilməyib"]).map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
        <div className="hr-document-grid">
          {documentRows.map((document) => (
            <div key={document.key} className={document.complete ? "complete" : "attention"}>
              <span>
                {document.title}
                <small>{document.progress}%</small>
              </span>
              <StatusBadge status={document.status} />
            </div>
          ))}
        </div>
        {selectedRecord.missingDocumentCount > 0 && onUpdateDocuments && (
          <button className="secondary-btn hr-document-complete" data-testid="hr-document-complete" onClick={() => onUpdateDocuments(selectedRecord.employeeKey, 100)}>
            <Check size={16} />
            Sənədləri tamamla
          </button>
        )}
      </div>
    </section>
  );
}

export function HrAttendancePlatform({ rows }) {
  const averageAttendance = rows.length
    ? rows.reduce((sum, row) => sum + Number(row.attendanceRate || 0), 0) / rows.length
    : 0;
  const lateTotal = rows.reduce((sum, row) => sum + Number(row.lateDays || 0), 0);

  return (
    <div className="hr-platform-section">
      <div className="hr-platform-summary">
        <div>
          <span>Orta davamiyyət</span>
          <strong>{percent(averageAttendance)}</strong>
          <small>Bu ay üzrə</small>
        </div>
        <div>
          <span>Gecikmə</span>
          <strong>{lateTotal}</strong>
          <small>Toplam gecikmə günü</small>
        </div>
        <div>
          <span>Nəzarət</span>
          <strong>{rows.filter((row) => row.status !== "Normal").length}</strong>
          <small>HR follow-up</small>
        </div>
      </div>
      <DataTable
        columns={["Əməkdaş", "Şöbə", "Növbə", "Giriş", "Çıxış", "Gecikmə", "Davamiyyət", "Status"]}
        rows={rows.map((row) => [
          <strong>{row.employee}</strong>,
          row.department,
          row.shift,
          row.checkIn,
          row.checkOut,
          `${row.lateDays} gün`,
          <ProgressRow value={row.attendanceRate} label={percent(row.attendanceRate)} compact />,
          <StatusBadge status={row.status} />,
        ])}
      />
    </div>
  );
}

export function HrLeavePlatform({ rows, onCreate, onUpdateStatus }) {
  const pending = rows.filter((row) => row.status === "Təsdiq gözləyir");
  const plannedDays = rows.reduce((sum, row) => sum + Number(row.days || 0), 0);
  const approvedDays = rows
    .filter((row) => row.status === "Təsdiq edildi")
    .reduce((sum, row) => sum + Number(row.days || 0), 0);

  return (
    <div className="hr-platform-section">
      <div className="hr-operation-toolbar">
        <span>Məzuniyyət tələbləri və balans nəzarəti</span>
        <button className="secondary-btn" onClick={onCreate}><Plus size={16} /> Məzuniyyət qeydi</button>
      </div>
      <div className="hr-platform-summary">
        <div>
          <span>Təsdiq gözləyir</span>
          <strong>{pending.length}</strong>
          <small>Rəhbər baxışı</small>
        </div>
        <div>
          <span>Təsdiqlənən gün</span>
          <strong>{approvedDays}</strong>
          <small>Balansdan silinir</small>
        </div>
        <div>
          <span>Planlanan gün</span>
          <strong>{plannedDays}</strong>
          <small>Məzuniyyət yükü</small>
        </div>
        <div>
          <span>Orta balans</span>
          <strong>{rows.length ? Math.round(rows.reduce((sum, row) => sum + row.balance, 0) / rows.length) : 0}</strong>
          <small>Qalıq gün</small>
        </div>
      </div>
      <DataTable
        columns={["Əməkdaş", "Tip", "Tarix", "Gün", "Balans", "Təsdiqləyən", "Status", ""]}
        rows={rows.map((row) => [
          <TwoLine title={row.employee} subtitle={row.department} />,
          row.type,
          `${row.from} → ${row.to}`,
          row.days,
          `${row.balance} gün`,
          row.approver,
          <StatusBadge status={row.status} />,
          row.status === "Təsdiq gözləyir" && onUpdateStatus ? (
            <div className="hr-leave-actions">
              <button className="text-btn" onClick={() => onUpdateStatus(row.id, "Təsdiq edildi")}>Təsdiq</button>
              <button className="text-btn danger" onClick={() => onUpdateStatus(row.id, "İmtina edildi")}>İmtina</button>
            </div>
          ) : (
            <small>{row.decidedAt || "—"}</small>
          ),
        ])}
      />
    </div>
  );
}

export function HrPayrollPlatform({ rows, totalNet, onMarkPaid }) {
  const gross = rows.reduce((sum, row) => sum + Number(row.salary || 0) + Number(row.bonus || 0), 0);
  const deductions = rows.reduce((sum, row) => sum + Number(row.deductions || 0), 0);
  const net = typeof totalNet === "number" ? totalNet : rows.reduce((sum, row) => sum + Number(row.netSalary || 0), 0);
  const employerCost = rows.reduce((sum, row) => sum + Number(row.employerCost || 0), 0);
  const paidRows = rows.filter((row) => row.status === "Ödənildi");
  const readyRows = rows.filter((row) => row.status === "Hesablama hazırdır");
  const blockedRows = rows.filter((row) => row.status === "Sənəd gözləyir");

  return (
    <div className="hr-platform-section">
      <div className="hr-platform-summary">
        <div>
          <span>Gross payroll</span>
          <strong>{money(gross)}</strong>
          <small>Maaş + bonus</small>
        </div>
        <div>
          <span>Tutulmalar</span>
          <strong>{money(deductions)}</strong>
          <small>Vergi və sosial</small>
        </div>
        <div>
          <span>Net ödəniş</span>
          <strong>{money(net)}</strong>
          <small>Payroll uçotu</small>
        </div>
        <div>
          <span>İşəgötürən xərci</span>
          <strong>{money(employerCost)}</strong>
          <small>Gross + işəgötürən ödənişləri</small>
        </div>
        <div>
          <span>Status</span>
          <strong>{paidRows.length}/{rows.length}</strong>
          <small>{readyRows.length} hazır · {blockedRows.length} sənəd gözləyir</small>
        </div>
      </div>
      <DataTable
        columns={["Əməkdaş", "Şöbə", "Period", "Maaş", "Bonus", "Tutulma", "Net", "İşəgötürən xərci", "Status", ""]}
        rows={rows.map((row) => [
          <strong>{row.employee}</strong>,
          row.department,
          <TwoLine title={row.period} subtitle={row.paidAt || "Ödənilməyib"} />,
          money(row.salary),
          money(row.bonus),
          money(row.deductions),
          <strong>{money(row.netSalary)}</strong>,
          money(row.employerCost),
          <StatusBadge status={row.status} />,
          row.status === "Ödənildi" ? (
            <small>{row.paidAt}</small>
          ) : (
            <div className="hr-payroll-actions">
              <button
                className="text-btn"
                disabled={row.status === "Sənəd gözləyir" || !onMarkPaid}
                onClick={() => onMarkPaid(row.employeeKey)}
              >
                Ödənişi bağla
              </button>
            </div>
          ),
        ])}
      />
    </div>
  );
}

export function HrRecruitmentPlatform({ rows, onCreate }) {
  const activeRows = rows.filter((row) => row.status === "Aktiv vakansiya");

  return (
    <div className="hr-platform-section">
      <div className="hr-operation-toolbar">
        <span>Vakansiya pipeline və namizəd mərhələləri</span>
        <button className="secondary-btn" onClick={onCreate}><Plus size={16} /> Vakansiya əlavə et</button>
      </div>
      <div className="hr-recruitment-pipeline">
        {rows.map((row) => (
          <div className="hr-recruitment-card" key={`${row.department}-${row.role}`}>
            <div>
              <strong>{row.role}</strong>
              <span>{row.department} · {row.owner}</span>
            </div>
            <div className="hr-recruitment-meta">
              <b>{row.candidates}</b>
              <small>namizəd</small>
            </div>
            <StatusBadge status={row.stage} />
          </div>
        ))}
      </div>
      <DataTable
        columns={["Rol", "Şöbə", "Namizəd", "Mərhələ", "Owner", "Hədəf tarix", "Status"]}
        rows={rows.map((row) => [
          <strong>{row.role}</strong>,
          row.department,
          row.candidates,
          row.stage,
          row.owner,
          row.targetDate,
          <StatusBadge status={activeRows.includes(row) ? "Aktiv vakansiya" : row.status} />,
        ])}
      />
    </div>
  );
}

export function HrStructureBuilder({ employees, departments: departmentRecords = [], selectedEmployee, onSelectEmployee, onUpdate }) {
  const [draft, setDraft] = useState(() => getHrDraft(selectedEmployee, employees));
  const departments = [...new Set([
    ...employees.map((employee) => employee.department),
    ...departmentRecords.map((department) => department.name),
  ].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const parentDepartments = [...new Set([
    ...departments,
    ...employees.map((employee) => getDepartmentParentName(employee)),
    ...departmentRecords.map((department) => department.parentDepartment),
  ].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const managerOptions = employees.filter((employee) => employee.name !== selectedEmployee.name);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onUpdate(selectedEmployee.name, draft);
  }

  return (
    <form className="hr-builder-form" onSubmit={submit}>
      <label>
        <span>Əməkdaş</span>
        <select value={selectedEmployee.name} onChange={(event) => onSelectEmployee(event.target.value)}>
          {employees.map((employee) => (
            <option key={employee.name} value={employee.name}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Şöbə</span>
        <input
          value={draft.department}
          list="hr-departments"
          onChange={(event) => updateDraft("department", event.target.value)}
        />
        <datalist id="hr-departments">
          {departments.map((department) => (
            <option key={department} value={department} />
          ))}
        </datalist>
      </label>
      <label>
        <span>Vəzifə</span>
        <input value={draft.position} onChange={(event) => updateDraft("position", event.target.value)} />
      </label>
      <label>
        <span>Üst şöbə</span>
        <input
          value={draft.departmentParent}
          list="hr-parent-departments"
          onChange={(event) => updateDraft("departmentParent", event.target.value)}
        />
        <datalist id="hr-parent-departments">
          <option value="" />
          {parentDepartments.map((department) => (
            <option key={department} value={department} />
          ))}
        </datalist>
      </label>
      <label>
        <span>Kimə tabedir</span>
        <select value={draft.managerName} onChange={(event) => updateDraft("managerName", event.target.value)}>
          <option value="">Birbaşa rəhbərlik</option>
          {managerOptions.map((employee) => (
            <option key={employee.name} value={employee.name}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Səviyyə</span>
        <select value={draft.level} onChange={(event) => updateDraft("level", event.target.value)}>
          {hrLevelOptions.map((level) => (
            <option key={level}>{level}</option>
          ))}
        </select>
      </label>
      <div className="hr-builder-preview">
        <TwoLine title={selectedEmployee.name} subtitle={`${draft.position} · ${draft.department}`} />
        <StatusBadge status={draft.level} />
        <small>{draft.managerName ? `${draft.managerName} rəhbərliyində` : "Birbaşa rəhbərlik xətti"} · {draft.departmentParent || "Əsas şöbə"}</small>
      </div>
      <button className="primary-btn" type="submit">
        Strukturda yadda saxla
      </button>
    </form>
  );
}

export function HrStructureTree({ structure, employees, onSelectEmployee }) {
  const departmentTree = useMemo(() => buildHrDepartmentTree(structure), [structure]);
  const departmentIds = useMemo(() => getHrDepartmentIds(departmentTree), [departmentTree]);
  const departmentTreeKey = departmentIds.join("|");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [expandedDepartments, setExpandedDepartments] = useState(() => new Set(departmentIds));
  useEffect(() => {
    setExpandedDepartments(new Set(departmentIds));
  }, [departmentTreeKey]);
  const departmentScope = useMemo(
    () => getHrDepartmentScope(departmentTree, selectedDepartment),
    [departmentTree, selectedDepartment],
  );
  const reportingRoots = useMemo(
    () => buildHrReportingForest(employees, departmentScope),
    [employees, departmentScope],
  );
  const selectedTitle = selectedDepartment === "all" ? "Bütün şirkət" : selectedDepartment;

  function toggleDepartment(departmentId) {
    setExpandedDepartments((current) => {
      const next = new Set(current);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  }

  function activateDepartment(department) {
    setSelectedDepartment(department.id);
    if (department.children.length > 0) toggleDepartment(department.id);
  }

  if (structure.length === 0) {
    return <EmptyState title="Struktur ağacı boşdur" />;
  }

  return (
    <div className="hr-tree">
      <div className="hr-org-chart-scroll">
        <div className="hr-org-chart-canvas">
          <button className={`hr-org-company-card ${selectedDepartment === "all" ? "active" : ""}`} onClick={() => setSelectedDepartment("all")}>
            <span className="hr-org-company-icon"><Building2 size={20} /></span>
            <span>
              <strong>ERP+CRM AZ</strong>
              <small>Şirkət strukturu</small>
            </span>
          </button>
          <div className={`hr-org-children hr-org-root-children ${departmentTree.length > 1 ? "multiple" : ""}`}>
            {departmentTree.map((department, index) => (
              <HrOrganizationNode
                key={department.id}
                department={department}
                depth={0}
                index={index}
                selectedDepartment={selectedDepartment}
                expandedDepartments={expandedDepartments}
                onActivate={activateDepartment}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="hr-reporting-panel">
        <div className="hr-reporting-head">
          <div>
            <strong>{selectedTitle} üzrə tabeçilik xətti</strong>
            <span>{departmentScope ? `${departmentScope.size} şöbə` : `${employees.length} əməkdaş`}</span>
          </div>
          <StatusBadge status={`${reportingRoots.length} rəhbərlik xətti`} />
        </div>
        <div className="hr-employee-branch">
          {reportingRoots.map((employee) => (
            <HrEmployeeTreeNode key={employee.employeeKey} employee={employee} onSelectEmployee={onSelectEmployee} />
          ))}
          {reportingRoots.length === 0 && <EmptyState title="Bu şöbə üzrə tabeçilik xətti yoxdur" />}
        </div>
      </div>
    </div>
  );
}

export function buildHrDepartmentTree(structure = []) {
  const nodes = new Map();
  const ensureNode = (department, parentDepartment = "", source = null) => {
    if (!department) return null;
    const current = nodes.get(department) || {
      id: department,
      department,
      parentDepartment,
      children: [],
      isVirtual: !source,
      count: 0,
      leadCount: 0,
      salary: 0,
      avgKpi: 0,
    };
    if (source) {
      Object.assign(current, {
        ...source,
        id: department,
        parentDepartment: source.parentDepartment || parentDepartment,
        children: current.children || [],
        isVirtual: false,
      });
    }
    nodes.set(department, current);
    return current;
  };

  structure.forEach((department) => {
    const parentDepartment = department.parentDepartment || "";
    ensureNode(department.department, parentDepartment, department);
    if (parentDepartment) ensureNode(parentDepartment);
  });

  const roots = [];
  nodes.forEach((node) => {
    node.children = [];
  });
  nodes.forEach((node) => {
    const parent = node.parentDepartment && nodes.get(node.parentDepartment);
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = (items) => items
    .sort((a, b) => a.department.localeCompare(b.department, "az"))
    .map((node) => ({ ...node, children: sortNodes(node.children) }));
  return sortNodes(roots);
}

export function getHrDepartmentIds(nodes = [], ids = []) {
  nodes.forEach((node) => {
    ids.push(node.id);
    getHrDepartmentIds(node.children, ids);
  });
  return ids;
}

export function getHrDepartmentScope(departmentTree, selectedDepartment) {
  if (!selectedDepartment || selectedDepartment === "all") return null;
  const collect = (nodes) => {
    for (const node of nodes) {
      if (node.id === selectedDepartment) {
        const names = new Set();
        const visit = (current) => {
          names.add(current.department);
          current.children.forEach(visit);
        };
        visit(node);
        return names;
      }
      const nested = collect(node.children);
      if (nested) return nested;
    }
    return null;
  };
  return collect(departmentTree) || new Set([selectedDepartment]);
}

export function buildHrReportingForest(employees = [], departmentScope = null) {
  const normalizedEmployees = employees.map((employee) => ({
    ...employee,
    employeeKey: getEmployeeKey(employee),
    manager: getEmployeeManager(employee, employees),
    managerName: getEmployeeManagerName(employee, employees),
    level: getEmployeeLevel(employee),
  }));
  const rowsByKey = new Map(normalizedEmployees.map((employee) => [employee.employeeKey, employee]));
  const childrenByManager = new Map();
  normalizedEmployees.forEach((employee) => {
    const managerKey = employee.manager ? getEmployeeKey(employee.manager) : "";
    const children = childrenByManager.get(managerKey) || [];
    children.push(employee);
    childrenByManager.set(managerKey, children);
  });

  const buildNode = (employee, visited = new Set()) => {
    if (visited.has(employee.employeeKey)) return { ...employee, children: [] };
    const nextVisited = new Set(visited);
    nextVisited.add(employee.employeeKey);
    const children = (childrenByManager.get(employee.employeeKey) || [])
      .filter((child) => child.employeeKey !== employee.employeeKey)
      .sort((a, b) => a.name.localeCompare(b.name, "az"))
      .map((child) => buildNode(child, nextVisited));
    const isInScope = !departmentScope || departmentScope.has(employee.department);
    if (!isInScope && children.length === 0) return null;
    return { ...employee, children: children.filter(Boolean), isInScope };
  };

  const roots = normalizedEmployees
    .filter((employee) => !employee.manager || !rowsByKey.has(getEmployeeKey(employee.manager)))
    .sort((a, b) => a.name.localeCompare(b.name, "az"))
    .map((employee) => buildNode(employee))
    .filter(Boolean);

  const nestedKeys = new Set();
  const collectKeys = (node) => {
    nestedKeys.add(node.employeeKey);
    node.children.forEach(collectKeys);
  };
  roots.forEach(collectKeys);
  normalizedEmployees.forEach((employee) => {
    if (!nestedKeys.has(employee.employeeKey)) {
      const node = buildNode(employee);
      if (node) roots.push(node);
    }
  });
  return roots;
}

export function HrOrganizationNode({ department, depth, index, selectedDepartment, expandedDepartments, onActivate }) {
  const hasChildren = department.children.length > 0;
  const expanded = expandedDepartments.has(department.id);
  const lead = getHrDepartmentLead(department);
  const cardNumber = String(index + 1).padStart(2, "0");

  return (
    <div className={`hr-org-branch ${hasChildren ? "has-children" : ""}`}>
      <button
        className={`hr-org-card tone-${(depth + index) % 4} ${selectedDepartment === department.id ? "active" : ""}`}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => onActivate(department)}
      >
        <span className="hr-org-card-number">{cardNumber}</span>
        <span className="hr-org-card-label">{department.isVirtual ? "Şöbə qrupu" : "Şöbə"}</span>
        <strong>{department.department}</strong>
        <span className="hr-org-card-count"><Users size={13} />{department.count} əməkdaş</span>
        <span className="hr-org-card-lead">
          <span className="small-avatar">{lead?.initials || "HR"}</span>
          <span>
            <b>{lead?.name || "Rəhbər təyin edilməyib"}</b>
            <small>{lead?.position || "Alt şöbələr"}</small>
          </span>
        </span>
        {hasChildren && <ChevronRight size={16} className={`hr-org-card-chevron ${expanded ? "expanded" : ""}`} />}
      </button>
      {hasChildren && expanded && (
        <div className={`hr-org-children ${department.children.length > 1 ? "multiple" : ""}`}>
          {department.children.map((child, childIndex) => (
            <HrOrganizationNode
              key={child.id}
              department={child}
              depth={depth + 1}
              index={childIndex}
              selectedDepartment={selectedDepartment}
              expandedDepartments={expandedDepartments}
              onActivate={onActivate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HrEmployeeTreeNode({ employee, onSelectEmployee }) {
  return (
    <div className="hr-tree-item">
      <button className={`hr-employee-node ${employee.isInScope ? "in-scope" : ""}`} onClick={() => onSelectEmployee(employee.name)}>
        <span className="small-avatar">{employee.initials}</span>
        <div>
          <strong>{employee.name}</strong>
          <span>{employee.position} · {employee.department}</span>
          <small>{employee.managerName ? `${employee.managerName}-a tabedir` : "Birbaşa rəhbərlik"}</small>
        </div>
        <StatusBadge status={employee.level} />
      </button>
      {employee.children.length > 0 && (
        <div className="hr-tree-children">
          {employee.children.map((child) => (
            <HrEmployeeTreeNode key={child.employeeKey} employee={child} onSelectEmployee={onSelectEmployee} />
          ))}
        </div>
      )}
    </div>
  );
}

export function getHrDepartmentLead(department) {
  const roots = department.roots || [];
  return roots.find((employee) => isHrLeadershipLevel(employee.level)) || roots[0] || null;
}

export function getHrDraft(employee, employees) {
  return {
    department: employee?.department || "",
    departmentParent: employee ? getDepartmentParentName(employee) : "",
    position: employee?.position || "",
    managerName: employee ? getEmployeeManagerName(employee, employees) : "",
    level: employee ? getEmployeeLevel(employee) : "Komanda üzvü",
  };
}

export function getDepartmentParentName(employee = {}) {
  if (employee.departmentParent) return employee.departmentParent;
  const parts = String(employee.department || "")
    .split(/\s*(?:\/|>|›)\s*/)
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
}

export const hrLevelOptions = ["Rəhbərlik", "Şöbə rəhbəri", "Komanda lideri", "Komanda üzvü", "Təcrübəçi"];

export function buildProcurementRows(vendors, warehouseStock, orders, products = [], purchaseOrders = []) {
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const byProduct = new Map();

  products.filter((product) => product.status !== "Passiv").forEach((product) => {
    byProduct.set(product.name, {
      product: product.name,
      total: 0,
      reserved: 0,
      price: Number(product.salePrice || product.costPrice || 0),
      costPrice: Number(product.costPrice || 0),
      salePrice: Number(product.salePrice || 0),
      sku: product.sku || "",
    });
  });

  Object.values(warehouseStock).forEach((items) => {
    (items || []).forEach((item) => {
      const catalogProduct = productsByName.get(normalize(item.product));
      const current = byProduct.get(item.product) || {
        product: item.product,
        total: 0,
        reserved: 0,
        price: Number(item.price || 0),
        costPrice: Number(catalogProduct?.costPrice || 0),
        salePrice: Number(catalogProduct?.salePrice || item.price || 0),
      };
      current.total += Number(item.total || 0);
      current.reserved += Number(item.reserved || 0);
      current.price = Number(item.price || current.price || 0);
      current.costPrice = Number(current.costPrice || catalogProduct?.costPrice || 0);
      current.salePrice = Number(current.salePrice || catalogProduct?.salePrice || item.price || 0);
      byProduct.set(item.product, current);
    });
  });

  const soldByProduct = orders.reduce((map, order) => {
    (order.productLines || []).forEach((line) => {
      map.set(line.product, (map.get(line.product) || 0) + Number(line.qty || 0));
    });
    return map;
  }, new Map());

  return [...byProduct.values()]
    .map((item) => {
      const available = Math.max(0, item.total - item.reserved);
      const sold = soldByProduct.get(item.product) || 0;
      const demand = Math.max(4, sold * 2);
      const reorderPoint = getReorderPoint(item, productsByName);
      const targetQty = Math.max(demand, reorderPoint > 0 ? reorderPoint * 2 : 0);
      const recommendedQty = Math.max(0, targetQty - available);
      const coverage = orderCoverage.get(normalize(item.product)) || { orderedQty: 0, amount: 0, count: 0 };
      const unitCost = Number(item.costPrice || Math.round(Number(item.price || 0) * 0.76));
      const orderGap = Math.max(0, recommendedQty - Number(coverage.orderedQty || 0));
      const orderStatus =
        recommendedQty <= 0
          ? "Stok normal"
          : coverage.orderedQty >= recommendedQty
            ? "Sifariş verilib"
            : coverage.orderedQty > 0
              ? "Qismən sifarişdə"
              : "Sifariş verilməyib";
      return {
        ...item,
        available,
        sold,
        reorderPoint,
        vendor: getPreferredVendorName(item.product, vendors),
        recommendedQty,
        orderGap,
        orderedQty: Number(coverage.orderedQty || 0),
        openPoCount: Number(coverage.count || 0),
        latestPoId: coverage.latest?.id || "",
        unitCost,
        estimatedCost: Math.round(orderGap * unitCost),
        status:
          recommendedQty > 0
            ? orderStatus
            : reorderPoint > 0 && available <= reorderPoint
              ? "Nəzarət"
              : "Kifayət edir",
      };
    })
    .sort((a, b) => b.recommendedQty - a.recommendedQty || a.available - b.available);
}

export function isPurchaseOrderOpen(po = {}) {
  const status = normalize(po.status);
  return (
    !status.includes("edildi") &&
    !status.includes("ödən") &&
    !status.includes("oden") &&
    !status.includes("bağ") &&
    !status.includes("bag") &&
    !status.includes("imtina") &&
    !status.includes("cancel")
  );
}

export const currentBusinessQuarter = Math.floor(new Date().getMonth() / 3) + 1;

export function buildProductLookup(products = []) {
  return new Map((products || []).map((product) => [normalize(product.name), product]));
}

export function buildPurchaseOrderCoverage(purchaseOrders = []) {
  return (purchaseOrders || []).filter(isPurchaseOrderOpen).reduce((map, po) => {
    const key = normalize(po.product);
    if (!key) return map;
    const current = map.get(key) || { orderedQty: 0, amount: 0, count: 0, latest: null };
    map.set(key, {
      orderedQty: current.orderedQty + Number(po.qty || 0),
      amount: current.amount + Number(po.amount || 0),
      count: current.count + 1,
      latest: current.latest || po,
    });
    return map;
  }, new Map());
}

export function getReorderPoint(item = {}, productsByName = new Map()) {
  const catalogProduct = productsByName.get(normalize(item.product));
  const configuredPoint = catalogProduct?.reorderLevel ?? item.reorderLevel;
  if (configuredPoint !== undefined && configuredPoint !== null && configuredPoint !== "") {
    const point = Number(configuredPoint);
    if (Number.isFinite(point)) return Math.max(0, Math.round(point));
  }
  return Number(item.price || 0) >= 2000 ? 5 : 8;
}

export function getPreferredVendorName(product, vendors) {
  const normalizedProduct = normalize(product);
  const direct = vendors.find((vendor) => normalizedProduct.includes(normalize(vendor.name).split(" ")[0]));
  if (direct) return direct.name;
  return vendors[0]?.name || "Vendor təyin edilməyib";
}

export function buildSalesBonusRows(orders) {
  return orders.flatMap((order) => {
    const paid = Number(order.paid || 0);
    return getOrderSellerBonuses(order).map((sellerBonus) => {
      const rate = Number(sellerBonus.bonus || 0);
      return {
        id: `${order.id}-${sellerBonus.seller}-${rate}`,
        orderId: order.id,
        date: order.date,
        customer: order.customer,
        product: summarizeOrderProducts(order),
        paymentMethod: order.paymentMethod || "Nağd",
        seller: sellerBonus.seller,
        rate,
        paid,
        bonusAmount: Math.round((paid * rate) / 100),
        status: order.status,
      };
    });
  });
}

export function getOrderSellerBonuses(order) {
  if (Array.isArray(order.sellerBonuses) && order.sellerBonuses.length > 0) {
    return order.sellerBonuses;
  }
  return parseSellerBonusText(order.seller);
}

export function matchesSalesOrderFilter(order, filter) {
  if (filter === "Kredit") return getOrderPaymentMethod(order) === "Kredit";
  if (filter === "Nağd") return getOrderPaymentMethod(order) === "Nağd";
  if (filter === "Qalıqlı") return getOrderBalance(order) > 0;
  if (filter === "Təhvil gözləyən") return order.status !== "Təhvil verilib";
  if (filter === "Tamamlanan") return order.status === "Təhvil verilib";
  if (filter === "Riskli") return getOrderBalance(order) > 0 || (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3);
  return true;
}

export function matchesSalesOrderSearch(order, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  return normalize(
    [
      order.id,
      order.customer,
      order.fin,
      order.phone,
      order.products,
      summarizeOrderProducts(order),
      order.paymentMethod,
      order.paymentStatus,
      order.status,
      order.warehouseName,
      order.creditId,
      order.contractId,
      getOrderSellerBonuses(order).map((seller) => seller.seller).join(" "),
    ].join(" "),
  ).includes(q);
}

export function matchesSalesDateRange(order, dateFrom, dateTo) {
  const orderDate = parsePaymentDate(order.date);
  if (!orderDate) return !dateFrom && !dateTo;
  const from = dateFrom ? parsePaymentDate(dateFrom) : null;
  const to = dateTo ? parsePaymentDate(dateTo) : null;
  if (from && orderDate < from) return false;
  if (to && orderDate > to) return false;
  return true;
}

export function getSalesCashImpact(order) {
  return Math.max(0, Number(order.paid || 0));
}

export function getOrderBonusAmount(order) {
  const paid = Number(order.paid || 0);
  return Math.round(
    getOrderSellerBonuses(order).reduce((sum, sellerBonus) => sum + (paid * Number(sellerBonus.bonus || 0)) / 100, 0),
  );
}

export function getSalesOrderRiskStatus(order) {
  if (order.status === "Təhvil verilib" && getOrderBalance(order) <= 0) return "Tamamlanıb";
  if (getOrderBalance(order) > 0 && order.status !== "Təhvil verilib") return "Borclu + təhvil";
  if (getOrderBalance(order) > 0) return "Borclu";
  if (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3) return "Təhvil riski";
  if (order.status !== "Təhvil verilib") return "Təhvil gözləyir";
  return "Sağlam";
}

export function getOrderBonusText(order) {
  const bonuses = getOrderSellerBonuses(order);
  if (bonuses.length === 0) return "Bonus yoxdur";
  return bonuses.map((item) => `${getShortSellerName(item.seller)} ${Number(item.bonus || 0)}%`).join(", ");
}

export function getShortSellerName(name) {
  return String(name || "")
    .trim()
    .split(" ")[0];
}

export function WorkflowSteps({ activeStage, compact = false }) {
  const activeIndex = stages.indexOf(activeStage);
  return (
    <div className={`workflow-steps ${compact ? "compact" : ""}`}>
      {stages.map((stage, index) => (
        <div
          key={stage}
          className={`workflow-step ${index <= activeIndex ? "done" : ""} ${index === activeIndex ? "current" : ""}`}
        >
          <span>{index + 1}</span>
          <small>{stage}</small>
        </div>
      ))}
    </div>
  );
}

export function parseSellerBonusText(text) {
  return String(text || "")
    .split(",")
    .map((part) => {
      const match = part.trim().match(/(.+?)\s+(\d+(?:\.\d+)?)%/);
      if (!match) return null;
      return {
        seller: match[1].trim(),
        bonus: Number(match[2] || 0),
      };
    })
    .filter(Boolean);
}

export function buildCustomer360(customer, { credits = [], orders = [], contracts = [] }) {
  const customerOrders = getCustomerOrders(customer, orders);
  const customerCredits = getCustomerRelatedCredits(customer, credits);
  const customerContracts = getCustomerContracts(customer, contracts);
  const contractByOrderId = new Map(customerContracts.filter((contract) => contract.orderId).map((contract) => [contract.orderId, contract]));
  const contractById = new Map(customerContracts.map((contract) => [contract.id, contract]));
  const orderById = new Map(customerOrders.map((order) => [order.id, order]));

  const creditAgreements = customerCredits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    const paymentState = getCreditPaymentState(credit, plan);
    const order = getCreditOrder(credit, customerOrders);
    const contract = getCreditContract(credit, customerContracts);
    const productLines =
      order
        ? getOrderProductRows(order)
        : [
            {
              product: credit.device || credit.product || contract?.product || "Cihaz qeyd edilməyib",
              qty: 1,
              amount: Number(plan.total || contract?.amount || 0),
              serials: [],
            },
          ];
    const paid = getCreditPaidTotal(plan);

    return {
      id: credit.id,
      key: `credit-${credit.id}`,
      type: "Kredit müqaviləsi",
      source: getCreditSourceLabel(credit),
      contractId: credit.contractId || contract?.id || "Müqaviləsiz",
      orderId: credit.orderId || order?.id || contract?.orderId || "—",
      creditId: credit.id,
      date: credit.date || order?.date || contract?.date || baseCreditDate,
      product: productLines.map((line) => line.product).filter(Boolean).join(", "),
      productLines,
      amount: Number(plan.total || contract?.amount || order?.amount || 0),
      paid,
      balance: Number(plan.balance || 0),
      initialPayment: Number(plan.initialPayment || 0),
      monthly: Number(paymentState.nextInstallment?.amount || plan.monthly || 0),
      months: Number(plan.months || 0),
      paidMonths: Number(credit.paidMonths || 0),
      remainingMonths: plan.installments.filter((installment) => Number(installment.amount || 0) > 0).length,
      nextDue: paymentState.nextInstallment?.due || credit.next || "—",
      status: getCreditManagementStatus({ credit, plan, paymentState }),
      overdueDays: Number(paymentState.daysOverdue || 0),
      plan,
      paymentState,
      payments: credit.payments || [],
      order,
      contract,
    };
  });

  const creditedOrderIds = new Set(creditAgreements.map((agreement) => agreement.orderId).filter((id) => id && id !== "—"));
  const usedContractIds = new Set(
    creditAgreements.map((agreement) => agreement.contractId).filter((id) => id && id !== "Müqaviləsiz"),
  );
  const directSaleAgreements = customerOrders
    .filter((order) => !creditedOrderIds.has(order.id) && !getOrderCredit(order, customerCredits))
    .map((order) => {
      const contract = contractByOrderId.get(order.id) || contractById.get(order.contractId);
      if (contract?.id) usedContractIds.add(contract.id);
      const balance = getOrderBalance(order);
      const amount = Number(order.amount || 0);

      return {
        id: order.id,
        key: `order-${order.id}`,
        type: getOrderPaymentMethod(order),
        source: "Satış modulu",
        contractId: order.contractId || contract?.id || "Müqaviləsiz",
        orderId: order.id,
        creditId: "—",
        date: order.date || currentBusinessDate,
        product: summarizeOrderProducts(order),
        productLines: getOrderProductRows(order),
        amount,
        paid: Math.max(0, amount - balance),
        balance,
        initialPayment: Number(order.paid || 0),
        monthly: 0,
        months: 0,
        paidMonths: balance > 0 ? 0 : 1,
        remainingMonths: balance > 0 ? 1 : 0,
        nextDue: balance > 0 ? order.dueDate || "Razılaşdırılmayıb" : "—",
        status: balance > 0 ? "Qalıqlı satış" : "Ödənilib",
        overdueDays: 0,
        plan: null,
        paymentState: null,
        payments: [],
        order,
        contract,
      };
    });

  const standaloneContracts = customerContracts
    .filter((contract) => !usedContractIds.has(contract.id) && !orderById.has(contract.orderId))
    .map((contract) => ({
      id: contract.id,
      key: `contract-${contract.id}`,
      type: "Müqavilə",
      source: "Müqavilə modulu",
      contractId: contract.id,
      orderId: contract.orderId || "—",
      creditId: "—",
      date: contract.date || currentBusinessDate,
      product: contract.product || "Cihaz qeyd edilməyib",
      productLines: [{ product: contract.product || "Cihaz qeyd edilməyib", qty: 1, amount: Number(contract.amount || 0), serials: [] }],
      amount: Number(contract.amount || 0),
      paid: 0,
      balance: Number(contract.amount || 0),
      initialPayment: 0,
      monthly: 0,
      months: 0,
      paidMonths: 0,
      remainingMonths: 0,
      nextDue: "—",
      status: contract.status || "Hazırlanır",
      overdueDays: 0,
      plan: null,
      paymentState: null,
      payments: [],
      order: null,
      contract,
    }));

  const agreements = [...creditAgreements, ...directSaleAgreements, ...standaloneContracts].sort(sortByBusinessDateDesc);
  const paymentRows = customerCredits
    .flatMap((credit) =>
      (credit.payments || []).map((payment) => ({
        ...payment,
        creditId: credit.id,
        contractId: credit.contractId,
        product: credit.device || credit.product || "Cihaz qeyd edilməyib",
      })),
    )
    .sort(sortByBusinessDateDesc);

  const deviceRows = customerOrders.flatMap((order) => {
    const linkedCredit = getOrderCredit(order, customerCredits);
    const plan = linkedCredit ? getCreditDisplayPlan(linkedCredit) : null;
    const paidTotal = linkedCredit ? getCreditPaidTotal(plan) : Number(order.paid || 0);
    const balanceTotal = linkedCredit ? Number(plan.balance || 0) : getOrderBalance(order);
    const lineRows = getOrderProductRows(order);
    const lineTotal = lineRows.reduce((sum, line) => sum + Number(line.amount || 0), 0) || Number(order.amount || 0) || 1;

    return lineRows.map((line) => {
      const lineAmount = Number(line.amount || 0) || Math.round(Number(order.amount || 0) / Math.max(1, lineRows.length));
      const ratio = Math.min(1, Math.max(0, lineAmount / lineTotal));
      const contract = contractByOrderId.get(order.id) || contractById.get(order.contractId);
      return {
        id: `${order.id}-${line.product}-${line.qty}`,
        product: line.product,
        qty: line.qty,
        serials: line.serials,
        orderId: order.id,
        contractId: order.contractId || contract?.id || linkedCredit?.contractId || "—",
        creditId: linkedCredit?.id || "—",
        date: order.date,
        status: order.status,
        amount: Math.round(lineAmount),
        paid: Math.round(paidTotal * ratio),
        balance: Math.round(balanceTotal * ratio),
      };
    });
  });

  const totalPurchased = agreements.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalPaid = agreements.reduce((sum, row) => sum + Number(row.paid || 0), 0);
  const totalBalance = agreements.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const overdueAgreements = agreements.filter((agreement) => agreement.paymentState?.isOverdue);
  const nextPayment = creditAgreements
    .filter((agreement) => agreement.paymentState?.nextInstallment)
    .sort((a, b) => {
      const aTime = parsePaymentDate(a.nextDue)?.getTime() || 0;
      const bTime = parsePaymentDate(b.nextDue)?.getTime() || 0;
      return aTime - bTime;
    })[0];

  return {
    orders: customerOrders,
    credits: customerCredits,
    contracts: customerContracts,
    agreements,
    paymentRows,
    devices: deviceRows,
    totalPurchased,
    totalPaid,
    totalBalance,
    activeCreditCount: creditAgreements.filter((agreement) => !normalize(agreement.status).includes("bağlan")).length,
    overdueCount: overdueAgreements.length,
    openOrders: customerOrders.filter((order) => order.status !== "Təhvil verilib").length,
    nextPayment,
  };
}

export function buildCrmPipelineRows(customers, credits, orders) {
  return customers.map((customer, index) => {
    const customerCredits = getCustomerRelatedCredits(customer, credits);
    const customerOrders = getCustomerOrders(customer, orders);
    const latestOrder = getLatestOrder(customerOrders);
    const activeCreditCount = customerCredits.filter((credit) => !isCreditClosed(credit, getCreditDisplayPlan(credit))).length;
    const totalBalance = customerCredits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
    const overdueCredit = customerCredits.find((credit) =>
      getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue,
    );
    const limitLeft = Math.max(0, Number(customer.limit || 0) - Number(customer.debt || 0) - totalBalance);
    const openOrders = customerOrders.filter((order) => order.status !== "Təhvil verilib").length;
    const hasDeliveryFollowUp = openOrders > 0;
    const stage = overdueCredit
      ? "Risk follow-up"
      : hasDeliveryFollowUp
        ? "Təhvil sonrası"
        : customer.category === "Platin"
          ? "Upsell"
          : limitLeft > 3000
            ? "Təklif"
            : "Kredit uyğunluğu";
    const probability =
      stage === "Upsell" ? 82 : stage === "Təklif" ? 68 : stage === "Təhvil sonrası" ? 56 : stage === "Risk follow-up" ? 34 : 46;
    const owner = latestOrder?.sellerBonuses?.[0]?.seller || latestOrder?.seller || "Təyin edilməyib";
    const value = Math.max(0, Math.round((limitLeft || Number(customer.limit || 0) * 0.28) / 100) * 100);
    const nextPayment = customerCredits
      .map((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).nextInstallment)
      .find(Boolean);

    return {
      id: `${customer.fin}-${stage}`,
      customer,
      stage,
      owner,
      value,
      probability,
      source: latestOrder ? `Son sifariş: ${latestOrder.id}` : customer.category,
      nextAction:
        stage === "Risk follow-up"
          ? "Gecikmə üzrə zəng və SMS"
          : stage === "Təhvil sonrası"
            ? "Təhvil sonrası məmnunluq zəngi"
            : stage === "Upsell"
              ? "Premium cihaz təklifi"
              : stage === "Təklif"
                ? "Limitə uyğun kommersiya təklifi"
                : "AKB və limit yoxlaması",
      activeCreditCount,
      totalBalance,
      openOrders,
      limitLeft,
      nextPayment,
      lastOrderId: latestOrder?.id || "Yeni fürsət",
    };
  });
}

export function matchesCrmCustomerSegment(entry, segment) {
  const { customer, profile } = entry;
  if (segment === "Aktiv kredit") return profile.activeCreditCount > 0;
  if (segment === "Gecikmə") return profile.overdueCount > 0 || Number(customer.delay || 0) > 0;
  if (segment === "Açıq təhvil") return profile.openOrders > 0;
  if (segment === "Borcsuz") return Number(profile.totalBalance || 0) <= 0 && Number(customer.debt || 0) <= 0;
  return true;
}

export function matchesCrmCustomerSearch(entry, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  const { customer, profile } = entry;
  const text = [
    customer.name,
    customer.fin,
    customer.phone,
    customer.category,
    ...profile.agreements.flatMap((agreement) => [
      agreement.contractId,
      agreement.orderId,
      agreement.creditId,
      agreement.product,
      agreement.status,
    ]),
  ].join(" ");
  return normalize(text).includes(q);
}

export function matchesCrmPipelineFilter(row, filter) {
  return filter === "Hamısı" || row.stage === filter;
}

export function CustomerCreditHistory({ credits }) {
  if (credits.length === 0) return "Yoxdur";

  const latest = credits[0];
  const latestPlan = getCreditDisplayPlan(latest);
  const totalBalance = credits.reduce((sum, credit) => sum + getCreditDisplayPlan(credit).balance, 0);

  return (
    <div className="customer-credit-history">
      <strong>
        {credits.length} kredit · {money(totalBalance)} qalıq
      </strong>
      <span>
        {latest.id} · {latestPlan.months} ay · {money(latestPlan.monthly)}/ay
      </span>
    </div>
  );
}

export function Customer360Modal({ customer, credits, orders, contracts, onOpenSalesOrder, onOpenCredit, onClose }) {
  const profile = useMemo(
    () => buildCustomer360(customer, { credits, orders, contracts }),
    [customer, credits, orders, contracts],
  );
  const nextPayment = profile.nextPayment;
  const latestPayments = profile.paymentRows.slice(0, 5);

  return (
    <div className="modal-shell customer-360-modal-shell" role="dialog" aria-modal="true" aria-labelledby="customer-360-title">
      <div className="modal-card customer-360-modal-card">
        <div className="modal-head customer-360-head">
          <div>
            <h2 id="customer-360-title">{customer.name}</h2>
            <p>FİN {customer.fin} üzrə müqavilə, cihaz, ödəniş və təhvil 360 baxışı</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>

        <div className="customer-360-body">
          <section className="customer-360-profile-grid">
            <div className="customer-360-profile-card">
              <span className="customer-360-avatar">{getCreditInitials(customer.name)}</span>
              <div>
                <strong>{customer.name}</strong>
                <span>{customer.category} · FİN {customer.fin}</span>
              </div>
            </div>
            <div className="customer-360-profile-field">
              <span>Telefon</span>
              <strong>{customer.phone || "Qeyd edilməyib"}</strong>
            </div>
            <div className="customer-360-profile-field">
              <span>Kredit limiti</span>
              <strong>{money(customer.limit)}</strong>
            </div>
            <div className="customer-360-profile-field">
              <span>Risk statusu</span>
              <StatusBadge status={profile.overdueCount > 0 || customer.delay > 0 ? "Gecikmə nəzarəti" : "Sağlam"} />
            </div>
          </section>

          <section className="customer-360-summary">
            <div>
              <span>Müqavilə məbləği</span>
              <strong>{money(profile.totalPurchased)}</strong>
            </div>
            <div>
              <span>Ödənilib</span>
              <strong>{money(profile.totalPaid)}</strong>
            </div>
            <div>
              <span>Qalıq</span>
              <strong>{money(profile.totalBalance)}</strong>
            </div>
            <div>
              <span>Aktiv kredit</span>
              <strong>{profile.activeCreditCount}</strong>
            </div>
            <div>
              <span>Gecikmə</span>
              <strong>{profile.overdueCount}</strong>
            </div>
          </section>

          <section className="customer-360-grid">
            <div className="customer-360-main">
              <Panel className="customer-360-section">
                <PanelHeader title="Kredit və satış müqavilələri" subtitle="Hər satış ayrı borc kimi saxlanılır" icon={FileText} />
                <div className="customer-360-contract-list">
                  {profile.agreements.length === 0 ? (
                    <EmptyState title="Müştəri üzrə müqavilə yoxdur" />
                  ) : (
                    profile.agreements.map((agreement) => (
                      <article
                        className={`customer-360-contract-card${agreement.paymentState?.isOverdue ? " is-overdue" : ""}`}
                        key={agreement.key}
                      >
                        <div className="customer-360-contract-head">
                          <div>
                            <span>{agreement.type}</span>
                            <h3>{agreement.contractId}</h3>
                            <p>{agreement.product}</p>
                          </div>
                          <StatusBadge status={agreement.status} />
                        </div>
                        <div className="customer-360-contract-meta">
                          <span>
                            Sifariş
                            {agreement.orderId && agreement.orderId !== "—" ? (
                              <button
                                className="module-link-btn"
                                type="button"
                                onClick={() => onOpenSalesOrder?.(agreement.orderId)}
                                data-testid="crm-360-order-link"
                              >
                                {agreement.orderId}
                              </button>
                            ) : (
                              <strong>—</strong>
                            )}
                          </span>
                          <span>
                            Kredit
                            {agreement.creditId && agreement.creditId !== "—" ? (
                              <button
                                className="module-link-btn"
                                type="button"
                                onClick={() => onOpenCredit?.(agreement.creditId)}
                                data-testid="crm-360-credit-link"
                              >
                                {agreement.creditId}
                              </button>
                            ) : (
                              <strong>—</strong>
                            )}
                          </span>
                          <span>Tarix <strong>{agreement.date || "—"}</strong></span>
                          <span>Mənbə <strong>{agreement.source}</strong></span>
                        </div>
                        <div className="customer-360-contract-values">
                          <div>
                            <span>Müqavilə</span>
                            <strong>{money(agreement.amount)}</strong>
                          </div>
                          <div>
                            <span>İlkin / ödənilib</span>
                            <strong>{money(agreement.initialPayment)} / {money(agreement.paid)}</strong>
                          </div>
                          <div>
                            <span>Qalıq</span>
                            <strong>{money(agreement.balance)}</strong>
                          </div>
                          <div>
                            <span>Növbəti</span>
                            <strong>{agreement.monthly > 0 ? `${money(agreement.monthly)} · ${agreement.nextDue}` : "—"}</strong>
                          </div>
                        </div>
                        {agreement.plan ? (
                          <details className="customer-360-schedule-preview">
                            <summary>Ödəniş cədvəli · {agreement.paidMonths}/{agreement.months} ay · {agreement.remainingMonths} qalıb</summary>
                            <div className="customer-360-schedule-scroll">
                              {agreement.plan.installments.map((installment) => (
                                <div className="customer-360-schedule-row" key={`${agreement.id}-${installment.month}`}>
                                  <span>{installment.month}. ay</span>
                                  <strong>{money(installment.amount)}</strong>
                                  <em>{installment.due}</em>
                                  <StatusBadge status={getInstallmentStatus(installment)} />
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <div className="customer-360-direct-note">
                            <span>Satış balansı</span>
                            <strong>{agreement.balance > 0 ? `${money(agreement.balance)} qalıq` : "Tam ödənilib"}</strong>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Alınan cihazlar" subtitle="Hər cihaz üzrə ödənilən və qalan məbləğ" icon={Package} />
                <DataTable
                  columns={["Cihaz", "Müqavilə", "Sifariş", "Məbləğ", "Ödənilib", "Qalıq", "Status"]}
                  rows={profile.devices.map((device) => [
                    <TwoLine title={device.product} subtitle={`${device.qty} ədəd${device.serials.length ? ` · ${device.serials.join(", ")}` : ""}`} />,
                    device.contractId,
                    device.orderId,
                    money(device.amount),
                    money(device.paid),
                    <strong>{money(device.balance)}</strong>,
                    <StatusBadge status={device.status || "Aktiv"} />,
                  ])}
                />
              </Panel>
            </div>

            <aside className="customer-360-side">
              <Panel className="customer-360-section">
                <PanelHeader title="Yığım və risk" subtitle="Növbəti ödəniş, gecikmə və təhvil nəzarəti" icon={CreditCard} />
                <div className="customer-360-risk-list">
                  <div>
                    <span>Növbəti ödəniş</span>
                    <strong>{nextPayment ? `${money(nextPayment.monthly)} · ${nextPayment.nextDue}` : "Yoxdur"}</strong>
                  </div>
                  <div>
                    <span>Gecikən müqavilə</span>
                    <strong>{profile.overdueCount}</strong>
                  </div>
                  <div>
                    <span>Açıq təhvil</span>
                    <strong>{profile.openOrders}</strong>
                  </div>
                  <div>
                    <span>Ümumi qalıq</span>
                    <strong>{money(profile.totalBalance + Number(customer.debt || 0))}</strong>
                  </div>
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Son ödənişlər" subtitle="Əsas məbləğ və gecikmə gəliri ayrı göstərilir" icon={Wallet} />
                <div className="customer-360-payment-feed">
                  {latestPayments.length === 0 ? (
                    <EmptyState title="Ödəniş tarixçəsi yoxdur" />
                  ) : (
                    latestPayments.map((payment, index) => (
                      <div className="customer-360-payment-row" key={`${payment.creditId}-${payment.date}-${index}`}>
                        <div>
                          <strong>{payment.contractId || payment.creditId}</strong>
                          <span>{payment.product}</span>
                        </div>
                        <div>
                          <strong>{money(Number(payment.principal || 0) + Number(payment.penalty || 0))}</strong>
                          <span>Əsas {money(payment.principal)} · Gecikmə {money(payment.penalty)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Müştəri əlaqəsi" subtitle="Satış və yığım komandası üçün sürətli dosye" icon={Users} />
                <div className="customer-360-contact-card">
                  <div>
                    <span>FİN</span>
                    <strong>{customer.fin}</strong>
                  </div>
                  <div>
                    <span>Telefon</span>
                    <strong>{customer.phone || "—"}</strong>
                  </div>
                  <div>
                    <span>Kateqoriya</span>
                    <strong>{customer.category}</strong>
                  </div>
                  <div>
                    <span>Müqavilə sayı</span>
                    <strong>{profile.agreements.length}</strong>
                  </div>
                </div>
              </Panel>
            </aside>
          </section>
        </div>
      </div>
    </div>
  );
}

export function getInstallmentStatus(installment) {
  if (Number(installment.amount || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(installment.due);
  const today = parsePaymentDate(baseCreditDate);
  if (dueDate && today && daysBetween(dueDate, today) > 0) return "Gecikib";
  if (dueDate && today && daysBetween(dueDate, today) === 0) return "Bu gün";
  return "Gözləyir";
}

export const baseCreditDate = currentBusinessDate;

export function getCustomerRelatedCredits(customer, credits) {
  return credits.filter(
    (credit) => credit.fin === customer.fin || normalize(credit.customer) === normalize(customer.name),
  );
}

export function getCustomerOrders(customer, orders) {
  return orders.filter(
    (order) => order.fin === customer.fin || normalize(order.customer) === normalize(customer.name),
  );
}

export function getLatestOrder(orders) {
  return [...orders].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  })[0];
}

export function getCustomerContracts(customer, contracts = []) {
  return contracts.filter(
    (contract) => contract.fin === customer.fin || normalize(contract.customer) === normalize(customer.name),
  );
}

export function getCreditOrder(credit, orders = []) {
  return (
    orders.find(
      (order) =>
        order.id === credit.orderId ||
        order.creditId === credit.id ||
        (credit.contractId && order.contractId === credit.contractId),
    ) || null
  );
}

export function getCreditContract(credit, contracts = []) {
  return (
    contracts.find(
      (contract) =>
        contract.id === credit.contractId ||
        contract.creditId === credit.id ||
        (credit.orderId && contract.orderId === credit.orderId),
    ) || null
  );
}

export function getOrderProductRows(order) {
  if (Array.isArray(order.productLines) && order.productLines.length > 0) {
    return order.productLines.map((line) => {
      const qty = Math.max(1, Number(line.qty || 1));
      const amount = Math.max(0, Number(line.price || 0) * qty);
      return {
        product: line.product || order.products || "Cihaz qeyd edilməyib",
        qty,
        amount,
        serials: Array.isArray(line.serials) ? line.serials.filter(Boolean) : [],
      };
    });
  }

  return [
    {
      product: order.products || "Cihaz qeyd edilməyib",
      qty: 1,
      amount: Number(order.amount || 0),
      serials: [],
    },
  ];
}

export function getOrderCredit(order, credits = []) {
  return credits.find(
    (credit) =>
      credit.orderId === order.id ||
      credit.id === order.creditId ||
      (order.contractId && credit.contractId === order.contractId),
  );
}

export function sortByBusinessDateDesc(a, b) {
  const aTime = parsePaymentDate(a.date)?.getTime() || 0;
  const bTime = parsePaymentDate(b.date)?.getTime() || 0;
  return bTime - aTime;
}
