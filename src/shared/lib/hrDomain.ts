// HR domen məntiqi: əməkdaş qeydləri (bonus, payroll vergisi 2026, sənəd sağlamlığı, məzuniyyət balansı), rəhbər/səviyyə
// təyini, şöbə strukturu və ağacı, tabeçilik meşəsi, planlama, davamiyyət, məzuniyyət, payroll və recruitment sətirləri.
// appDomainHr.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir və yalnız HR React komponentlərini saxlayır.
import { normalize } from "../../services/format.js";
import { total } from "../utils/aggregate.js";
import { currentBusinessDate } from "./businessDate.ts";

type Row = Record<string, any>;

export interface LeaveUsage {
  approved: number;
  pending: number;
}

export interface PayrollTax {
  gross: number;
  incomeTax: number;
  employeeSocial: number;
  employeeUnemployment: number;
  employeeMedical: number;
  totalDeductions: number;
  net: number;
  employerSocial: number;
  employerUnemployment: number;
  employerMedical: number;
  employerCost: number;
}

export interface HrDocumentRow {
  key: string;
  title: string;
  threshold: number;
  complete: boolean;
  status: string;
  progress: number;
}

export function buildKpiEmployeeScoreRows(employees: Row[] = [], salesBonuses: Row[] = []): Row[] {
  const bonusBySeller = salesBonuses.reduce((map: Map<string, { orders: number; paid: number; bonus: number }>, row) => {
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

export function getKpiPeriodKey(date: unknown = currentBusinessDate): string {
  return String(date || currentBusinessDate).slice(0, 7);
}

export function buildHrEmployeeRecords(employees: Row[], leaveRequests: Row[] = []): Row[] {
  const leaveUsage = buildHrLeaveUsageMap(leaveRequests);
  return employees.map((employee) => {
    const salary = Number(employee.salary || 0);
    const kpi = Number(employee.kpi || 0);
    const bonus = kpi >= 105 ? Math.round(salary * 0.14) : kpi >= 95 ? Math.round(salary * 0.07) : 0;
    const payrollTax = calculatePayrollTax2026(salary + bonus);
    const tax = payrollTax.incomeTax;
    const social = payrollTax.employeeSocial + payrollTax.employeeUnemployment + payrollTax.employeeMedical;
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

export function buildHrLeaveUsageMap(leaveRequests: Row[] = []): Map<string, LeaveUsage> {
  return leaveRequests.reduce((map: Map<string, LeaveUsage>, request) => {
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

// Payroll amounts are kept in qəpik (0.01 ₼); EPSILON keeps 12.505 from rounding down to 12.50.
const toQepik = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculatePayrollTax2026(grossValue: unknown): PayrollTax {
  const amount = Number(grossValue ?? 0);
  if (!Number.isFinite(amount)) throw new Error('Invalid payroll amount');
  const gross = Math.max(0, toQepik(amount));
  const incomeTax = toQepik(
    gross <= 2500
      ? Math.max(0, (gross - 200) * 0.03)
      : gross <= 8000
        ? 75 + (gross - 2500) * 0.1
        : 625 + (gross - 8000) * 0.14);
  const employeeSocial = toQepik(gross <= 200 ? gross * 0.03 : 6 + (gross - 200) * 0.1);
  const employerSocial = toQepik(
    gross <= 200
      ? gross * 0.22
      : gross <= 8000
        ? 44 + (gross - 200) * 0.15
        : 44 + 7800 * 0.15 + (gross - 8000) * 0.11);
  const employeeUnemployment = toQepik(gross * 0.005);
  const employerUnemployment = toQepik(gross * 0.005);
  // Mandatory health insurance (icbari tibbi sığorta), paid by the employee and the employer alike:
  // 2% of the part up to 8000 ₼ and 0.5% of the part above.
  const medical = toQepik(gross <= 8000 ? gross * 0.02 : 160 + (gross - 8000) * 0.005);
  const employeeMedical = medical;
  const employerMedical = medical;
  const totalDeductions = toQepik(incomeTax + employeeSocial + employeeUnemployment + employeeMedical);

  return {
    gross,
    incomeTax,
    employeeSocial,
    employeeUnemployment,
    employeeMedical,
    totalDeductions,
    net: Math.max(0, toQepik(gross - totalDeductions)),
    employerSocial,
    employerUnemployment,
    employerMedical,
    employerCost: toQepik(gross + employerSocial + employerUnemployment + employerMedical),
  };
}

export function getEmployeeKey(employee: Row = {}): string {
  return employee.id || `EMP-${normalize(employee.name)}`;
}

export function getHrDocumentHealth(record: Row = {}): { documents: HrDocumentRow[]; missingCount: number; status: string } {
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

export function getEmployeeLevel(employee: Row): string {
  if (employee.level) return employee.level;

  const position = normalize(employee.position);
  if (position.includes("direktor")) return "Rəhbərlik";
  if (position.includes("baş") || position.includes("rəhbər")) return "Şöbə rəhbəri";
  return "Komanda üzvü";
}

export function getEmployeeManagerName(employee: Row, employees: Row[]): string {
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

export const baseFinanceDate: string = currentBusinessDate;

export function getEmployeeManager(employee: Row, employees: Row[] = []): Row | null {
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

export function getHrDocumentRows(employee: Row = {}): HrDocumentRow[] {
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

export function buildHrStructure(employees: Row[], departmentRecords: Row[] = []): Row[] {
  const normalizedEmployees = employees.map((employee): Row => ({
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
    const byManager = new Map<string, Row[]>();

    departmentRows.forEach((employee) => {
      const manager = departmentNames.has(employee.managerName) ? employee.managerName : "";
      const children = byManager.get(manager) || [];
      children.push(employee);
      byManager.set(manager, children);
    });

    const buildNode = (employee: Row, visited = new Set<string>()): Row => {
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

  const structuresByDepartment = new Map<string, Row>(structures.map((department) => [department.department, department]));
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

export function isHrLeadershipLevel(level: unknown): boolean {
  const text = normalize(level);
  return text.includes("rəhb") || text.includes("lider") || text.includes("direktor");
}

export function buildHrPlanningRows(structure: Row[]): Row[] {
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

export function buildHrAttendanceRows(records: Row[]): Row[] {
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

export function buildHrLeaveRows(records: Row[], leaveRequests: Row[] = []): Row[] {
  const recordByKey = new Map<string, Row>(records.map((record) => [getEmployeeKey(record), record]));
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

export function buildHrPayrollRows(records: Row[]): Row[] {
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

export function buildHrRecruitmentRows(planningRows: Row[], vacancies: Row[] = []): Row[] {
  const activeVacancies = vacancies.map((vacancy): Row => ({
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
// Tab keys stay in the URL (?tab=Payroll); this is what the page shows.
export const hrPlatformTabLabels: Record<string, string> = { Payroll: "Əmək haqqı", Recruitment: "İşə qəbul" };

export function buildHrDepartmentTree(structure: Row[] = []): Row[] {
  const nodes = new Map<string, Row>();
  const ensureNode = (department: string, parentDepartment = "", source: Row | null = null) => {
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

  const roots: Row[] = [];
  nodes.forEach((node) => {
    node.children = [];
  });
  nodes.forEach((node) => {
    const parent = node.parentDepartment && nodes.get(node.parentDepartment);
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = (items: Row[]): Row[] => items
    .sort((a, b) => a.department.localeCompare(b.department, "az"))
    .map((node) => ({ ...node, children: sortNodes(node.children) }));
  return sortNodes(roots);
}

export function getHrDepartmentIds(nodes: Row[] = [], ids: string[] = []): string[] {
  nodes.forEach((node) => {
    ids.push(node.id);
    getHrDepartmentIds(node.children, ids);
  });
  return ids;
}

export function getHrDepartmentScope(departmentTree: Row[], selectedDepartment: string | null | undefined): Set<string> | null {
  if (!selectedDepartment || selectedDepartment === "all") return null;
  const collect = (nodes: Row[]): Set<string> | null => {
    for (const node of nodes) {
      if (node.id === selectedDepartment) {
        const names = new Set<string>();
        const visit = (current: Row) => {
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

export function buildHrReportingForest(employees: Row[] = [], departmentScope: Set<string> | null = null): Row[] {
  const normalizedEmployees = employees.map((employee): Row => ({
    ...employee,
    employeeKey: getEmployeeKey(employee),
    manager: getEmployeeManager(employee, employees),
    managerName: getEmployeeManagerName(employee, employees),
    level: getEmployeeLevel(employee),
  }));
  const rowsByKey = new Map(normalizedEmployees.map((employee) => [employee.employeeKey, employee]));
  const childrenByManager = new Map<string, Row[]>();
  normalizedEmployees.forEach((employee) => {
    const managerKey = employee.manager ? getEmployeeKey(employee.manager) : "";
    const children = childrenByManager.get(managerKey) || [];
    children.push(employee);
    childrenByManager.set(managerKey, children);
  });

  const buildNode = (employee: Row, visited = new Set<string>()): Row | null => {
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

  const roots: Row[] = normalizedEmployees
    .filter((employee) => !employee.manager || !rowsByKey.has(getEmployeeKey(employee.manager)))
    .sort((a, b) => a.name.localeCompare(b.name, "az"))
    .map((employee) => buildNode(employee))
    .filter(Boolean) as Row[];

  const nestedKeys = new Set<string>();
  const collectKeys = (node: Row) => {
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

export function getHrDepartmentLead(department: Row): Row | null {
  const roots: Row[] = department.roots || [];
  return roots.find((employee) => isHrLeadershipLevel(employee.level)) || roots[0] || null;
}

export function getHrDraft(employee: Row | null | undefined, employees: Row[]): Row {
  return {
    department: employee?.department || "",
    departmentParent: employee ? getDepartmentParentName(employee) : "",
    position: employee?.position || "",
    managerName: employee ? getEmployeeManagerName(employee, employees) : "",
    managerId: employee && getEmployeeManager(employee, employees) ? getEmployeeKey(getEmployeeManager(employee, employees)!) : "",
    level: employee ? getEmployeeLevel(employee) : "Komanda üzvü",
  };
}

export function getDepartmentParentName(employee: Row = {}): string {
  if (employee.departmentParent) return employee.departmentParent;
  const parts = String(employee.department || "")
    .split(/\s*(?:\/|>|›)\s*/)
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
}

export const hrLevelOptions = ["Rəhbərlik", "Şöbə rəhbəri", "Komanda lideri", "Komanda üzvü", "Təcrübəçi"];
