import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as legacy from "../shared/lib/appDomainHr.jsx";
import * as barrel from "../shared/lib/appDomain.jsx";
import * as platforms from "../modules/hr/components/HrPlatforms.tsx";
import * as structureComponents from "../modules/hr/components/HrStructure.tsx";
import {
  HrAttendancePlatform,
  HrEmployeePlatform,
  HrLeavePlatform,
  HrPayrollPlatform,
  HrRecruitmentPlatform,
} from "../modules/hr/components/HrPlatforms.tsx";
import { HrStructureTree } from "../modules/hr/components/HrStructure.tsx";
import { buildHrEmployeeRecords, buildHrStructure } from "../shared/lib/hrDomain.ts";

const team = [
  { id: "E1", name: "Rəna", initials: "RA", position: "Satış direktoru", department: "Satış", salary: 3000, kpi: 106 },
  { id: "E2", name: "Orxan", initials: "OR", position: "Satış meneceri", department: "Satış", salary: 1000, kpi: 96, managerId: "E1", documentReviewRequired: true, documentsComplete: 50 },
];

describe("HR components", () => {
  it("stays importable from appDomainHr.jsx and the appDomain barrel", () => {
    for (const [name, value] of [...Object.entries(platforms), ...Object.entries(structureComponents)]) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(value);
      expect((barrel as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it("shows the employee 360 profile and completes missing documents", () => {
    const records = buildHrEmployeeRecords(team);
    const onUpdateDocuments = vi.fn();
    const onSelect = vi.fn();
    const { container, getByText, getByTestId } = render(
      <HrEmployeePlatform records={records} selectedRecord={records[1]} onSelect={onSelect} onEdit={vi.fn()} onDelete={vi.fn()} onUpdateDocuments={onUpdateDocuments} />,
    );
    expect(container.querySelector(".hr-profile-head")?.textContent).toContain("Orxan");
    fireEvent.click(container.querySelectorAll(".hr-person-row")[0]);
    expect(onSelect).toHaveBeenCalledWith("E1");
    fireEvent.click(getByText("Sənədlər"));
    fireEvent.click(getByTestId("hr-document-complete"));
    expect(onUpdateDocuments).toHaveBeenCalledWith("E2", 100);
  });

  it("renders an empty state when no employee is selected", () => {
    const { container } = render(<HrEmployeePlatform records={[]} selectedRecord={null} onSelect={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(container.textContent).toContain("Filterə uyğun əməkdaş tapılmadı");
  });

  it("approves leave and closes payroll from the tables", () => {
    const onUpdateStatus = vi.fn();
    const leave = render(<HrLeavePlatform rows={[{ id: "L1", employee: "Orxan", days: 2, balance: 10, status: "Təsdiq gözləyir" }]} onCreate={vi.fn()} onUpdateStatus={onUpdateStatus} />);
    fireEvent.click(leave.getByText("Təsdiq"));
    expect(onUpdateStatus).toHaveBeenCalledWith("L1", "Təsdiq edildi");

    const onMarkPaid = vi.fn();
    const payroll = render(<HrPayrollPlatform rows={[{ employeeKey: "E1", employee: "Rəna", salary: 1000, bonus: 0, deductions: 115, netSalary: 885, employerCost: 1169, status: "Hesablama hazırdır" }]} onMarkPaid={onMarkPaid} />);
    fireEvent.click(payroll.getByText("Ödənişi bağla"));
    expect(onMarkPaid).toHaveBeenCalledWith("E1");
  });

  it("renders attendance and recruitment summaries", () => {
    const attendance = render(<HrAttendancePlatform rows={[{ employee: "Rəna", attendanceRate: 80, lateDays: 3, status: "Nəzarət" }]} />);
    expect(attendance.container.querySelector(".hr-platform-summary")?.textContent).toContain("3");
    const recruitment = render(<HrRecruitmentPlatform rows={[{ role: "Analitik", department: "IT", owner: "HR", candidates: 4, stage: "Müsahibə", status: "Aktiv vakansiya" }]} onCreate={vi.fn()} />);
    expect(recruitment.container.querySelector(".hr-recruitment-card")?.textContent).toContain("Analitik");
  });

  it("draws the department tree and the reporting line", () => {
    const onSelectEmployee = vi.fn();
    const { container } = render(<HrStructureTree structure={buildHrStructure(team)} employees={team} onSelectEmployee={onSelectEmployee} />);
    expect(container.querySelector(".hr-org-card strong")?.textContent).toBe("Satış");
    // The department card also names the lead, so pick the reporting-line node itself.
    const leadNode = container.querySelector(".hr-employee-node") as HTMLElement;
    expect(leadNode.textContent).toContain("Rəna");
    fireEvent.click(leadNode);
    expect(onSelectEmployee).toHaveBeenCalledWith("E1");
  });
});
