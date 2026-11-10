import { Building2, CalendarClock, Check, ChevronRight, FileText, LayoutDashboard, Pencil, Plus, Trash2, Users, Wallet } from "lucide-react";
import { AvatarLine, DataTable, EmptyState, ProgressRow, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useEffect, useMemo, useState } from "react";
import { money, normalize, percent } from "../../services/format.js";
import { total } from "../../shared/utils/aggregate.js";
import { currentBusinessDate } from "./businessDate";
import { roundMoney } from "./credit.js";

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
  const [profileView, setProfileView] = useState("Ümumi");
  if (!selectedRecord) return <EmptyState title={records.length ? "Əməkdaş seçilməyib" : "Filterə uyğun əməkdaş tapılmadı"} />;

  const documentRows = selectedRecord.documentRows || getHrDocumentRows(selectedRecord);
  const profileViews = [
    { label: "Ümumi", icon: LayoutDashboard },
    { label: "İş və məzuniyyət", icon: CalendarClock },
    { label: "Payroll", icon: Wallet },
    { label: "Sənədlər", icon: FileText, count: selectedRecord.missingDocumentCount },
  ];

  return (
    <section className="hr-employee-platform">
      <div className="hr-people-list">
        <div className="hr-people-list-head">
          <div><strong>Əməkdaşlar</strong><span>{records.length} nəticə</span></div>
          <Users size={17} />
        </div>
        {records.map((record) => (
          <button
            key={record.employeeKey}
            className={`hr-person-row ${selectedRecord.employeeKey === record.employeeKey ? "active" : ""}`}
            onClick={() => onSelect(record.employeeKey)}
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
        <nav className="hr-profile-tabs" aria-label="Əməkdaş profil bölmələri">
          {profileViews.map(({ label, icon: Icon, count }) => (
            <button key={label} className={profileView === label ? "active" : ""} onClick={() => setProfileView(label)}>
              <Icon size={15} /><span>{label}</span>{count > 0 && <b>{count}</b>}
            </button>
          ))}
        </nav>

        {profileView === "Ümumi" && <div className="hr-profile-view">
          <div className="hr-profile-grid compact">
            <TwoLine title="Rəhbər" subtitle={selectedRecord.managerName || "Birbaşa rəhbərlik"} />
            <TwoLine title="İşə qəbul" subtitle={selectedRecord.hireDate} />
            <TwoLine title="Növbəti review" subtitle={selectedRecord.nextReview} />
            <TwoLine title="Sənəd uyğunluğu" subtitle={percent(selectedRecord.documentsComplete)} />
          </div>
          <div className="hr-profile-snapshot">
            <div><span>İştirak</span><strong>{percent(selectedRecord.attendanceRate)}</strong><small>{selectedRecord.workMode} · {selectedRecord.shift}</small></div>
            <div><span>Məzuniyyət</span><strong>{selectedRecord.leaveBalance} gün qalıq</strong><small>{selectedRecord.usedLeave} gün istifadə · {selectedRecord.pendingLeaveDays} gün təsdiqdə</small></div>
            <div><span>Payroll</span><strong>{selectedRecord.payrollStatus}</strong><small>{money(selectedRecord.netSalary)} net əmək haqqı</small></div>
          </div>
          <div className="hr-skill-strip">
            {(selectedRecord.skills.length ? selectedRecord.skills : ["Profil bacarıqları əlavə edilməyib"]).map((skill) => <span key={skill}>{skill}</span>)}
          </div>
        </div>
        }

        {profileView === "İş və məzuniyyət" && <div className="hr-profile-view">
          <div className="hr-profile-grid compact">
            <TwoLine title="İş rejimi" subtitle={`${selectedRecord.workMode} · ${selectedRecord.shift}`} />
            <TwoLine title="Attendance" subtitle={percent(selectedRecord.attendanceRate)} />
            <TwoLine title="Məzuniyyət balansı" subtitle={`${selectedRecord.leaveBalance} gün`} />
            <TwoLine title="Növbəti review" subtitle={selectedRecord.nextReview} />
          </div>
          <div className="hr-profile-focus-card"><CalendarClock size={20} /><div><span>Məzuniyyət vəziyyəti</span><strong>{selectedRecord.leaveBalance} gün qalıq</strong><small>{selectedRecord.usedLeave} gün istifadə olunub, {selectedRecord.pendingLeaveDays} gün təsdiq gözləyir</small></div></div>
        </div>}

        {profileView === "Payroll" && <div className="hr-profile-view">
          <div className="hr-profile-grid compact">
            <TwoLine title="Net payroll" subtitle={money(selectedRecord.netSalary)} />
            <TwoLine title="İşəgötürən xərci" subtitle={money(selectedRecord.employerCost)} />
            <TwoLine title="Payroll periodu" subtitle={selectedRecord.payrollPeriod} />
            <TwoLine title="Ödənilmə tarixi" subtitle={selectedRecord.payrollPaidAt || "Hələ bağlanmayıb"} />
          </div>
          <div className="hr-profile-focus-card"><Wallet size={20} /><div><span>Ödəniş statusu</span><strong>{selectedRecord.payrollStatus}</strong><small>{selectedRecord.payrollPeriod} dövrü üzrə</small></div></div>
        </div>}

        {profileView === "Sənədlər" && <div className="hr-profile-view">
          <div className="hr-document-summary"><div><span>Sənəd uyğunluğu</span><strong>{percent(selectedRecord.documentsComplete)}</strong></div><StatusBadge status={selectedRecord.documentStatus} /></div>
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
        </div>}
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
  const managerOptions = employees.filter((employee) => getEmployeeKey(employee) !== getEmployeeKey(selectedEmployee));

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onUpdate(getEmployeeKey(selectedEmployee), draft);
  }

  return (
    <form className="hr-builder-form" onSubmit={submit}>
      <label>
        <span>Əməkdaş</span>
        <select value={getEmployeeKey(selectedEmployee)} onChange={(event) => onSelectEmployee(event.target.value)}>
          {employees.map((employee) => (
            <option key={getEmployeeKey(employee)} value={getEmployeeKey(employee)}>
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
        <select value={draft.managerId} onChange={(event) => {
          const manager = employees.find((employee) => getEmployeeKey(employee) === event.target.value);
          setDraft((current) => ({ ...current, managerId: manager ? getEmployeeKey(manager) : "", managerName: manager?.name || "" }));
        }}>
          <option value="">Birbaşa rəhbərlik</option>
          {managerOptions.map((employee) => (
            <option key={getEmployeeKey(employee)} value={getEmployeeKey(employee)}>
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
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [expandedDepartments, setExpandedDepartments] = useState(() => new Set(departmentIds));
  useEffect(() => {
    setExpandedDepartments(new Set(departmentIds));
  }, [departmentIds]);
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

export function HrEmployeeTreeNode({ employee, onSelectEmployee, depth = 0 }) {
  const hasChildren = employee.children.length > 0;
  const [expanded, setExpanded] = useState(depth === 0);

  return (
    <div className="hr-tree-item">
      <button
        className={`hr-employee-node ${employee.isInScope ? "in-scope" : ""}`}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => {
          onSelectEmployee(employee.employeeKey);
          if (hasChildren) setExpanded((current) => !current);
        }}
      >
        <span className="small-avatar">{employee.initials}</span>
        <div>
          <strong>{employee.name}</strong>
          <span>{employee.position} · {employee.department}</span>
          <small>{employee.managerName ? `${employee.managerName}-a tabedir` : "Birbaşa rəhbərlik"}</small>
        </div>
        <StatusBadge status={employee.level} />
        {hasChildren
          ? <ChevronRight className={`hr-employee-chevron ${expanded ? "expanded" : ""}`} size={17} />
          : <span className="hr-employee-chevron-placeholder" aria-hidden="true" />}
      </button>
      {hasChildren && expanded && (
        <div className="hr-tree-children">
          {employee.children.map((child) => (
            <HrEmployeeTreeNode key={child.employeeKey} employee={child} onSelectEmployee={onSelectEmployee} depth={depth + 1} />
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
    managerId: employee && getEmployeeManager(employee, employees) ? getEmployeeKey(getEmployeeManager(employee, employees)) : "",
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
