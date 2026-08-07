import { Download, FileText, X } from "lucide-react";
import { StatusBadge, TwoLine } from "../../components/ui.jsx";
import { daysBetween, roundMoney } from "./credit.js";
import { formatDateInput, parsePaymentDate } from "../../services/date.js";
import { money, normalize } from "../../services/format.js";
import { stages } from "../../data.js";
import { total } from "../../shared/utils/aggregate.js";

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
