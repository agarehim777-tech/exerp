import { BarChart3, Bell, Boxes, Building2, CalendarClock, Check, ChevronRight, CreditCard, Download, FileText, Filter, LayoutDashboard, MessageSquare, Package, Pencil, Plus, RefreshCw, Search, Settings, ShieldCheck, ShoppingCart, SlidersHorizontal, Sparkles, Trash2, TrendingUp, Truck, Upload, UserCog, Users, Wallet, Warehouse, X } from "lucide-react";
import { AvatarLine, DataTable, EmptyState, Panel, PanelHeader, ProgressRow, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { lazy, useEffect, useMemo, useState } from "react";
import { money, normalize, percent } from "../../services/format.js";
import { total } from "../../shared/utils/aggregate.js";
import { formatDateInput, formatPaymentDate, parsePaymentDate, toDateInputValue } from "../../services/date.js";
import { daysBetween, getCreditDebtFormula, getCreditDisplayPlan, getCreditInitials, getCreditManagementStatus, getCreditPaidTotal, getCreditPaymentState, getCreditRiskLabel, getCreditSourceLabel, isCreditClosed, roundMoney } from "./credit.js";
import { buildModulePermissionCatalog, defaultRoles, getDefaultModuleAccessForRole as getDefaultModuleAccessForRoleFromCatalog, getModuleForPermission as getModuleForPermissionFromCatalog, normalizeUserModuleAccess as normalizeUserModuleAccessFromCatalog, permissionCatalog, uniquePermissionModuleIds } from "../../services/permissions.js";
import { initialState, navItems, stages } from "../../data.js";
export { applyCreditPrincipalPayment, buildCreditPlan, getCreditDebtFormula, getCreditDisplayPlan, getCreditInitials, getCreditManagementStatus, getCreditPaidTotal, getCreditPaymentState, getCreditRowDate, getCreditSourceLabel, getReceivableClosureAmount, isCreditClosed, matchesCreditManagementFilter, matchesCreditSearch, matchesCreditSourceFilter, monthNamesAz } from "./credit.js";
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

export const backorderDefaultLeadDays = 14;
export const backorderGrnDays = 3;

export function getBackorderPlan({
  product,
  missingQty = 0,
  purchaseOrders = [],
  today = new Date(),
  leadDays = backorderDefaultLeadDays,
}) {
  const missing = Math.max(0, Math.round(Number(missingQty || 0)));
  if (!product || missing <= 0) return null;

  const key = normalize(product);
  const openPos = (purchaseOrders || [])
    .filter((po) => normalize(po.product) === key && isPurchaseOrderOpen(po))
    .sort((a, b) => {
      const dateA = parsePaymentDate(a.expectedAt || a.date)?.getTime() || Infinity;
      const dateB = parsePaymentDate(b.expectedAt || b.date)?.getTime() || Infinity;
      return dateA - dateB;
    });
  const incomingQty = openPos.reduce((sum, po) => sum + Math.max(0, Number(po.qty || 0)), 0);
  const covered = Math.min(missing, incomingQty);
  const uncovered = missing - covered;
  const primaryPo = openPos[0] || null;
  const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const addDays = (date, days) => {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
  };

  let expectedDate;
  let step;
  let stepHint;

  if (!primaryPo) {
    expectedDate = addDays(baseDate, leadDays + backorderGrnDays);
    step = "Satınalma sifarişi (PO) yaradılmalıdır";
    stepHint = "Satınalma → PO təsdiqi → Anbar qəbulu (GRN) → Təhvil";
  } else {
    const poDate = parsePaymentDate(primaryPo.expectedAt) || addDays(parsePaymentDate(primaryPo.date) || baseDate, leadDays);
    expectedDate = addDays(poDate < baseDate ? baseDate : poDate, backorderGrnDays);
    const status = normalize(primaryPo.status);
    if (status.includes("gözl") || status.includes("gozl")) {
      step = `${primaryPo.id} PO təsdiqi gözlənilir`;
      stepHint = "PO təsdiqi → Anbar qəbulu (GRN) → Rezervin bağlanması → Təhvil";
    } else {
      step = `${primaryPo.id} üzrə anbar qəbulu (GRN)`;
      stepHint = "Anbar qəbulu (GRN) → Rezervin bağlanması → Təhvil";
    }
  }

  return {
    product,
    missingQty: missing,
    coveredQty: covered,
    uncoveredQty: uncovered,
    purchaseOrder: primaryPo,
    expectedDate,
    expectedLabel: formatPaymentDate(expectedDate),
    step,
    stepHint,
    closeStage: "Anbardan təhvil (rezerv bağlanır)",
  };
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


export function BarcodeBadge({ barcode, qrPayload }) {
  const widths = String(barcode)
    .slice(0, 12)
    .split("")
    .map((digit) => 1 + (Number(digit) % 3));
  const widthWithGaps = widths.reduce((sum, width) => sum + width + 2, 0);

  return (
    <div className="barcode-badge" title={qrPayload}>
      <svg className="barcode-lines" viewBox={`0 0 ${widthWithGaps} 18`} preserveAspectRatio="none" aria-hidden="true">
        {widths.map((width, index) => {
          const x = widths.slice(0, index).reduce((sum, item) => sum + item + 2, 0);
          return <rect key={`${barcode}-${index}`} x={x} y="0" width={width} height="18" />;
        })}
      </svg>
      <small>{barcode}</small>
    </div>
  );
}

export function CreditDetailModal({ item, sendCreditSms, onUpdatePaymentDate, onReceivePayment, onOpenSalesOrder, onClose }) {
  const { credit } = item;

  return (
    <div className="modal-shell credit-detail-modal-shell" role="dialog" aria-modal="true" aria-labelledby="credit-detail-modal-title">
      <div className="modal-card credit-detail-modal-card">
        <div className="modal-head credit-detail-modal-head">
          <div>
            <h2 id="credit-detail-modal-title">Kredit müqaviləsi</h2>
            <p>{credit.customer} üzrə fərdi müqavilə, cihaz, ödəniş və tarixçə məlumatları</p>
            <div className="credit-detail-title-meta">
              <span>{credit.id}</span>
              <span>{credit.contractId || "Müqaviləsiz"}</span>
              <span>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <div className="credit-detail-modal-body">
          <CreditDetail
            item={item}
            sendCreditSms={sendCreditSms}
            onUpdatePaymentDate={onUpdatePaymentDate}
            onReceivePayment={onReceivePayment}
            onOpenSalesOrder={onOpenSalesOrder}
          />
        </div>
      </div>
    </div>
  );
}

export function DeliveryOrdersPanel({ orders, isAllWarehouses, warehouseStock = {}, onCompleteDelivery }) {
  return (
    <div className="delivery-orders-panel">
      <PanelHeader
        title="Təhvil verilməli məhsullar"
        subtitle={
          isAllWarehouses
            ? "Bütün anbarlar üzrə rezervdə olan və təhvil gözləyən sifarişlər"
            : "Seçilmiş anbardan çıxarılmalı rezerv məhsullar"
        }
      />
      <DataTable
        columns={["Sifariş", "Müştəri", "Məhsullar", "Anbar", "Ödəniş", "Rezerv", "Əməliyyat"]}
        rows={orders.map((order) => {
          const stockCheck = getDeliveryStockCheck(order, warehouseStock);
          return [
            <strong>{order.id}</strong>,
            <TwoLine title={order.customer} subtitle={order.fin} />,
            <OrderProductLines lines={order.productLines} />,
            order.warehouseName || "Baş Anbar",
            <StatusBadge status={order.paymentStatus || order.paymentMethod || "Nağd"} />,
            <TwoLine
              title={<StatusBadge status={stockCheck.status} />}
              subtitle={
                stockCheck.partial
                  ? `${stockCheck.plan.deliverableTotal} ədəd indi · ${stockCheck.plan.shortageTotal} backorder`
                  : stockCheck.ok
                    ? `${stockCheck.plan?.remainingTotal ?? getDeliveryTotalQuantity(order)} ədəd rezervdə`
                    : stockCheck.reason
              }
            />,
            <button
              className="text-btn"
              disabled={!stockCheck.ok}
              title={stockCheck.reason}
              onClick={() => onCompleteDelivery(order.id)}
            >
              {stockCheck.partial ? "Qismən təhvil ver" : "Təhvil verildi"}
            </button>,

          ];
        })}
      />
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled = false }) {
  return (
    <button className="toggle-row" onClick={onChange} disabled={disabled} title={disabled ? "Bu ayarı dəyişmək üçün icazə yoxdur" : ""}>
      <span>{label}</span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}

export function WarehouseBalancesWorkspace({
  warehouses,
  warehouseStock,
  products,
  purchaseOrders = [],
  query,
  onReceiveStock,
  onOpenImport,
  onCreateProduct,
  onEditProduct,
  onOpenProduct,
  onSelectWarehouse,
  onOpenOperations,
  onTrackAction,
}) {
  const [view, setView] = useState("products");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [draftFilters, setDraftFilters] = useState(() => ({ ...warehouseBalanceFilterDefaults }));
  const [activeFilters, setActiveFilters] = useState(() => ({ ...warehouseBalanceFilterDefaults }));
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "az")),
    [products],
  );
  const balanceRows = useMemo(
    () => buildWarehouseBalanceRows({ warehouses, warehouseStock, products, purchaseOrders, view, warehouseId: activeFilters.warehouseId }),
    [warehouses, warehouseStock, products, purchaseOrders, view, activeFilters.warehouseId],
  );
  const visibleRows = useMemo(
    () => filterWarehouseBalanceRows(balanceRows, activeFilters, query),
    [balanceRows, activeFilters, query],
  );
  const productRows = useMemo(
    () => buildWarehouseBalanceRows({ warehouses, warehouseStock, products, purchaseOrders, view: "products", warehouseId: activeFilters.warehouseId }),
    [warehouses, warehouseStock, products, purchaseOrders, activeFilters.warehouseId],
  );
  const warehouseRows = useMemo(
    () => buildWarehouseBalanceRows({ warehouses, warehouseStock, products, purchaseOrders, view: "warehouses", warehouseId: activeFilters.warehouseId }),
    [warehouses, warehouseStock, products, purchaseOrders, activeFilters.warehouseId],
  );

  function changeDraftFilter(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setActiveFilters({ ...draftFilters });
  }

  function clearFilters() {
    const next = { ...warehouseBalanceFilterDefaults };
    setDraftFilters(next);
    setActiveFilters(next);
  }

  function showReplenishmentRows() {
    const next = { ...activeFilters, stockStatus: "below", belowMinimum: true };
    const replenishmentCount = balanceRows.filter((row) => row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq").length;
    setDraftFilters(next);
    setActiveFilters(next);
    setFiltersOpen(true);
    onTrackAction?.("Ehtiyat tamamlama siyahısı açıldı", `${replenishmentCount} məhsul/anbar sətrinə minimum stok filtri tətbiq edildi`);
  }

  function handleExport() {
    exportWarehouseBalanceCsv(visibleRows, view);
    onTrackAction?.("Anbar qalıqları CSV ixrac edildi", `${visibleRows.length} sətir · ${view === "products" ? "məhsullar üzrə" : "anbarlar üzrə"}`);
  }

  function handlePrint() {
    onTrackAction?.("Anbar qalıqları çap üçün açıldı", `${visibleRows.length} sətir · ${view === "products" ? "məhsullar üzrə" : "anbarlar üzrə"}`);
    document.body.classList.add("warehouse-print-mode");
    const clearPrintMode = () => document.body.classList.remove("warehouse-print-mode");
    window.addEventListener("afterprint", clearPrintMode, { once: true });
    window.print();
    window.setTimeout(clearPrintMode, 1000);
  }

  function selectWarehouse(warehouseId) {
    const next = { ...activeFilters, warehouseId };
    setDraftFilters(next);
    setActiveFilters(next);
    onSelectWarehouse(warehouseId);
  }

  return (
    <section className="warehouse-balance-workspace">
      <div className="warehouse-balance-toolbar">
        <div className="warehouse-balance-tabs" role="tablist" aria-label="Qalıq görünüşü">
          <button type="button" role="tab" aria-selected={view === "products"} className={view === "products" ? "active" : ""} onClick={() => setView("products")}>
            Məhsullar üzrə <strong>{productRows.length}</strong>
          </button>
          <button type="button" role="tab" aria-selected={view === "warehouses"} className={view === "warehouses" ? "active" : ""} onClick={() => setView("warehouses")}>
            Anbarlar üzrə <strong>{warehouseRows.length}</strong>
          </button>
        </div>
        <div className="warehouse-balance-actions">
          <button type="button" className="secondary-btn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <Filter size={16} /> Filter
          </button>
          <button type="button" className="secondary-btn" onClick={handlePrint}>
            <FileText size={16} /> Çap
          </button>
          <button type="button" className="secondary-btn" onClick={handleExport}>
            <Download size={16} /> İxrac CSV
          </button>
          <button type="button" className="secondary-btn" onClick={showReplenishmentRows}>
            <RefreshCw size={16} /> Ehtiyatı tamamla
          </button>
          <div className="warehouse-action-menu">
            <button type="button" className="primary-btn" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((open) => !open)}>
              <ShoppingCart size={16} /> Əməliyyatlar <ChevronRight size={15} />
            </button>
            {actionMenuOpen && (
              <div className="warehouse-action-menu-popover">
                <button type="button" onClick={() => { setActionMenuOpen(false); onReceiveStock(); }}><Plus size={15} /> Mədaxil et</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenImport(); }}><Upload size={15} /> Toplu import</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onCreateProduct(); }}><Package size={15} /> Məhsul yarat</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenOperations(); }}><Warehouse size={15} /> Anbar idarəetməsi</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <WarehouseBalanceFilters
        filters={draftFilters}
        warehouses={warehouses}
        categories={categories}
        open={filtersOpen}
        onChange={changeDraftFilter}
        onApply={applyFilters}
        onClear={clearFilters}
      />
      <div className="warehouse-balance-table-meta">
        <span>{visibleRows.length} qalıq sətri</span>
        <strong>{view === "products" ? "Məhsullar üzrə cari qalıq" : "Anbarlar üzrə cari qalıq"}</strong>
      </div>
      <WarehouseBalanceTable
        rows={visibleRows}
        view={view}
        onEditProduct={onEditProduct}
        onOpenProduct={onOpenProduct}
        onCreateProduct={onCreateProduct}
        onSelectWarehouse={selectWarehouse}
      />
    </section>
  );
}

// WarehousePage moved to ./pages/WarehousePage.jsx (lazy chunk)

export function WarehouseControlPanel({ summary, deliveryCount, alerts, isAllWarehouses, onSelect }) {
  return (
    <Panel className="warehouse-control-panel">
      <PanelHeader
        title="Anbar nəzarəti"
        subtitle={isAllWarehouses ? "Bütün anbarlar üzrə canlı əməliyyat xülasəsi" : "Seçilmiş anbar üzrə əməliyyat xülasəsi"}
        icon={SlidersHorizontal}
      />
      <div className="warehouse-control-grid">
        <div className="warehouse-control-tile">
          <span>Satış üçün</span>
          <strong>{summary.available} ədəd</strong>
          <small>{money(summary.value)} dəyər</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Rezerv yükü</span>
          <strong>{summary.reserved} ədəd</strong>
          <small>{percent(summary.reservedRate)} stok rezervdə</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Təhvil növbəsi</span>
          <strong>{deliveryCount}</strong>
          <small>Anbardan çıxmalı sifariş</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Doluluq</span>
          <strong>{summary.utilization}%</strong>
          <small>{summary.sku} məhsul çeşidi</small>
        </div>
      </div>
      <div className="warehouse-signal-list">
        {alerts.slice(0, 4).map((alert) => (
          <button key={`${alert.warehouseId}-${alert.product}`} className="warehouse-signal-row" onClick={() => onSelect(alert.warehouseId)}>
            <div>
              <strong>{alert.product}</strong>
              <span>
                {alert.warehouseName} · satış üçün {alert.available} ədəd
              </span>
            </div>
            <StatusBadge status={alert.status} />
          </button>
        ))}
        {alerts.length === 0 && (
          <div className="warehouse-signal-empty">
            <Check size={16} />
            Kritik stok siqnalı yoxdur
          </div>
        )}
      </div>
    </Panel>
  );
}

export function WarehouseDistribution({ distribution }) {
  return (
    <div className="warehouse-distribution">
      {distribution
        .filter((item) => item.total > 0)
        .map((item) => (
          <span key={item.warehouse}>
            {item.warehouse}: <strong>{item.available}</strong>
          </span>
        ))}
    </div>
  );
}

export function WarehouseStockToolbar({ filter, setFilter }) {
  const filters = ["Hamısı", "Satış üçün var", "Rezervdə", "Aşağı stok"];
  return (
    <div className="warehouse-stock-toolbar">
      <div>
        <h2>Anbar üzrə mallar</h2>
        <p>Filter seçib ümumi və ya seçilmiş anbar üzrə qalıqlara baxın</p>
      </div>
      <div className="tabs">
        {filters.map((item) => (
          <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WarehouseTransferPanel({ suggestions, onTransferStock }) {
  return (
    <div className="warehouse-transfer-panel">
      <PanelHeader
        title="Transfer tövsiyələri"
        subtitle="Aşağı qalıqlı anbarlara artıq stok olan anbardan daxili transfer"
        icon={Truck}
      />
      <DataTable
        columns={["Məhsul", "Haradan", "Haraya", "Miqdar", "Səbəb", "Əməliyyat"]}
        rows={suggestions.map((suggestion) => [
          <strong>{suggestion.product}</strong>,
          suggestion.fromWarehouse,
          suggestion.toWarehouse,
          `${suggestion.qty} ədəd`,
          suggestion.reason,
          <button className="text-btn" onClick={() => onTransferStock(suggestion)}>
            Transfer et
          </button>,
        ])}
      />
    </div>
  );
}

export function buildAggregateWarehouseStock(warehouses, warehouseStock) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map();

  Object.entries(warehouseStock).forEach(([warehouseId, items]) => {
    const warehouse = warehouseById.get(warehouseId);
    items.forEach((item) => {
      const current = byProduct.get(item.product) || {
        product: item.product,
        total: 0,
        reserved: 0,
        price: item.price,
        distribution: [],
      };
      current.total += Number(item.total || 0);
      current.reserved += Number(item.reserved || 0);
      current.price = item.price || current.price;
      current.distribution.push({
        warehouse: warehouse?.name || warehouseId,
        total: Number(item.total || 0),
        available: Number(item.total || 0) - Number(item.reserved || 0),
      });
      byProduct.set(item.product, current);
    });
  });

  return [...byProduct.values()].sort((a, b) => a.product.localeCompare(b.product, "az"));
}

export function buildDailyCashSummary(ledger, openingBalance = 0, targetDate = baseFinanceDate) {
  const target = parsePaymentDate(targetDate);
  const targetKey = formatDateInput(target || new Date());
  const previousRows = ledger.filter((row) => {
    const rowDate = parsePaymentDate(row.date);
    return rowDate && target && rowDate < target;
  });
  const dayRows = ledger.filter((row) => formatDateInput(parsePaymentDate(row.date) || new Date(0)) === targetKey);
  const sumRows = (rows, direction) =>
    rows
      .filter((row) => row.direction === direction)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const previousInflow = sumRows(previousRows, "in");
  const previousOutflow = sumRows(previousRows, "out");
  const opening = Number(openingBalance || 0) + previousInflow - previousOutflow;
  const inflow = sumRows(dayRows, "in");
  const outflow = sumRows(dayRows, "out");
  const pendingOutflow = sumRows(dayRows, "pending");
  const accrual = sumRows(dayRows, "accrual");
  const penalty = dayRows.reduce((sum, row) => sum + Number(row.penalty || 0), 0);

  return {
    date: targetKey,
    label: formatPaymentDate(target),
    opening,
    inflow,
    outflow,
    pendingOutflow,
    accrual,
    penalty,
    closing: opening + inflow - outflow,
    projectedClosing: opening + inflow - outflow - pendingOutflow,
    rows: dayRows,
  };
}

export function buildExpenseCategoryRows(expenses) {
  const byCategory = expenses.reduce((map, expense) => {
    const current = map.get(expense.category) || {
      category: expense.category,
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    };
    current.total += Number(expense.amount || 0);
    if (expense.status === "Təsdiq edildi") current.approved += Number(expense.amount || 0);
    if (expense.status === "Təsdiq gözləyir") current.pending += Number(expense.amount || 0);
    if (expense.status === "İmtina edildi") current.rejected += Number(expense.amount || 0);
    map.set(expense.category, current);
    return map;
  }, new Map());

  return [...byCategory.values()].sort((a, b) => b.total - a.total);
}

export function buildFinanceLedger({ orders, expenses, cashEntries }) {
  const salesRows = orders
    .filter((order) => Number(order.paid || 0) > 0)
    .map((order) => {
      const paymentMethod = getOrderPaymentMethod(order);
      const account = ["Kart", "Köçürmə"].includes(paymentMethod) ? "Bank hesabı" : "Kassa";
      return {
        id: `SALE-${order.id}`,
        date: order.date,
        type: "Satış",
        source: "Satış modulu",
        category: paymentMethod,
        account,
        title: order.id,
        description: summarizeOrderProducts(order),
        party: order.customer,
        principal: Number(order.paid || 0),
        penalty: 0,
        amount: Number(order.paid || 0),
        direction: "in",
        status: order.paymentStatus || paymentMethod,
        orderId: order.id,
        creditId: order.creditId || "",
        contractId: order.contractId || "",
        poId: "",
      };
    });

  const creditRows = cashEntries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    type: entry.type || "Kredit",
    source: entry.source || "Kredit modulu",
    category: entry.category || "Kredit ödənişi",
    account: entry.account || "Kassa",
    title: entry.creditId || entry.orderId || entry.receivableId || entry.id,
    description: entry.contractId || entry.note || "Müqavilə qeyd edilməyib",
    party: entry.customer,
    principal: Number(entry.principal || 0),
    penalty: Number(entry.penalty || 0),
    amount: Number(entry.amount || 0),
    direction: "in",
    status: "Kassaya daxil oldu",
    orderId: entry.orderId || "",
    creditId: entry.creditId || "",
    contractId: entry.contractId || "",
    poId: "",
  }));

  const expenseRows = expenses.map((expense) => {
    const approved = expense.status === "Təsdiq edildi";
    const rejected = expense.status === "İmtina edildi";
    const cashImpact = hasExpenseCashImpact(expense);
    const direction = !cashImpact ? "accrual" : approved ? "out" : rejected ? "ignored" : "pending";
    return {
      id: expense.id,
      date: expense.date,
      type: "Xərc",
      source: expense.source || "Maliyyə modulu",
      category: expense.category,
      account: !cashImpact ? "Uçot xərci" : direction === "ignored" ? "Təsirsiz" : expense.account || "Kassa",
      title: expense.description,
      description: expense.category,
      party: "Şirkət xərci",
      principal: 0,
      penalty: 0,
      amount: Number(expense.amount || 0),
      direction,
      status: cashImpact ? expense.status : `${expense.status} · cash təsiri yoxdur`,
      orderId: expense.orderId || "",
      creditId: expense.creditId || "",
      contractId: expense.contractId || "",
      poId: expense.poId || "",
      expenseId: expense.id,
    };
  });

  return sortByFinanceDate([...salesRows, ...creditRows, ...expenseRows]);
}

export function buildFinanceScenario({ orders, expenses, credits, cashEntries, openingBalance = 0 }) {
  const ledger = buildFinanceLedger({ orders, expenses, cashEntries });
  const inflow = ledger.filter((row) => row.direction === "in").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const approvedExpense = expenses
    .filter((expense) => expense.status === "Təsdiq edildi" && hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const pendingExpense = expenses
    .filter((expense) => expense.status === "Təsdiq gözləyir" && hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const creditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const grossSales = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const estimatedCost = Math.round(grossSales * 0.68);
  const grossProfit = grossSales - estimatedCost;

  return {
    inflow,
    approvedExpense,
    pendingExpense,
    creditBalance,
    grossSales,
    estimatedCost,
    grossProfit,
    margin: grossSales > 0 ? (grossProfit / grossSales) * 100 : 0,
    cashAfterPending: Number(openingBalance || 0) + inflow - approvedExpense - pendingExpense,
  };
}

export function buildWarehouseStockAlerts(warehouses, warehouseStock, products = []) {
  const productsByName = buildProductLookup(products);

  return warehouses.flatMap((warehouse) =>
    (warehouseStock[warehouse.id] || [])
      .map((item) => ({
        item,
        reorderPoint: getReorderPoint(item, productsByName),
      }))
      .filter(({ item, reorderPoint }) => reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint)
      .map(({ item, reorderPoint }) => ({
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          city: warehouse.city,
          product: item.product,
          total: Number(item.total || 0),
          reserved: Number(item.reserved || 0),
          available: getAvailableQuantity(item),
          reorderPoint,
          status: getAvailableQuantity(item) <= Math.max(1, Math.floor(reorderPoint / 2)) ? "Kritik stok" : "Aşağı stok",
        })),
  );
}

export function buildWarehouseSummaries(warehouses, warehouseStock, products = []) {
  return warehouses.map((warehouse) => ({
    warehouse,
    ...getWarehouseStockSummary(warehouseStock[warehouse.id] || [], Number(warehouse.capacity || 0), products),
  }));
}

export function buildWarehouseTransferSuggestions(warehouses, warehouseStock) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map();

  Object.entries(warehouseStock).forEach(([warehouseId, items]) => {
    items.forEach((item) => {
      const rows = byProduct.get(item.product) || [];
      rows.push({
        warehouseId,
        warehouseName: warehouseById.get(warehouseId)?.name || warehouseId,
        city: warehouseById.get(warehouseId)?.city || "",
        product: item.product,
        price: Number(item.price || 0),
        total: Number(item.total || 0),
        reserved: Number(item.reserved || 0),
        available: getAvailableQuantity(item),
      });
      byProduct.set(item.product, rows);
    });
  });

  return [...byProduct.entries()].flatMap(([product, rows]) => {
    const targets = rows.filter((row) => row.available <= 3).sort((a, b) => a.available - b.available);
    const sources = rows.filter((row) => row.available >= 6).sort((a, b) => b.available - a.available);
    return targets.flatMap((target) => {
      const source = sources.find((item) => item.warehouseId !== target.warehouseId);
      if (!source) return [];
      const qty = Math.max(1, Math.min(5 - target.available, source.available - 4));
      if (qty <= 0) return [];
      return {
        id: `${product}-${source.warehouseId}-${target.warehouseId}`,
        product,
        fromWarehouseId: source.warehouseId,
        fromWarehouse: source.warehouseName,
        toWarehouseId: target.warehouseId,
        toWarehouse: target.warehouseName,
        qty,
        reason: `${target.warehouseName} üzrə satış üçün ${target.available} qalıb`,
      };
    });
  });
}

export function buildWarehouseWmsRows(items, products = []) {
  const productsByName = buildProductLookup(products);

  return items.map((item, index) => {
    const available = getAvailableQuantity(item);
    const serialSummary = getSerialSummary(item.serials || []);
    const catalogProduct = productsByName.get(normalize(item.product));
    const reorderPoint = getReorderPoint(item, productsByName);
    const serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
    const reorderQty = Math.max(0, reorderPoint * 2 - available);
    const brandCode = normalize(item.product).replace(/[^a-z0-9]/g, "").slice(0, 5).toLocaleUpperCase("az-AZ");
    const sku = `SKU-${brandCode || index + 1}-${String(index + 1).padStart(3, "0")}`;
    const barcode = `869${String(index + 100000001).padStart(9, "0")}`;
    return {
      sku,
      barcode,
      qrPayload: `ERPZ|${sku}|${item.product}|${available}`,
      product: item.product,
      bin: `${String.fromCharCode(65 + (index % 4))}-${String((index % 6) + 1).padStart(2, "0")}`,
      serialMode: serialTracked ? "IMEI/Serial" : "Batch",
      cycleCount: index % 3 === 0 ? "Bu həftə" : index % 3 === 1 ? "Növbəti həftə" : "Aylıq",
      available,
      reserved: Number(item.reserved || 0),
      serialSummary,
      sampleSerial: item.serials?.find((serial) => serial.status !== "Satılıb")?.imei || "Batch",
      reorderPoint,
      reorderQty,
      status: reorderQty > 0 ? "Sifariş aç" : available <= reorderPoint + 2 ? "Nəzarət" : "Normal",
    };
  });
}

export function filterRows(rows, query) {
  if (!query.trim()) return rows;
  const q = normalize(query);
  return rows.filter((row) => normalize(Object.values(row).join(" ")).includes(q));
}

export function filterWarehouseItems(items, filter) {
  if (filter === "Satış üçün var") {
    return items.filter((item) => item.total - item.reserved > 0);
  }
  if (filter === "Rezervdə") {
    return items.filter((item) => item.reserved > 0);
  }
  if (filter === "Aşağı stok") {
    return items.filter((item) => item.total - item.reserved <= 3);
  }
  return items;
}

export function getActiveRole(settings = {}) {
  const safeSettings = ensureSettings(settings);
  const user = safeSettings.users.find((item) => item.id === safeSettings.sessionUserId);
  if (user?.role === "Platform Super Admin") {
    return { name: "Platform Super Admin", scope: "Bütün platforma və əsas ERP tenant-ına tam giriş", permissions: permissionCatalog.map((item) => item.key) };
  }
  return safeSettings.roles.find((role) => role.name === safeSettings.currentRole) || safeSettings.roles[0];
}

export function getAvailableQuantity(item) {
  return Math.max(0, Number(item.total || 0) - Number(item.reserved || 0));
}

// Satış üçün real sərbəst qalıq — mənfi ola bilər (backorder / sifariş gözləyən miqdar).

export function getDefaultModuleAccessForRole(roleName, roles = defaultRoles) {
  return getDefaultModuleAccessForRoleFromCatalog(roleName, roles, navItems);
}

export function getModuleForPermission(permission) {
  return getModuleForPermissionFromCatalog(permission, modulePermissionCatalog);
}

export function getNormalizedVendor(vendor = {}) {
  const key = getVendorKey(vendor);
  return {
    ...normalizeVendor({ ...vendor, id: key }, vendor),
    id: key,
  };
}

export function getVendorKey(vendor = {}) {
  return vendor.id || `VND-${normalize(vendor.name).replace(/[^a-z0-9]+/g, "-") || "vendor"}`;
}

export function getWarehouseStockSummary(items, capacity = 0, products = []) {
  const productsByName = buildProductLookup(products);
  const totalQty = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reservedQty = total(items, "reserved");
  const availableQty = Math.max(0, totalQty - reservedQty);
  const value = items.reduce((sum, item) => sum + getAvailableQuantity(item) * Number(item.price || 0), 0);
  return {
    sku: items.length,
    total: totalQty,
    reserved: reservedQty,
    available: availableQty,
    value,
    lowStock: items.filter((item) => isLowStockItem(item, productsByName)).length,
    utilization: capacity > 0 ? Math.min(100, Math.round((totalQty / capacity) * 100)) : 0,
    reservedRate: totalQty > 0 ? (reservedQty / totalQty) * 100 : 0,
  };
}

export function hasExpenseCashImpact(expense = {}) {
  if (expense.cashImpact === false) return false;
  return expense.source !== "HR Payroll";
}

export const modulePermissionCatalog = buildModulePermissionCatalog(navItems);

export const navIcons = {
  dashboard: LayoutDashboard,
  assistant: Sparkles,
  platform: Building2,
  crm: Users,
  "crm-deals": TrendingUp,
  "crm-activities": MessageSquare,
  "crm-tasks": ShieldCheck,
  sales: ShoppingCart,
  "sales-dashboard": BarChart3,
  "sales-quotes": FileText,
  "sales-shipments": Truck,
  warehouse: Warehouse,
  stock: Boxes,
  deliveries: Truck,
  finance: Wallet,
  cashbook: Wallet,
  "ar-invoices": FileText,
  invoices: FileText,
  accounting: BarChart3,
  tax: CalendarClock,
  credits: CreditCard,
  receivables: Wallet,
  vendors: Building2,
  procurement: ShoppingCart,
  projects: BarChart3,
  production: Package,
  hr: UserCog,
  kpi: TrendingUp,
  contracts: FileText,
  reports: BarChart3,
  support: MessageSquare,
  help: FileText,
  onboarding: ShieldCheck,
  messages: MessageSquare,
  notifications: Bell,
  api: ShieldCheck,
  settings: Settings,
  roles: ShieldCheck,
  "access-check": ShieldCheck,
  audit: ShieldCheck,
  periods: FileText,
  currencies: FileText,
  "financial-statements": FileText,

};

export function normalizeUserModuleAccess(user, roles) {
  return normalizeUserModuleAccessFromCatalog(user, roles, navItems);
}

export const targetDbProvider = String(import.meta.env?.VITE_DB_PROVIDER || "sqlite").trim();

export function uniqueModuleIds(moduleIds = []) {
  return uniquePermissionModuleIds(moduleIds, navItems);
}

export function userHasEffectivePermission(user, roles, permission) {
  if (!permission) return true;
  if (!user) return false;
  if (user.role === "Super Admin" || user.role === "Platform Super Admin") return true;
  const role = roles.find((item) => item.name === user.role);
  const roleAllows = Array.isArray(role?.permissions) && role.permissions.includes(permission);
  const moduleId = getModuleForPermission(permission);
  const moduleAllows = !moduleId || normalizeUserModuleAccess(user, roles).includes(moduleId);
  return roleAllows && moduleAllows;
}

// Bu kolleksiyalar artıq real Supabase cədvəllərində saxlanılır — blob snapshot-a yazılmır.

export function isLowStockItem(item, productsByName = new Map()) {
  const reorderPoint = getReorderPoint(item, productsByName);
  return reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint;
}

export function normalizeVendor(values = {}, fallback = {}) {
  const name = String(values.name ?? fallback.name ?? "").trim();
  return {
    id: fallback.id || values.id || `VND-${Date.now()}`,
    name,
    country: String(values.country ?? fallback.country ?? "").trim(),
    sku: Math.max(0, Math.round(Number(values.sku ?? fallback.sku ?? 0))),
    sold: Math.max(0, Math.round(Number(values.sold ?? fallback.sold ?? 0))),
    quota: Math.max(0, Math.round(Number(values.quota ?? fallback.quota ?? 0))),
    status: values.status || fallback.status || "Aktiv",
    contact: String(values.contact ?? fallback.contact ?? "").trim(),
    phone: String(values.phone ?? fallback.phone ?? "").trim(),
    email: String(values.email ?? fallback.email ?? "").trim(),
    leadTimeDays: Math.max(0, Math.round(Number(values.leadTimeDays ?? fallback.leadTimeDays ?? 14))),
    paymentTerms: String(values.paymentTerms ?? fallback.paymentTerms ?? "30 gün").trim(),
    note: String(values.note ?? fallback.note ?? "").trim(),
  };
}

export function ensureSettings(settings = {}) {
  const baseSettings = initialState.settings || {};
  const roles = mergeRoles(Array.isArray(settings.roles) ? settings.roles : []);
  const users = mergeUsers(Array.isArray(settings.users) ? settings.users : baseSettings.users || []).map((user) => ({
    ...user,
    moduleAccess: normalizeUserModuleAccess(user, roles),
  }));
  const fallbackUser = users.find((user) => user.status === "Aktiv") || users[0] || null;
  const sessionUserId =
    settings.sessionUserId === null
      ? null
      : users.some((user) => user.id === settings.sessionUserId && user.status === "Aktiv")
        ? settings.sessionUserId
        : fallbackUser?.id || null;
  const sessionUser = users.find((user) => user.id === sessionUserId) || null;
  const currentRole =
    sessionUser?.role && roles.some((role) => role.name === sessionUser.role)
      ? sessionUser.role
      : settings.currentRole && roles.some((role) => role.name === settings.currentRole)
        ? settings.currentRole
        : roles[0]?.name || defaultRoles[0].name;

  return {
    ...baseSettings,
    ...settings,
    toggles: {
      ...(baseSettings.toggles || {}),
      ...(settings.toggles || {}),
    },
    roles,
    users,
    sessionUserId,
    currentRole,
  };
}

export function mergeRoles(savedRoles = []) {
  const savedByName = new Map(savedRoles.map((role) => [role.name, role]));

  return defaultRoles.map((defaultRole) => {
    const saved = savedByName.get(defaultRole.name);
    if (!saved) return defaultRole;

    return {
      ...defaultRole,
      ...saved,
      permissions:
        defaultRole.name === "Super Admin"
          ? permissionCatalog.map((item) => item.key)
          : [...new Set([...(defaultRole.permissions || []), ...(saved.permissions || [])])],
    };
  });
}

export function mergeUsers(savedUsers = []) {
  const savedById = new Map(savedUsers.map((user) => [user.id, user]));
  const defaults = getDefaultUsers().map((user) => ({
    ...user,
    ...(savedById.get(user.id) || {}),
  }));
  const defaultIds = new Set(defaults.map((user) => user.id));
  const customUsers = savedUsers.filter((user) => user.id && !defaultIds.has(user.id));
  return [...defaults, ...customUsers];
}

export function getDefaultUsers() {
  return initialState.settings?.users || [];
}

export function getSerialSummary(serials = []) {
  return {
    available: serials.filter((serial) => serial.status === "Anbarda").length,
    reserved: serials.filter((serial) => serial.status === "Rezervdə").length,
    sold: serials.filter((serial) => serial.status === "Satılıb").length,
  };
}

export function isSerialTrackedProduct(item = {}) {
  if (typeof item.serialTracked === "boolean") return item.serialTracked;
  return Number(item.price || 0) >= 1500;
}

export function sortByFinanceDate(rows) {
  return [...rows].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  });
}

export const warehouseBalanceFilterDefaults = {
  productQuery: "",
  warehouseId: "all",
  category: "all",
  stockStatus: "all",
  reserveStatus: "all",
  serialStatus: "all",
  belowMinimum: false,
};

export function buildWarehouseBalanceRows({ warehouses = [], warehouseStock = {}, products = [], purchaseOrders = [], view = "products", warehouseId = "all" }) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const createRow = (productName, catalogProduct = null) => ({
    key: catalogProduct?.id || normalize(productName),
    product: productName,
    productId: catalogProduct?.id || "",
    category: catalogProduct?.category || "Kataloqu olmayan",
    sku: catalogProduct?.sku || "—",
    unit: catalogProduct?.unit || "ədəd",
    serialTracked: Boolean(catalogProduct?.serialTracked),
    costPrice: Number(catalogProduct?.costPrice || 0),
    salePrice: Number(catalogProduct?.salePrice || 0),
    reorderLevel: Number(catalogProduct?.reorderLevel || 0),
    total: 0,
    reserved: 0,
    orderedQty: 0,
    openPoCount: 0,
    latestPoId: "",
    warehouseDistribution: [],
  });

  if (view === "products") {
    const rowsByProduct = new Map();
    products.filter((product) => product.status !== "Passiv").forEach((product) => {
      rowsByProduct.set(normalize(product.name), createRow(product.name, product));
    });

    Object.entries(warehouseStock).forEach(([sourceWarehouseId, items]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return;
      (items || []).forEach((item) => {
        const key = normalize(item.product);
        const catalogProduct = productsByName.get(key);
        const row = rowsByProduct.get(key) || createRow(item.product, catalogProduct);
        row.total += Number(item.total || 0);
        row.reserved += Number(item.reserved || 0);
        row.salePrice = row.salePrice || Number(item.price || 0);
        row.serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
        row.reorderLevel = getReorderPoint(item, productsByName);
        row.warehouseDistribution.push({
          warehouse: warehouseById.get(sourceWarehouseId)?.name || sourceWarehouseId,
          warehouseId: sourceWarehouseId,
          total: Number(item.total || 0),
          available: getAvailableQuantity(item),
        });
        rowsByProduct.set(key, row);
      });
    });

    return [...rowsByProduct.values()]
      .map((row) => {
        const free = row.total - row.reserved;
        const available = Math.max(0, free);
        const shortage = Math.max(0, -free);
        const coverage = orderCoverage.get(normalize(row.product)) || { orderedQty: 0, count: 0, latest: null };
        return {
          ...row,
          warehouseName: row.warehouseDistribution.length === 0 ? "—" : `${row.warehouseDistribution.length} anbar`,
          warehouseCount: row.warehouseDistribution.length,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, row.reorderLevel),
          stockValue: row.total * row.costPrice,
          salesValue: row.total * row.salePrice,
        };
      })
      .sort((a, b) => a.product.localeCompare(b.product, "az"));
  }

  return Object.entries(warehouseStock)
    .flatMap(([sourceWarehouseId, items]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return [];
      const warehouse = warehouseById.get(sourceWarehouseId);
      return (items || []).map((item) => {
        const catalogProduct = productsByName.get(normalize(item.product));
        const totalQty = Number(item.total || 0);
        const reserved = Number(item.reserved || 0);
        const available = getAvailableQuantity(item);
        const free = getFreeQuantity(item);
        const shortage = getShortageQuantity(item);
        const reorderLevel = getReorderPoint(item, productsByName);
        const coverage = orderCoverage.get(normalize(item.product)) || { orderedQty: 0, count: 0, latest: null };
        const costPrice = Number(catalogProduct?.costPrice || 0);
        const salePrice = Number(catalogProduct?.salePrice || item.price || 0);
        return {
          key: `${sourceWarehouseId}-${catalogProduct?.id || item.product}`,
          warehouseId: sourceWarehouseId,
          warehouseName: warehouse?.name || sourceWarehouseId,
          product: item.product,
          productId: catalogProduct?.id || "",
          category: catalogProduct?.category || "Kataloqu olmayan",
          sku: catalogProduct?.sku || "—",
          unit: catalogProduct?.unit || "ədəd",
          serialTracked: catalogProduct?.serialTracked ?? isSerialTrackedProduct(item),
          costPrice,
          salePrice,
          reorderLevel,
          total: totalQty,
          reserved,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          warehouseDistribution: [],
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, reorderLevel),
          stockValue: totalQty * costPrice,
          salesValue: totalQty * salePrice,
        };
      });
    })
    .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, "az") || a.product.localeCompare(b.product, "az"));
}

export function filterWarehouseBalanceRows(rows, filters, globalQuery = "") {
  const search = normalize([filters.productQuery, globalQuery].filter(Boolean).join(" "));
  return rows.filter((row) => {
    const matchesSearch = !search || normalize(`${row.product} ${row.sku} ${row.category} ${row.warehouseName}`).includes(search);
    const matchesCategory = filters.category === "all" || row.category === filters.category;
    const matchesStock =
      filters.stockStatus === "all" ||
      (filters.stockStatus === "below" && (row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq")) ||
      (filters.stockStatus === "available" && row.available > 0) ||
      (filters.stockStatus === "empty" && row.available <= 0) ||
      (filters.stockStatus === "shortage" && row.shortage > 0);
    const matchesReserve =
      filters.reserveStatus === "all" ||
      (filters.reserveStatus === "reserved" && row.reserved > 0) ||
      (filters.reserveStatus === "free" && row.reserved === 0);
    const matchesSerial =
      filters.serialStatus === "all" ||
      (filters.serialStatus === "serial" && row.serialTracked) ||
      (filters.serialStatus === "batch" && !row.serialTracked);
    const matchesMinimum = !filters.belowMinimum || row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq";
    return matchesSearch && matchesCategory && matchesStock && matchesReserve && matchesSerial && matchesMinimum;
  });
}

export function exportWarehouseBalanceCsv(rows, view) {
  const headers = ["Kateqoriya", "Məhsul", "SKU", "Anbar", "Qalıq", "Minimum", "Rezerv", "Mövcud", "Sifarişdə", "Vahid", "Maya", "Stok dəyəri", "Satış qiyməti", "Status"];
  const escapeValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csvRows = rows.map((row) => [
    row.category,
    row.product,
    row.sku,
    view === "products" ? row.warehouseName : row.warehouseName,
    row.total,
    row.reorderLevel,
    row.reserved,
    row.available,
    row.orderedQty,
    row.unit,
    row.costPrice,
    row.stockValue,
    row.salePrice,
    row.status,
  ].map(escapeValue).join(","));
  const blob = new Blob([`\uFEFF${headers.map(escapeValue).join(",")}\n${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `anbar-qaliqlari-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function WarehouseBalanceFilters({ filters, warehouses, categories, open, onChange, onApply, onClear }) {
  if (!open) return null;

  return (
    <section className="warehouse-balance-filters">
      <label>
        <span>Məhsul / qrup</span>
        <div className="warehouse-filter-search">
          <Search size={16} />
          <input value={filters.productQuery} placeholder="Məhsul adı, SKU və ya qrup" onChange={(event) => onChange("productQuery", event.target.value)} />
        </div>
      </label>
      <label>
        <span>Anbar</span>
        <select value={filters.warehouseId} onChange={(event) => onChange("warehouseId", event.target.value)}>
          <option value="all">Bütün anbarlar</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </select>
      </label>
      <label>
        <span>Kateqoriya</span>
        <select value={filters.category} onChange={(event) => onChange("category", event.target.value)}>
          <option value="all">Bütün kateqoriyalar</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>
        <span>Qalıq statusu</span>
        <select value={filters.stockStatus} onChange={(event) => onChange("stockStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="below">Minimumdan aşağı</option>
          <option value="available">Stokda var</option>
          <option value="empty">Stok tükənib</option>
          <option value="shortage">Çatışmazlıq (backorder)</option>
        </select>
      </label>
      <label>
        <span>Rezerv statusu</span>
        <select value={filters.reserveStatus} onChange={(event) => onChange("reserveStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="reserved">Yalnız rezervli</option>
          <option value="free">Rezervsiz</option>
        </select>
      </label>
      <label>
        <span>Serial izləmə</span>
        <select value={filters.serialStatus} onChange={(event) => onChange("serialStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="serial">IMEI / serial</option>
          <option value="batch">Batch</option>
        </select>
      </label>
      <label className="warehouse-minimum-toggle">
        <input type="checkbox" checked={filters.belowMinimum} onChange={(event) => onChange("belowMinimum", event.target.checked)} />
        <span>Minimumdan aşağı olanlar</span>
      </label>
      <div className="warehouse-filter-actions">
        <button type="button" className="secondary-btn" onClick={onClear}>Təmizlə</button>
        <button type="button" className="primary-btn" onClick={onApply}>Tətbiq et</button>
      </div>
    </section>
  );
}

export function WarehouseBalanceTable({ rows, view, onEditProduct, onOpenProduct, onCreateProduct, onSelectWarehouse }) {
  const totals = rows.reduce((summary, row) => ({
    total: summary.total + Number(row.total || 0),
    reserved: summary.reserved + Number(row.reserved || 0),
    available: summary.available + Number(row.available || 0),
    orderedQty: summary.orderedQty + Number(row.orderedQty || 0),
    stockValue: summary.stockValue + Number(row.stockValue || 0),
    salesValue: summary.salesValue + Number(row.salesValue || 0),
  }), { total: 0, reserved: 0, available: 0, orderedQty: 0, stockValue: 0, salesValue: 0 });
  const locationHeading = view === "products" ? "Anbarlar" : "Anbar";

  return (
    <div className="warehouse-balance-table-wrap">
      <table className="warehouse-balance-table">
        <thead>
          <tr>
            <th>Kateqoriya</th><th>Məhsul</th><th>SKU</th><th>{locationHeading}</th><th>Qalıq</th><th>Minimum</th><th>Rezerv</th><th>Mövcud</th><th>Sifarişdə</th><th>Vahid</th><th>Maya</th><th>Stok dəyəri</th><th>Satış</th><th>Status</th><th>Əməliyyat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.category}</td>
              <td>
                {view === "products" && row.productId && onOpenProduct ? (
                  <button type="button" className="text-btn" onClick={() => onOpenProduct(row.productId)} title="Məhsulun 360 baxışını aç">
                    <strong>{row.product}</strong>
                  </button>
                ) : <strong>{row.product}</strong>}
              </td>
              <td className="warehouse-sku">{row.sku}</td>
              <td>{view === "products" ? <WarehouseDistribution distribution={row.warehouseDistribution} /> : row.warehouseName}</td>
              <td>{row.total}</td>
              <td>{row.reorderLevel || "—"}</td>
              <td>{row.reserved}</td>
              <td className={row.shortage > 0 || row.status !== "Normal" ? "balance-qty risk" : "balance-qty good"}>
                {row.shortage > 0 ? `-${row.shortage}` : row.available}
                {row.shortage > 0 && <small style={{ display: "block", opacity: 0.75 }}>sifariş gözləyir</small>}
              </td>
              <td>{row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} ədəd`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "—"}</td>
              <td>{row.unit}</td>
              <td>{money(row.costPrice)}</td>
              <td>{money(row.stockValue)}</td>
              <td>{money(row.salePrice)}</td>
              <td><StatusBadge status={row.status} /></td>
              <td>
                {view === "warehouses" ? (
                  <button className="text-btn" onClick={() => onSelectWarehouse(row.warehouseId)}>Anbara keç</button>
                ) : row.productId ? (
                  <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    {onOpenProduct && <button className="text-btn" onClick={() => onOpenProduct(row.productId)}>360 baxış</button>}
                    <button className="text-btn" onClick={() => onEditProduct(row.productId)}>Redaktə</button>
                  </span>
                ) : (
                  <button className="text-btn" onClick={onCreateProduct}>Kataloqa əlavə et</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="15" className="warehouse-balance-empty">Seçilmiş filtrə uyğun qalıq tapılmadı.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan="4">Cəmi</td><td>{totals.total}</td><td>—</td><td>{totals.reserved}</td><td className="balance-qty good">{totals.available}</td><td>{totals.orderedQty || "—"}</td><td>—</td><td>—</td><td>{money(totals.stockValue)}</td><td>{money(totals.salesValue)}</td><td>—</td><td>—</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function getWarehouseBalanceStatus(available, reorderPoint) {
  if (available <= 0) return "Stok tükənib";
  if (reorderPoint > 0 && available <= Math.max(1, Math.floor(reorderPoint / 2))) return "Kritik stok";
  if (reorderPoint > 0 && available <= reorderPoint) return "Aşağı stok";
  return "Normal";
}

export function getFreeQuantity(item) {
  return Number(item?.total || 0) - Number(item?.reserved || 0);
}

export function getShortageQuantity(item) {
  return Math.max(0, -getFreeQuantity(item));
}

export function CreditDetail({ item, sendCreditSms, onUpdatePaymentDate, onReceivePayment, onOpenSalesOrder }) {
  const { credit, plan, paymentState, progress } = item;
  const debt = getCreditDebtFormula(item);

  return (
    <div className="credit-detail">
      <div className="credit-detail-layout">
        <section className="credit-detail-primary">
          <div className="credit-detail-head">
            <div>
              <span>{credit.id}</span>
              <h2>{credit.customer}</h2>
            </div>
            <StatusBadge status={paymentState.isOverdue ? `${paymentState.daysOverdue} gün gecikib` : credit.status} />
          </div>
          <CreditContext credit={credit} onOpenSalesOrder={onOpenSalesOrder} />
          <CreditContractSnapshot item={item} />
          <CreditDebtFormula item={item} />
          <div className="credit-detail-values">
            <TwoLine title="İlkin müqavilə" subtitle={money(debt.total)} />
            <TwoLine title="İlkin ödəniş" subtitle={money(plan.initialPayment)} />
            <TwoLine title="Qalan ay" subtitle={`${debt.remainingMonths} ay`} />
            <TwoLine title="Müddət" subtitle={`${plan.months} ay`} />
          </div>
          <div className="credit-plan-card">
            <div className="credit-plan-note">
              <span>
                {plan.months > 1 ? `${plan.months - 1} ay` : "Aylıq"} <strong>{money(plan.monthly)}</strong>
              </span>
              <span>
                Son ay <strong>{money(plan.lastPayment)}</strong>
              </span>
            </div>
            <ProgressRow label={`${credit.paidMonths}/${plan.months} ay`} value={progress} />
          </div>
          <div className="credit-detail-records">
            <CreditPaymentHistory payments={credit.payments || []} />
            <div className="credit-schedule-edit-block">
              <div className="credit-schedule-head">
                <div>
                  <h3>Ödəniş tarixləri</h3>
                  <p>Hələlik tarix redaktəsi bütün istifadəçilər üçün açıqdır.</p>
                </div>
              </div>
              <CreditSchedule
                installments={plan.installments}
                onUpdatePaymentDate={(month, due) => onUpdatePaymentDate(credit.id, month, due)}
              />
            </div>
          </div>
        </section>

        <aside className="credit-detail-aside">
          <CreditPaymentAlert paymentState={paymentState} />
          <CreditPaymentForm
            key={credit.id}
            credit={credit}
            paymentState={paymentState}
            onReceivePayment={onReceivePayment}
          />
          <CreditHealthSummary item={item} />
          <div className="credit-detail-actions">
            <span>Növbəti: {paymentState.nextInstallment?.due || credit.next}</span>
            <button className="secondary-btn" onClick={() => sendCreditSms(credit.id)}>
              SMS xatırlatma
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CreditContext({ credit, onOpenSalesOrder }) {
  return (
    <div className="credit-context-grid">
      <div>
        <span>Müqavilə</span>
        <strong>{credit.contractId || "Müqavilə qeyd edilməyib"}</strong>
      </div>
      <div>
        <span>Cihaz</span>
        <strong>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</strong>
      </div>
      {credit.orderId && (
        <div>
          <span>Sifariş</span>
          <button
            className="module-link-btn"
            type="button"
            onClick={() => onOpenSalesOrder?.(credit.orderId)}
            data-testid="credit-order-link"
            title="Bağlı sifariş detalına keç"
          >
            {credit.orderId}
          </button>
        </div>
      )}
      <div>
        <span>Mənbə</span>
        <strong>{getCreditSourceLabel(credit)}</strong>
      </div>
      {credit.warehouseName && (
        <div>
          <span>Anbar</span>
          <strong>{credit.warehouseName}</strong>
        </div>
      )}
    </div>
  );
}

export function CreditContractSnapshot({ item }) {
  const { credit, plan, paymentState } = item;
  const debt = getCreditDebtFormula(item);

  return (
    <div className="credit-contract-snapshot">
      <div className="credit-contract-tile total" data-testid="credit-total-tile">
        <span>Müqavilə məbləği</span>
        <strong>{money(debt.total)}</strong>
        <small>{credit.contractId || credit.id}</small>
      </div>
      <div className="credit-contract-tile paid" data-testid="credit-paid-tile">
        <span>Ödənilib</span>
        <strong>{money(debt.paid)}</strong>
        <small>İlkin + əsas ödənişlər</small>
      </div>
      <div className="credit-contract-tile balance" data-testid="credit-balance-tile">
        <span>Qalıq borc</span>
        <strong>{money(debt.balance)}</strong>
        <small>{debt.remainingMonths} ay qalıb</small>
      </div>
      <div className={`credit-contract-tile next ${paymentState.isOverdue ? "danger" : paymentState.isDueToday ? "today" : ""}`}>
        <span>Növbəti yığım</span>
        <strong>{money(debt.nextAmount)}</strong>
        <small>{paymentState.nextInstallment?.due || credit.next || "Tarix yoxdur"}</small>
      </div>
    </div>
  );
}

export function CreditDebtFormula({ item }) {
  const debt = getCreditDebtFormula(item);
  const formulaIsBalanced = debt.total - debt.paid === debt.balance;

  return (
    <div className="credit-debt-formula" data-testid="credit-debt-formula">
      <div>
        <span>Müqavilə məbləği</span>
        <strong>{money(debt.total)}</strong>
      </div>
      <b>-</b>
      <div>
        <span>Ödənilib</span>
        <strong>{money(debt.paid)}</strong>
      </div>
      <b>=</b>
      <div className="balance">
        <span>Qalıq borc</span>
        <strong>{money(debt.balance)}</strong>
      </div>
      <small className={formulaIsBalanced ? "ok" : "warning"}>
        {formulaIsBalanced ? "Borcla ödəniş balansı uyğundur" : "Balans yenidən yoxlanmalıdır"}
      </small>
    </div>
  );
}

export function CreditPaymentHistory({ payments }) {
  const rows = payments || [];

  return (
    <div className="credit-payment-history">
      <div className="credit-history-head">
        <div>
          <h3>Ödəniş tarixçəsi</h3>
          <p>Əsas məbləğ borcdan silinir, gecikmə faizi yalnız kassaya gəlir.</p>
        </div>
        <span>{rows.length} əməliyyat</span>
      </div>
      {rows.length === 0 ? (
        <div className="credit-history-empty">Bu kredit üzrə hələ ödəniş qəbul edilməyib.</div>
      ) : (
        <div className="credit-history-list">
          {rows.slice(0, 6).map((payment, index) => {
            const principal = Number(payment.principal || 0);
            const penalty = Number(payment.penalty || 0);
            const cashIn = Number(payment.cashIn ?? principal + penalty);
            const extraApplied = Number(payment.extraApplied || 0);

            return (
              <div className="credit-payment-row" key={`${payment.date}-${index}`}>
                <div>
                  <strong>{payment.date || baseCreditDate}</strong>
                  <span>
                    Əsas {money(principal)} · Gecikmə {money(penalty)}
                  </span>
                  {extraApplied > 0 && <em>Növbəti aylardan azaldıldı: {money(extraApplied)}</em>}
                </div>
                <b>{money(cashIn)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CreditSchedule({ installments, onUpdatePaymentDate }) {
  const firstOpenMonth = installments.find((installment) => Number(installment.amount || 0) > 0)?.month;

  return (
    <div className="credit-schedule" aria-label="Kredit ödəniş tarixləri">
      {installments.map((installment) => {
        const amount = Number(installment.amount || 0);
        const status = amount <= 0 ? "Bağlanıb" : installment.month === firstOpenMonth ? "Cari ay" : "Gözləyir";

        return (
          <label key={installment.month} className={amount <= 0 ? "closed" : installment.month === firstOpenMonth ? "current" : ""}>
            <em>{installment.month}. ay</em>
            <strong>{money(amount)}</strong>
            <small>{status}</small>
            <input
              aria-label={`${installment.month}. ay ödəniş tarixi`}
              type="date"
              value={toDateInputValue(installment.due)}
              onChange={(event) => onUpdatePaymentDate(installment.month, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}

export function CreditPaymentAlert({ paymentState }) {
  const amount = paymentState.nextInstallment?.amount || 0;
  const due = paymentState.nextInstallment?.due || "—";
  const label = paymentState.isOverdue
    ? `${paymentState.daysOverdue} gün gecikib`
    : paymentState.isDueToday
      ? "Bu gün ödənilməlidir"
      : "Növbəti ödəniş";

  return (
    <div className={`credit-payment-alert ${paymentState.isOverdue ? "overdue" : ""} ${paymentState.isDueToday ? "today" : ""}`}>
      <CalendarClock size={16} />
      <div>
        <strong>{money(amount)}</strong>
        <span>
          {label} · {due}
        </span>
      </div>
    </div>
  );
}

export function CreditPaymentForm({ credit, paymentState, onReceivePayment }) {
  const currentPrincipal = Number(paymentState.nextInstallment?.amount || 0);
  const [principalAmount, setPrincipalAmount] = useState(currentPrincipal);
  const [penaltyAmount, setPenaltyAmount] = useState(0);
  const principal = Math.max(0, Math.round(Number(principalAmount || 0)));
  const penalty = Math.max(0, Math.round(Number(penaltyAmount || 0)));
  const extraPrincipal = Math.max(0, principal - currentPrincipal);
  const cashIn = principal + penalty;

  function submit(event) {
    event.preventDefault();
    onReceivePayment(credit.id, {
      principalAmount: principal,
      penaltyAmount: penalty,
    });
    setPrincipalAmount("");
    setPenaltyAmount(0);
  }

  return (
    <form className="credit-payment-form" onSubmit={submit}>
      <div className="credit-payment-form-head">
        <div>
          <h3>Ödəniş qəbul et</h3>
          <p>Əsas məbləğ borcdan silinir, gecikmə faizi yalnız kassaya daxil olur.</p>
        </div>
      </div>
      <div className="credit-payment-inputs">
        <label>
          <span>Əsas məbləğ</span>
          <input
            aria-label="Əsas məbləğ"
            type="number"
            min="0"
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(event.target.value)}
          />
        </label>
        <label>
          <span>Gecikmə faizi</span>
          <input
            aria-label="Gecikmə faizi"
            type="number"
            min="0"
            value={penaltyAmount}
            onChange={(event) => setPenaltyAmount(event.target.value)}
          />
        </label>
      </div>
      <div className="credit-payment-preview">
        <span>
          Borcdan silinir <strong>{money(principal)}</strong>
        </span>
        <span>
          Gecikmə gəliri <strong>{money(penalty)}</strong>
        </span>
        <span>
          Kassaya daxil olur <strong>{money(cashIn)}</strong>
        </span>
        {extraPrincipal > 0 && (
          <span className="success">
            Növbəti aydan azalır <strong>{money(extraPrincipal)}</strong>
          </span>
        )}
      </div>
      <button type="submit" className="primary-btn">
        Ödənişi qəbul et
      </button>
    </form>
  );
}

export function CreditHealthSummary({ item }) {
  const { credit, plan, paymentState, progress } = item;
  const paidTotal = getCreditPaidTotal(plan);

  return (
    <div className="credit-health-grid">
      <div>
        <span>Ödənilib</span>
        <strong>{money(paidTotal)}</strong>
        <small>{Math.round(progress)}% tamamlanıb</small>
      </div>
      <div>
        <span>Qalıq borc</span>
        <strong>{money(plan.balance)}</strong>
        <small>{plan.months} aylıq plan</small>
      </div>
      <div className={paymentState.isOverdue ? "danger" : paymentState.isDueToday ? "info" : ""}>
        <span>Yığım statusu</span>
        <strong>{getCreditRiskLabel(item)}</strong>
        <small>{paymentState.nextInstallment?.due || credit.next || "Tarix yoxdur"}</small>
      </div>
      <div>
        <span>Mənbə</span>
        <strong>{getCreditSourceLabel(credit)}</strong>
        <small>{credit.orderId ? `${credit.orderId} sifarişi` : "Manual qeyd"}</small>
      </div>
    </div>
  );
}
