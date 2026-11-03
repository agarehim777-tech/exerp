import { parsePaymentDate } from "../../services/date.js";
import { normalize } from "../../services/format.js";
import { baseFinanceDate, dayInMs, getDepartmentParentName, getEmployeeKey, getEmployeeManagerName, getHrDocumentHealth } from "../lib/appDomain.jsx";

// HR commands for the browser state (employees, departments, leave, payroll, documents,
// vacancies), moved out of App.jsx unchanged. App passes in the state, the modal setter and
// its permission, audit and HR workflow helpers.
export function createHrActions({ state, setState, setModal, notify, requirePermission, auditCurrentState, auditOperation, getActionStamp, syncHrWorkflow }) {
  function updateEmployeeStructure(employeeId, values) {
    if (!requirePermission("hr.manage", "HR strukturunu dəyişmək")) return;

    setState((current) => {
      const manager = current.employees.find((employee) => getEmployeeKey(employee) === values.managerId && getEmployeeKey(employee) !== employeeId);
      return {
        ...current,
        employees: current.employees.map((employee) =>
          getEmployeeKey(employee) === employeeId
            ? {
                ...employee,
                department: values.department,
                departmentParent: values.departmentParent || "",
                position: values.position,
                managerId: manager ? getEmployeeKey(manager) : "",
                managerName: manager?.name || "",
                level: values.level,
              }
            : employee,
        ),
      };
    });
    notify("Əməkdaş struktur ağacında yeniləndi.");
    auditOperation({
      module: "HR",
      action: "Struktur yeniləndi",
      detail: employeeId,
    });
  }

  function openEmployeeEditor(employee) {
    if (!requirePermission("hr.manage", "əməkdaş məlumatlarını redaktə etmək")) return;
    setModal({ type: "hr", mode: "edit", employeeId: getEmployeeKey(employee) });
  }

  function updateEmployee(employeeId, values) {
    if (!requirePermission("hr.manage", "əməkdaş məlumatlarını redaktə etmək")) return;

    setState((current) => {
      const existing = current.employees.find((employee) => getEmployeeKey(employee) === employeeId);
      if (!existing) return current;

      const nextName = String(values.name || "").trim();
      const manager = current.employees.find(
        (employee) => getEmployeeKey(employee) === values.managerId && getEmployeeKey(employee) !== employeeId,
      );
      const documentsComplete = Math.max(0, Math.min(100, Number(values.documentsComplete ?? 100)));
      const hrStatus = values.hrStatus === "Məlumat gözləyir" ? "Məlumat gözləyir" : "Stabil";
      const updatedEmployee = {
        ...existing,
        initials: nextName
          .split(" ")
          .filter(Boolean)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toLocaleUpperCase("az-AZ"),
        name: nextName,
        position: values.position,
        department: values.department,
        departmentParent: values.departmentParent || "",
        managerId: manager ? getEmployeeKey(manager) : "",
        managerName: manager?.name || "",
        level: values.level || "Komanda üzvü",
        salary: Number(values.salary || 0),
        kpi: Number(values.kpi || 0),
        hireDate: values.hireDate || "",
        workMode: values.workMode || "Ofis",
        shift: values.shift || "09:00-18:00",
        employmentType: values.employmentType || "Tam ştat",
        leaveBalance: Math.max(0, Number(values.leaveBalance || 0)),
        documentsComplete,
        hrStatus,
        documentReviewRequired: hrStatus === "Məlumat gözləyir" || documentsComplete < 100,
        skills: String(values.skills || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      const previousDepartment = String(existing.department || "").trim();
      const shouldPreservePreviousDepartment =
        previousDepartment &&
        normalize(previousDepartment) !== normalize(updatedEmployee.department) &&
        !current.employees.some(
          (employee) => getEmployeeKey(employee) !== employeeId && normalize(employee.department) === normalize(previousDepartment),
        ) &&
        !(current.departments || []).some((department) => normalize(department.name) === normalize(previousDepartment));
      const preservedDepartments = shouldPreservePreviousDepartment
        ? [
            {
              id: `DEP-${Date.now()}`,
              name: previousDepartment,
              parentDepartment: getDepartmentParentName(existing),
              description: "",
              status: "Aktiv",
              createdAt: getActionStamp(),
            },
            ...(current.departments || []),
          ]
        : current.departments || [];

      return auditCurrentState(
        {
          ...current,
          departments: preservedDepartments,
          employees: current.employees.map((employee) => {
            if (getEmployeeKey(employee) === employeeId) return updatedEmployee;
            if (employee.managerId === employeeId || (!employee.managerId && employee.managerName === existing.name)) {
              return { ...employee, managerId: employeeId, managerName: nextName };
            }
            return employee;
          }),
        },
        {
          module: "HR",
          action: "Əməkdaş redaktə edildi",
          detail: `${existing.name} → ${nextName}`,
        },
      );
    });
    setModal(null);
    notify(`${values.name} əməkdaş məlumatları yeniləndi.`);
  }

  function openDepartmentCreator() {
    if (!requirePermission("hr.manage", "şöbə əlavə etmək")) return;
    setModal({ type: "department" });
  }

  function createDepartment(values) {
    if (!requirePermission("hr.manage", "şöbə əlavə etmək")) return;

    const name = String(values.name || "").trim();
    const parentDepartment = String(values.parentDepartment || "").trim();
    if (!name) {
      notify("Şöbə adı daxil edin.", "warning");
      return;
    }
    if (normalize(name) === normalize(parentDepartment)) {
      notify("Şöbə özünə tabe ola bilməz.", "warning");
      return;
    }
    const exists = [...state.departments, ...state.employees.map((employee) => ({ name: employee.department }))].some(
      (department) => normalize(department.name) === normalize(name),
    );
    if (exists) {
      notify("Bu adlı şöbə artıq mövcuddur.", "warning");
      return;
    }

    const department = {
      id: `DEP-${Date.now()}`,
      name,
      parentDepartment,
      description: String(values.description || "").trim(),
      status: values.status || "Aktiv",
      createdAt: getActionStamp(),
    };
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          departments: [department, ...(current.departments || [])],
        },
        {
          module: "HR",
          action: "Şöbə əlavə edildi",
          detail: parentDepartment ? `${name} → ${parentDepartment}` : name,
        },
      ),
    );
    setModal(null);
    notify(`${name} şöbəsi əlavə edildi.`);
  }

  function openLeaveRequestCreator() {
    if (!requirePermission("hr.manage", "məzuniyyət qeydi yaratmaq")) return;
    setModal({ type: "leaveRequest" });
  }

  function createLeaveRequest(values) {
    if (!requirePermission("hr.manage", "məzuniyyət qeydi yaratmaq")) return;

    const employee = state.employees.find((item) => getEmployeeKey(item) === values.employeeId);
    const from = parsePaymentDate(values.from);
    const to = parsePaymentDate(values.to);
    if (!employee || !from || !to || to < from) {
      notify("Əməkdaş və düzgün məzuniyyət tarixlərini seçin.", "warning");
      return;
    }
    const days = Math.floor((to.getTime() - from.getTime()) / dayInMs) + 1;
    const request = {
      id: `LEAVE-${Date.now()}`,
      employeeId: getEmployeeKey(employee),
      employeeName: employee.name,
      department: employee.department,
      type: values.type || "İllik məzuniyyət",
      from: values.from,
      to: values.to,
      days,
      approver: getEmployeeManagerName(employee, state.employees) || "HR",
      status: "Təsdiq gözləyir",
      createdAt: getActionStamp(),
    };
    setState((current) =>
      auditCurrentState(
        { ...current, leaveRequests: [request, ...(current.leaveRequests || [])] },
        { module: "HR", action: "Məzuniyyət qeydi yaradıldı", detail: `${employee.name} · ${days} gün` },
      ),
    );
    queueMicrotask(() => syncHrWorkflow("leave_request", request, "pending", [
      { role_code: "line_manager" },
      { role_code: "hr_manager" },
    ]));
    setModal(null);
    notify(`${employee.name} üçün məzuniyyət qeydi yaradıldı.`);
  }

  function updateLeaveRequestStatus(requestId, status) {
    if (!requirePermission("hr.manage", "məzuniyyət statusunu dəyişmək")) return;

    const nextStatus = status === "Təsdiq edildi" ? "Təsdiq edildi" : "İmtina edildi";
    const request = (state.leaveRequests || []).find((item) => item.id === requestId);
    const stamp = getActionStamp();
    if (!request) return;

    setState((current) => {
      return auditCurrentState(
        {
          ...current,
          leaveRequests: (current.leaveRequests || []).map((item) =>
            item.id === requestId
              ? {
                  ...item,
                  status: nextStatus,
                  decidedAt: stamp,
                }
              : item,
          ),
        },
        {
          module: "HR",
          action: "Məzuniyyət statusu dəyişdi",
          detail: `${request.employeeName || requestId} · ${nextStatus}`,
        },
      );
    });
    notify(`Məzuniyyət sorğusu: ${nextStatus}.`);
    queueMicrotask(() => syncHrWorkflow(
      "leave_request",
      { ...request, status: nextStatus, decidedAt: stamp },
      status === "Təsdiq edildi" ? "approved" : "rejected",
    ));
  }

  function markPayrollPaid(employeeId) {
    if (!requirePermission("hr.manage", "payroll statusunu dəyişmək")) return;

    const employee = state.employees.find((item) => getEmployeeKey(item) === employeeId);
    if (!employee) return;
    const documentsComplete =
      employee.documentReviewRequired || employee.hrStatus === "Məlumat gözləyir"
        ? Number(employee.documentsComplete || 0)
        : 100;
    const documentHealth = getHrDocumentHealth({ ...employee, documentsComplete });
    if (documentHealth.missingCount > 0 && !employee.payrollPaidAt) {
      notify("Sənədlər tamamlanmadan payroll ödənişi bağlana bilməz.", "warning");
      return;
    }

    const stamp = getActionStamp();
    setState((current) => {
      return auditCurrentState(
        {
          ...current,
          employees: current.employees.map((item) =>
            getEmployeeKey(item) === employeeId
              ? {
                  ...item,
                  payrollStatus: "Ödənildi",
                  payrollPaidAt: stamp,
                  payrollPeriod: baseFinanceDate.slice(0, 7),
                }
              : item,
          ),
        },
        {
          module: "HR/Payroll",
          action: "Payroll ödəniş statusu dəyişdi",
          detail: `${employee.name} · Ödənildi · ${baseFinanceDate.slice(0, 7)}`,
        },
      );
    });
    notify("Payroll statusu ödənildi kimi bağlandı.");
    queueMicrotask(() => syncHrWorkflow(
      "payroll_line",
      { ...employee, id: `${employeeId}-${baseFinanceDate.slice(0, 7)}`, employeeId, employeeName: employee.name, payrollPaidAt: stamp },
      "paid",
    ));
  }

  function updateEmployeeDocuments(employeeId, documentsComplete = 100) {
    if (!requirePermission("hr.manage", "əməkdaş sənədlərini yeniləmək")) return;

    const nextScore = Math.max(0, Math.min(100, Number(documentsComplete || 0)));
    const employee = state.employees.find((item) => getEmployeeKey(item) === employeeId);
    const stamp = getActionStamp();
    if (!employee) return;

    setState((current) => {
      const documentReviewRequired = nextScore < 100;
      const nextPayrollStatus = employee.payrollPaidAt
        ? "Ödənildi"
        : documentReviewRequired
          ? "Sənəd gözləyir"
          : employee.payrollStatus === "Sənəd gözləyir"
            ? "Hesablama hazırdır"
            : employee.payrollStatus || "Hesablama hazırdır";

      return auditCurrentState(
        {
          ...current,
          employees: current.employees.map((item) =>
            getEmployeeKey(item) === employeeId
              ? {
                  ...item,
                  documentsComplete: nextScore,
                  documentReviewRequired,
                  hrStatus: documentReviewRequired ? "Məlumat gözləyir" : "Stabil",
                  payrollStatus: nextPayrollStatus,
                  documentUpdatedAt: stamp,
                }
              : item,
          ),
        },
        {
          module: "HR",
          action: "Əməkdaş sənədləri yeniləndi",
          detail: `${employee.name} · ${nextScore}%`,
        },
      );
    });
    notify(nextScore === 100 ? "Əməkdaş sənədləri tamamlandı." : "Əməkdaş sənəd statusu yeniləndi.");
    queueMicrotask(() => syncHrWorkflow(
      "employee_document_check",
      { id: `${employeeId}-documents`, employeeId, employeeName: employee.name, documentsComplete: nextScore, updatedAt: stamp },
      nextScore === 100 ? "completed" : "pending",
    ));
  }

  function openVacancyCreator() {
    if (!requirePermission("hr.manage", "vakansiya yaratmaq")) return;
    setModal({ type: "vacancy" });
  }

  function createVacancy(values) {
    if (!requirePermission("hr.manage", "vakansiya yaratmaq")) return;

    const role = String(values.role || "").trim();
    const department = String(values.department || "").trim();
    if (!role || !department) {
      notify("Vakansiya üçün rol və şöbə seçin.", "warning");
      return;
    }
    const vacancy = {
      id: `VAC-${Date.now()}`,
      role,
      department,
      candidates: 0,
      stage: "Namizəd gözlənilir",
      owner: values.owner || "HR",
      targetDate: values.targetDate || "",
      status: "Aktiv vakansiya",
      createdAt: getActionStamp(),
    };
    setState((current) =>
      auditCurrentState(
        { ...current, vacancies: [vacancy, ...(current.vacancies || [])] },
        { module: "HR", action: "Vakansiya yaradıldı", detail: `${role} · ${department}` },
      ),
    );
    setModal(null);
    notify(`${role} vakansiyası yaradıldı.`);
  }

  function openEmployeeDelete(employee) {
    if (!requirePermission("hr.manage", "əməkdaş silmək")) return;
    setModal({ type: "employeeDelete", employeeId: getEmployeeKey(employee) });
  }

  function deleteEmployee(employeeId, replacementManagerId = "") {
    if (!requirePermission("hr.manage", "əməkdaş silmək")) return;

    setState((current) => {
      const employee = current.employees.find((item) => getEmployeeKey(item) === employeeId);
      if (!employee) return current;

      const directReports = current.employees.filter(
        (item) => item.managerId === employeeId || (!item.managerId && item.managerName === employee.name),
      );
      const directReportKeys = new Set(directReports.map((item) => getEmployeeKey(item)));
      const replacement = current.employees.find(
        (item) =>
          getEmployeeKey(item) === replacementManagerId &&
          getEmployeeKey(item) !== employeeId &&
          !directReportKeys.has(getEmployeeKey(item)),
      );
      const remainingEmployees = current.employees.filter((item) => getEmployeeKey(item) !== employeeId);
      const employeeDepartment = String(employee.department || "").trim();
      const shouldPreserveDepartment =
        employeeDepartment &&
        !remainingEmployees.some((item) => normalize(item.department) === normalize(employeeDepartment)) &&
        !(current.departments || []).some((department) => normalize(department.name) === normalize(employeeDepartment));
      const preservedDepartments = shouldPreserveDepartment
        ? [
            {
              id: `DEP-${Date.now()}`,
              name: employeeDepartment,
              parentDepartment: getDepartmentParentName(employee),
              description: "",
              status: "Aktiv",
              createdAt: getActionStamp(),
            },
            ...(current.departments || []),
          ]
        : current.departments || [];

      return auditCurrentState(
        {
          ...current,
          departments: preservedDepartments,
          employees: remainingEmployees
            .map((item) =>
              item.managerId === employeeId || (!item.managerId && item.managerName === employee.name)
                ? {
                    ...item,
                    managerId: replacement ? getEmployeeKey(replacement) : "",
                    managerName: replacement?.name || "",
                  }
                : item,
            ),
        },
        {
          module: "HR",
          action: "Əməkdaş silindi",
          detail: `${employee.name} · ${directReports.length} tabe əməkdaş yenidən təyin edildi`,
        },
      );
    });
    setModal(null);
    notify("Əməkdaş silindi və tabeçilik xətti yeniləndi.");
  }

  return { updateEmployeeStructure, openEmployeeEditor, updateEmployee, openDepartmentCreator, createDepartment, openLeaveRequestCreator, createLeaveRequest, updateLeaveRequestStatus, markPayrollPaid, updateEmployeeDocuments, openVacancyCreator, createVacancy, openEmployeeDelete, deleteEmployee };
}
