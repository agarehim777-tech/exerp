import { AvatarLine, DataTable, EmptyState, MetricCard, Panel, PanelHeader, ProgressRow, StatusBadge } from "../components/ui.jsx";
import { Building2, Pencil, Plus, Search, Trash2, TrendingUp, UserCog, Users, Wallet } from "lucide-react";
import { money, normalize, percent } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useMemo, useState } from "react";
import { HrAttendancePlatform, HrEmployeePlatform, HrLeavePlatform, HrPayrollPlatform, HrRecruitmentPlatform, HrStructureBuilder, HrStructureTree, buildHrAttendanceRows, buildHrLeaveRows, buildHrPayrollRows, buildHrPlanningRows, buildHrRecruitmentRows, buildHrStructure, hrPlatformTabs, isHrLeadershipLevel } from "../shared/lib/appDomain.jsx";
export default function HrPage({
  employees,
  allEmployees = employees,
  departments = [],
  leaveRequests = [],
  vacancies = [],
  onUpdateEmployeeStructure,
  onEditEmployee,
  onDeleteEmployee,
  onCreateDepartment,
  onCreateLeaveRequest,
  onCreateVacancy,
  onUpdateLeaveStatus,
  onMarkPayrollPaid,
  onUpdateEmployeeDocuments,
}) {
  const structure = useMemo(() => buildHrStructure(allEmployees, departments), [allEmployees, departments]);
  const [hrView, setHrView] = useState("Komanda");
  const [selectedEmployeeName, setSelectedEmployeeName] = useState(allEmployees[0]?.name || "");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamDepartment, setTeamDepartment] = useState("Hamısı");
  const [teamStatus, setTeamStatus] = useState("Hamısı");
  const selectedEmployee =
    allEmployees.find((employee) => employee.name === selectedEmployeeName) || allEmployees[0] || null;
  const departmentCount = structure.length;
  const leaders = allEmployees.filter((employee) => isHrLeadershipLevel(getEmployeeLevel(employee)));
  const averageKpi = employees.length ? total(employees, "kpi") / employees.length : 0;
  const hrPlanningRows = useMemo(() => buildHrPlanningRows(structure), [structure]);
  const vacancyCount = hrPlanningRows.reduce((sum, row) => sum + Number(row.vacancyNeed || 0), 0);
  const hrEmployeeRecords = useMemo(() => buildHrEmployeeRecords(allEmployees, leaveRequests), [allEmployees, leaveRequests]);
  const teamDepartments = useMemo(
    () => [...new Set(hrEmployeeRecords.map((record) => record.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "az")),
    [hrEmployeeRecords],
  );
  const visibleHrEmployeeRecords = useMemo(() => {
    const query = normalize(teamQuery);
    return hrEmployeeRecords.filter((record) => {
      const matchesQuery = !query || [record.name, record.position, record.department, record.managerName]
        .some((value) => normalize(value).includes(query));
      const matchesDepartment = teamDepartment === "Hamısı" || record.department === teamDepartment;
      const matchesStatus = teamStatus === "Hamısı" || record.hrStatus === teamStatus;
      return matchesQuery && matchesDepartment && matchesStatus;
    });
  }, [hrEmployeeRecords, teamDepartment, teamQuery, teamStatus]);
  const visibleEmployeeNames = useMemo(
    () => new Set(visibleHrEmployeeRecords.map((record) => record.name)),
    [visibleHrEmployeeRecords],
  );
  const visibleRegistryEmployees = employees.filter((employee) => visibleEmployeeNames.has(employee.name));
  const selectedHrRecord =
    visibleHrEmployeeRecords.find((record) => record.name === selectedEmployeeName) || visibleHrEmployeeRecords[0] || null;
  const attendanceRows = useMemo(() => buildHrAttendanceRows(hrEmployeeRecords), [hrEmployeeRecords]);
  const leaveRows = useMemo(() => buildHrLeaveRows(hrEmployeeRecords, leaveRequests), [hrEmployeeRecords, leaveRequests]);
  const payrollRows = useMemo(() => buildHrPayrollRows(hrEmployeeRecords), [hrEmployeeRecords]);
  const recruitmentRows = useMemo(() => buildHrRecruitmentRows(hrPlanningRows, vacancies), [hrPlanningRows, vacancies]);
  const payrollTotal = payrollRows.reduce((sum, row) => sum + Number(row.netSalary || 0), 0);
  const pendingLeaveCount = leaveRows.filter((row) => row.status === "Təsdiq gözləyir").length;
  const paidPayrollCount = payrollRows.filter((row) => row.status === "Ödənildi").length;
  const documentRiskCount = hrEmployeeRecords.filter((row) => row.missingDocumentCount > 0).length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Ümumi əməkdaş" value={employees.length} icon={Users} tone="primary" />
        <MetricCard label="Aylıq maaş fondu" value={money(total(employees, "salary"))} icon={Wallet} tone="success" />
        <MetricCard
          label="Orta KPI"
          value={percent(averageKpi)}
          icon={TrendingUp}
          tone="info"
        />
        <MetricCard label="Struktur şöbələri" value={departmentCount} trend={`${leaders.length} rəhbər rol`} icon={Building2} tone="warning" />
      </section>

      <Panel className="hr-platform-panel">
        <PanelHeader
          title="HR Platform"
          subtitle="Əməkdaş 360, iş vaxtı, məzuniyyət, payroll və recruitment axınları"
          icon={UserCog}
        />
        <div className="hr-platform-toolbar">
          <div className="tabs">
            {hrPlatformTabs.map((tab) => (
              <button key={tab} className={hrView === tab ? "active" : ""} onClick={() => setHrView(tab)}>
                {tab}
              </button>
            ))}
          </div>
          <div className="hr-platform-kpis">
            <span>{pendingLeaveCount} məzuniyyət təsdiqdə</span>
            <span>{paidPayrollCount}/{payrollRows.length} payroll ödənildi</span>
            <span>{documentRiskCount} sənəd açığı</span>
            <span>{vacancyCount} vakansiya</span>
          </div>
        </div>
        {hrView === "Komanda" && (
          <div className="hr-team-workspace">
            <div className="hr-team-controls">
              <label className="hr-team-search">
                <Search size={16} />
                <input value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} placeholder="Əməkdaş, vəzifə və ya rəhbər axtar..." />
              </label>
              <select value={teamDepartment} onChange={(event) => setTeamDepartment(event.target.value)}>
                <option>Hamısı</option>
                {teamDepartments.map((department) => <option key={department}>{department}</option>)}
              </select>
              <select value={teamStatus} onChange={(event) => setTeamStatus(event.target.value)}>
                <option>Hamısı</option>
                <option>Stabil</option>
                <option>Məlumat gözləyir</option>
              </select>
              <strong>{visibleHrEmployeeRecords.length} əməkdaş</strong>
            </div>
            <HrEmployeePlatform
              records={visibleHrEmployeeRecords}
              selectedRecord={selectedHrRecord}
              onSelect={setSelectedEmployeeName}
              onEdit={onEditEmployee}
              onDelete={onDeleteEmployee}
              onUpdateDocuments={onUpdateEmployeeDocuments}
            />
          </div>
        )}
        {hrView === "İş vaxtı" && <HrAttendancePlatform rows={attendanceRows} />}
        {hrView === "Məzuniyyət" && <HrLeavePlatform rows={leaveRows} onCreate={onCreateLeaveRequest} onUpdateStatus={onUpdateLeaveStatus} />}
        {hrView === "Payroll" && <HrPayrollPlatform rows={payrollRows} totalNet={payrollTotal} onMarkPaid={onMarkPayrollPaid} />}
        {hrView === "Recruitment" && <HrRecruitmentPlatform rows={recruitmentRows} onCreate={onCreateVacancy} />}
      </Panel>

      <Panel className="hr-planning-panel">
        <PanelHeader
          title="HR planlama"
          subtitle="Vakansiya, onboarding, təlim və maaş forecast göstəriciləri"
          icon={UserCog}
        />
        <div className="hr-planning-summary">
          <div>
            <span>Açılacaq vakansiya</span>
            <strong>{vacancyCount}</strong>
            <small>Şöbə yükünə görə</small>
          </div>
          <div>
            <span>Növbəti maaş forecast</span>
            <strong>{money(hrPlanningRows.reduce((sum, row) => sum + row.payrollForecast, 0))}</strong>
            <small>8% artım modeli</small>
          </div>
          <div>
            <span>Təlim ehtiyacı</span>
            <strong>{hrPlanningRows.filter((row) => row.status === "Təlim lazımdır").length}</strong>
            <small>KPI 95%-dən aşağı</small>
          </div>
        </div>
        <DataTable
          columns={["Şöbə", "Headcount", "Rəhbər", "Orta KPI", "Onboarding", "Maaş forecast", "Status"]}
          rows={hrPlanningRows.map((row) => [
            <strong>{row.department}</strong>,
            row.headcount,
            row.leaders,
            `${row.avgKpi}%`,
            row.onboarding,
            money(row.payrollForecast),
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <section className="hr-structure-layout">
        <Panel className="hr-builder-panel">
          <PanelHeader title="Struktur qurucusu" subtitle="Əməkdaşı seçin, rəhbər və şöbə əlaqəsini təyin edin" icon={UserCog} />
          {selectedEmployee ? (
            <HrStructureBuilder
              key={selectedEmployee.name}
              employees={allEmployees}
              departments={departments}
              selectedEmployee={selectedEmployee}
              onSelectEmployee={setSelectedEmployeeName}
              onUpdate={onUpdateEmployeeStructure}
            />
          ) : (
            <EmptyState title="Struktur üçün əməkdaş yoxdur" />
          )}
        </Panel>

        <Panel className="hr-tree-panel">
          <PanelHeader title="Struktur ağacı" subtitle="Şöbə, rəhbər və komanda xətti" icon={Building2} />
          <div className="hr-structure-actions">
            <button className="secondary-btn" onClick={onCreateDepartment}><Plus size={16} /> Şöbə əlavə et</button>
          </div>
          <HrStructureTree structure={structure} employees={allEmployees} onSelectEmployee={setSelectedEmployeeName} />
        </Panel>
      </section>

      <Panel className="hr-employee-registry-panel">
        <PanelHeader title={`Əməkdaşlar (${visibleRegistryEmployees.length})`} subtitle="Vəzifə, şöbə, maaş və KPI" />
        <DataTable
          columns={["Əməkdaş", "Vəzifə", "Şöbə", "Rəhbər", "Səviyyə", "Maaş", "KPI", ""]}
          rows={visibleRegistryEmployees.map((employee) => [
            <AvatarLine initials={employee.initials} title={employee.name} />,
            employee.position,
            employee.department,
            getEmployeeManagerName(employee, allEmployees) || "Birbaşa",
            <StatusBadge status={getEmployeeLevel(employee)} />,
            money(employee.salary),
            <ProgressRow label={`${employee.kpi}%`} value={employee.kpi} compact />,
            <div className="hr-row-actions">
              <button className="icon-btn hr-row-edit" title="Əməkdaşı redaktə et" aria-label={`${employee.name} əməkdaşını redaktə et`} onClick={() => onEditEmployee(employee)}><Pencil size={16} /></button>
              <button className="icon-btn hr-row-delete" title="Əməkdaşı sil" aria-label={`${employee.name} əməkdaşını sil`} onClick={() => onDeleteEmployee(employee)}><Trash2 size={16} /></button>
            </div>,
          ])}
        />
        <div className="hr-mobile-employee-list">
          {visibleRegistryEmployees.map((employee) => (
            <div className="hr-mobile-employee-card" key={employee.name}>
              <div className="hr-mobile-employee-head">
                <AvatarLine initials={employee.initials} title={employee.name} subtitle={employee.position} />
                <div className="hr-row-actions">
                  <button className="icon-btn hr-row-edit" title="Əməkdaşı redaktə et" aria-label={`${employee.name} əməkdaşını redaktə et`} onClick={() => onEditEmployee(employee)}><Pencil size={16} /></button>
                  <button className="icon-btn hr-row-delete" title="Əməkdaşı sil" aria-label={`${employee.name} əməkdaşını sil`} onClick={() => onDeleteEmployee(employee)}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="hr-mobile-employee-meta">
                <span>{employee.department}</span>
                <span>{getEmployeeManagerName(employee, allEmployees) || "Birbaşa"}</span>
                <span>{money(employee.salary)}</span>
              </div>
              <ProgressRow label={`${employee.kpi}% KPI`} value={employee.kpi} compact />
              <StatusBadge status={getEmployeeLevel(employee)} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}