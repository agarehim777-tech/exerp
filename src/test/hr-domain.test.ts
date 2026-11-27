import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appDomainHr.jsx";
import * as barrel from "../shared/lib/appDomain.jsx";
import * as hr from "../shared/lib/hrDomain.ts";
import {
  buildHrDepartmentTree,
  buildHrEmployeeRecords,
  buildHrLeaveRows,
  buildHrLeaveUsageMap,
  buildHrPlanningRows,
  buildHrRecruitmentRows,
  buildHrReportingForest,
  buildHrStructure,
  buildKpiEmployeeScoreRows,
  calculatePayrollTax2026,
  getDepartmentParentName,
  getEmployeeKey,
  getEmployeeLevel,
  getEmployeeManagerName,
  getHrDepartmentIds,
  getHrDepartmentScope,
  getHrDocumentHealth,
  getHrDraft,
  getKpiPeriodKey,
} from "../shared/lib/hrDomain.ts";

const team = [
  { id: "E1", name: "Rəna", position: "Satış direktoru", department: "Satış", salary: 3000, kpi: 106 },
  { id: "E2", name: "Orxan", position: "Satış meneceri", department: "Satış", salary: 1000, kpi: 96, managerId: "E1" },
  { id: "E3", name: "Aysel", position: "Mühasib", department: "Maliyyə", salary: 900, kpi: 80 },
];

describe("HR domain logic", () => {
  it("stays importable from appDomainHr.jsx and the appDomain barrel", () => {
    for (const [name, value] of Object.entries(hr)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(value);
      expect((barrel as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it("calculates 2026 payroll tax brackets", () => {
    expect(calculatePayrollTax2026(1000)).toEqual({
      gross: 1000, incomeTax: 24, employeeSocial: 86, employeeUnemployment: 5, employeeMedical: 20, totalDeductions: 135,
      net: 865, employerSocial: 164, employerUnemployment: 5, employerMedical: 20, employerCost: 1189,
    });
    expect(calculatePayrollTax2026(-50)).toMatchObject({ gross: 0, net: 0, employerCost: 0 });
    expect(calculatePayrollTax2026(9000).incomeTax).toBe(Math.round(625 + 1000 * 0.14));
  });

  it("derives keys, levels, managers and department parents", () => {
    expect(getEmployeeKey({ id: "E9" })).toBe("E9");
    expect(getEmployeeKey({ name: "Ali" })).toBe("EMP-ali");
    expect(getEmployeeLevel({ position: "Satış direktoru" })).toBe("Rəhbərlik");
    expect(getEmployeeLevel({ position: "Baş mühasib" })).toBe("Şöbə rəhbəri");
    expect(getEmployeeLevel({ position: "Kuryer" })).toBe("Komanda üzvü");
    expect(getEmployeeManagerName(team[1], team)).toBe("Rəna");
    expect(getDepartmentParentName({ department: "Əməliyyat / Anbar / Qəbul" })).toBe("Əməliyyat / Anbar");
    expect(getHrDraft(team[1], team)).toMatchObject({ managerId: "E1", managerName: "Rəna", level: "Komanda üzvü" });
    expect(getKpiPeriodKey("2026-11-16")).toBe("2026-11");
  });

  it("builds employee records with KPI bonus, payroll and leave balance", () => {
    const [lead, member, low] = buildHrEmployeeRecords(
      [{ ...team[0], leaveBalance: 20 }, team[1], team[2]],
      [{ employeeId: "E1", days: 5, status: "Təsdiq edildi" }, { employeeId: "E1", days: 2, status: "Təsdiq gözləyir" }],
    );
    expect(lead).toMatchObject({ bonus: 420, leaveBalance: 15, pendingLeaveDays: 2, documentsComplete: 100, documentStatus: "Tamam", payrollStatus: "Hesablama hazırdır" });
    expect(lead.netSalary).toBe(calculatePayrollTax2026(3420).net);
    expect(member.bonus).toBe(70);
    expect(low.bonus).toBe(0);
    expect(buildHrLeaveUsageMap([{ employeeId: "E1", employeeName: "Rəna", days: 3, status: "Təsdiq edildi" }]).get("Rəna")).toEqual({ approved: 3, pending: 0 });
  });

  it("flags missing documents", () => {
    expect(getHrDocumentHealth({ documentsComplete: 50 })).toMatchObject({ missingCount: 3, status: "Yenilənməlidir" });
    expect(getHrDocumentHealth({ documentsComplete: 90 })).toMatchObject({ missingCount: 1, status: "Təsdiq gözləyir" });
  });

  it("joins sales bonuses onto KPI rows", () => {
    const [lead, member] = buildKpiEmployeeScoreRows(team, [{ seller: "Orxan", paid: 500, bonusAmount: 25.4 }]);
    expect(member).toMatchObject({ salesOrders: 1, salesBonus: 25, performanceBonus: 70, payoutAmount: 95, payoutStatus: "Payout hazır" });
    expect(lead.salesOrders).toBe(0);
  });

  it("builds the department structure, tree, scope and planning rows", () => {
    const structure = buildHrStructure(team, [{ name: "Satış", parentDepartment: "Kommersiya" }, { name: "IT" }]);
    expect(structure.map((row) => [row.department, row.count, row.parentDepartment])).toEqual([
      ["IT", 0, ""], ["Maliyyə", 1, ""], ["Satış", 2, "Kommersiya"],
    ]);
    expect(structure[2].roots.map((root: { name: string; children: unknown[] }) => [root.name, root.children.length])).toEqual([["Rəna", 1]]);

    const tree = buildHrDepartmentTree(structure);
    expect(tree.map((node) => [node.id, node.isVirtual])).toEqual([["IT", false], ["Kommersiya", true], ["Maliyyə", false]]);
    expect(getHrDepartmentIds(tree)).toEqual(["IT", "Kommersiya", "Satış", "Maliyyə"]);
    expect([...getHrDepartmentScope(tree, "Kommersiya")!]).toEqual(["Kommersiya", "Satış"]);
    expect(getHrDepartmentScope(tree, "all")).toBeNull();

    expect(buildHrPlanningRows(structure).find((row) => row.department === "Maliyyə")).toMatchObject({ vacancyNeed: 1, status: "Vakansiya aç" });
    const recruitment = buildHrRecruitmentRows(buildHrPlanningRows(structure), [{ id: "V1", department: "IT" }]);
    expect(recruitment.map((row) => row.id)).toEqual(["V1", "PLAN-Maliyyə"]);
  });

  it("builds the reporting forest and filters it by department scope", () => {
    const forest = buildHrReportingForest(team);
    expect(forest.map((node) => [node.name, node.children.length])).toEqual([["Aysel", 0], ["Rəna", 1]]);
    const scoped = buildHrReportingForest(team, new Set(["Maliyyə"]));
    // Current behaviour: an out-of-scope manager whose reports are all out of scope still shows, with no children.
    expect(scoped.map((node) => [node.name, node.isInScope, node.children.length])).toEqual([["Aysel", true, 0], ["Rəna", false, 0]]);
  });

  it("maps leave requests to the employee or a deleted placeholder", () => {
    const records = buildHrEmployeeRecords(team);
    const rows = buildHrLeaveRows(records, [{ id: "L1", employeeId: "E2", days: 2 }, { id: "L2", employeeId: "X" }]);
    expect(rows.map((row) => [row.employee, row.status, row.approver])).toEqual([
      ["Orxan", "Təsdiq gözləyir", "Rəna"],
      ["Əməkdaş silinib", "Təsdiq gözləyir", "HR"],
    ]);
  });
});
