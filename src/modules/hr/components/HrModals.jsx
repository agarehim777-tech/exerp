import { useState } from "react";
import { CalendarClock, Check, Plus, Trash2, X } from "lucide-react";
import { AvatarLine } from "../../../components/ui.jsx";
import {
  currentBusinessDate,
  getDepartmentParentName,
  getEmployeeKey,
  getEmployeeLevel,
  getEmployeeManager,
  hrLevelOptions,
} from "../../../shared/lib/appDomain.jsx";

export function HrEmployeeModal({ employee = null, employees = [], departments: departmentRecords = [], onClose, onSubmit }) {
  const existingManager = employee ? getEmployeeManager(employee, employees) : null;
  const savedDocumentsComplete =
    employee?.documentReviewRequired || employee?.hrStatus === "Məlumat gözləyir"
      ? Number(employee.documentsComplete || 0)
      : 100;
  const departments = [...new Set([
    ...employees.map((item) => item.department),
    ...departmentRecords.map((department) => department.name),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "az"));
  const parentDepartments = [...new Set([
    ...departments,
    ...employees.map((item) => getDepartmentParentName(item)),
    ...departmentRecords.map((department) => department.parentDepartment),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "az"));
  const [values, setValues] = useState({
    name: employee?.name || "",
    position: employee?.position || "",
    department: employee?.department || "",
    departmentParent: employee ? getDepartmentParentName(employee) : "",
    managerId: existingManager ? getEmployeeKey(existingManager) : "",
    level: employee ? getEmployeeLevel(employee) : "Komanda üzvü",
    salary: employee?.salary ?? "",
    kpi: employee?.kpi ?? "85",
    hireDate: employee?.hireDate || currentBusinessDate,
    workMode: employee?.workMode || "Ofis",
    shift: employee?.shift || "09:00-18:00",
    employmentType: employee?.employmentType || "Tam ştat",
    leaveBalance: employee?.leaveBalance ?? "0",
    documentsComplete: String(savedDocumentsComplete),
    hrStatus: employee?.hrStatus === "Məlumat gözləyir" ? "Məlumat gözləyir" : "Stabil",
    skills: Array.isArray(employee?.skills) ? employee.skills.join(", ") : "",
  });
  const managerOptions = employees.filter((item) => getEmployeeKey(item) !== getEmployeeKey(employee || {}));

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({ ...values, documentsComplete: Number(values.documentsComplete || 0) });
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-employee-modal">
        <div className="modal-head">
          <div>
            <h2>{employee ? "Əməkdaşı redaktə et" : "Yeni əməkdaş"}</h2>
            <p>{employee ? "Əməkdaşın şəxsi, iş və tabeçilik məlumatlarını yeniləyin." : "Şöbə və tabeçilik məlumatını daxil edin."}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <label><span>Ad Soyad</span><input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} /></label>
          <label><span>Vəzifə</span><input value={values.position} required onChange={(event) => updateValue("position", event.target.value)} /></label>
          <label>
            <span>Şöbə</span>
            <input value={values.department} list="employee-departments" required onChange={(event) => updateValue("department", event.target.value)} />
            <datalist id="employee-departments">{departments.map((department) => <option key={department} value={department} />)}</datalist>
          </label>
          <label>
            <span>Üst şöbə</span>
            <input value={values.departmentParent} list="employee-parent-departments" onChange={(event) => updateValue("departmentParent", event.target.value)} />
            <datalist id="employee-parent-departments"><option value="" />{parentDepartments.map((department) => <option key={department} value={department} />)}</datalist>
          </label>
          <label>
            <span>Kimə tabedir</span>
            <select value={values.managerId} onChange={(event) => updateValue("managerId", event.target.value)}>
              <option value="">Birbaşa rəhbərlik</option>
              {managerOptions.map((manager) => <option key={getEmployeeKey(manager)} value={getEmployeeKey(manager)}>{manager.name} · {manager.position}</option>)}
            </select>
          </label>
          <label><span>Səviyyə</span><select value={values.level} onChange={(event) => updateValue("level", event.target.value)}>{hrLevelOptions.map((level) => <option key={level}>{level}</option>)}</select></label>
          <label><span>Maaş</span><input type="number" min="0" value={values.salary} required onChange={(event) => updateValue("salary", event.target.value)} /></label>
          <label><span>KPI</span><input type="number" min="0" value={values.kpi} onChange={(event) => updateValue("kpi", event.target.value)} /></label>
          <label><span>Sənəd uyğunluğu, %</span><input type="number" min="0" max="100" value={values.documentsComplete} onChange={(event) => updateValue("documentsComplete", event.target.value)} /></label>
          <label><span>HR statusu</span><select value={values.hrStatus} onChange={(event) => updateValue("hrStatus", event.target.value)}><option>Stabil</option><option>Məlumat gözləyir</option></select></label>
          <label><span>İşə qəbul tarixi</span><input type="date" value={values.hireDate} onChange={(event) => updateValue("hireDate", event.target.value)} /></label>
          <label><span>İş rejimi</span><select value={values.workMode} onChange={(event) => updateValue("workMode", event.target.value)}><option>Ofis</option><option>Hybrid</option><option>Sahə</option><option>Uzaqdan</option></select></label>
          <label><span>Növbə</span><input value={values.shift} onChange={(event) => updateValue("shift", event.target.value)} /></label>
          <label><span>Məşğulluq tipi</span><select value={values.employmentType} onChange={(event) => updateValue("employmentType", event.target.value)}><option>Tam ştat</option><option>Yarım ştat</option><option>Müqaviləli</option><option>Sınaq müddəti</option></select></label>
          <label><span>Məzuniyyət balansı</span><input type="number" min="0" value={values.leaveBalance} onChange={(event) => updateValue("leaveBalance", event.target.value)} /></label>
          <label className="full"><span>Bacarıqlar</span><input value={values.skills} onChange={(event) => updateValue("skills", event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn">{employee ? <Check size={16} /> : <Plus size={16} />}{employee ? "Yadda saxla" : "Əməkdaş yarat"}</button></div>
        </form>
      </div>
    </div>
  );
}

export function HrDepartmentModal({ employees = [], departments = [], onClose, onSubmit }) {
  const parentDepartments = [...new Set([
    ...employees.map((employee) => employee.department),
    ...employees.map((employee) => getDepartmentParentName(employee)),
    ...departments.map((department) => department.name),
    ...departments.map((department) => department.parentDepartment),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "az"));
  const [values, setValues] = useState({ name: "", parentDepartment: "", description: "", status: "Aktiv" });
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-department-modal">
        <div className="modal-head"><div><h2>Yeni şöbə</h2><p>Şöbəni struktur ağacına əlavə edin və istəsəniz onu üst şöbəyə bağlayın.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
        <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
          <label><span>Şöbə adı</span><input value={values.name} required autoFocus onChange={(event) => updateValue("name", event.target.value)} /></label>
          <label><span>Üst şöbə</span><input value={values.parentDepartment} list="new-department-parents" onChange={(event) => updateValue("parentDepartment", event.target.value)} /><datalist id="new-department-parents"><option value="" />{parentDepartments.map((department) => <option key={department} value={department} />)}</datalist></label>
          <label className="full"><span>Qısa izah</span><textarea value={values.description} onChange={(event) => updateValue("description", event.target.value)} /></label>
          <label><span>Status</span><select value={values.status} onChange={(event) => updateValue("status", event.target.value)}><option>Aktiv</option><option>Planlanır</option><option>Passiv</option></select></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Plus size={16} /> Şöbə əlavə et</button></div>
        </form>
      </div>
    </div>
  );
}

export function HrEmployeeDeleteModal({ employee, employees = [], onClose, onConfirm }) {
  const employeeId = getEmployeeKey(employee);
  const directReports = employees.filter((item) => item.managerId === employeeId || (!item.managerId && item.managerName === employee.name));
  const directReportIds = new Set(directReports.map((item) => getEmployeeKey(item)));
  const replacementOptions = employees.filter((item) => getEmployeeKey(item) !== employeeId && !directReportIds.has(getEmployeeKey(item)));
  const currentManager = getEmployeeManager(employee, employees);
  const [replacementManagerId, setReplacementManagerId] = useState(currentManager ? getEmployeeKey(currentManager) : "");

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-delete-modal">
        <div className="modal-head"><div><h2>Əməkdaşı sil</h2><p>Bu əməliyyat əməkdaşı HR reyestrindən silir və audit izini saxlayır.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
        <div className="hr-delete-summary"><AvatarLine initials={employee.initials} title={employee.name} subtitle={`${employee.position} · ${employee.department}`} /><span>{directReports.length ? `${directReports.length} əməkdaş bu şəxsə tabedir` : "Birbaşa tabe əməkdaş yoxdur"}</span></div>
        {directReports.length > 0 && (
          <label className="hr-delete-reassignment"><span>Tabe əməkdaşların yeni rəhbəri</span><select value={replacementManagerId} onChange={(event) => setReplacementManagerId(event.target.value)}><option value="">Birbaşa rəhbərlik</option>{replacementOptions.map((manager) => <option key={getEmployeeKey(manager)} value={getEmployeeKey(manager)}>{manager.name} · {manager.position}</option>)}</select><small>{directReports.map((report) => report.name).join(", ")}</small></label>
        )}
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="button" className="secondary-btn danger-outline" onClick={() => onConfirm(replacementManagerId)}><Trash2 size={16} /> Sil</button></div>
      </div>
    </div>
  );
}

export function HrLeaveRequestModal({ employees = [], onClose, onSubmit }) {
  const [values, setValues] = useState({ employeeId: employees[0] ? getEmployeeKey(employees[0]) : "", type: "İllik məzuniyyət", from: currentBusinessDate, to: currentBusinessDate });
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-operation-modal">
        <div className="modal-head"><div><h2>Məzuniyyət qeydi</h2><p>Əməkdaş, məzuniyyət növü və tarix aralığını qeyd edin.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
        <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
          <label><span>Əməkdaş</span><select value={values.employeeId} required onChange={(event) => updateValue("employeeId", event.target.value)}><option value="">Əməkdaş seçin</option>{employees.map((employee) => <option key={getEmployeeKey(employee)} value={getEmployeeKey(employee)}>{employee.name} · {employee.department}</option>)}</select></label>
          <label><span>Məzuniyyət növü</span><select value={values.type} onChange={(event) => updateValue("type", event.target.value)}><option>İllik məzuniyyət</option><option>Ödənişsiz məzuniyyət</option><option>Xəstəlik vərəqəsi</option><option>Ezamiyyət</option></select></label>
          <label><span>Başlanğıc tarixi</span><input type="date" value={values.from} required onChange={(event) => updateValue("from", event.target.value)} /></label>
          <label><span>Bitmə tarixi</span><input type="date" value={values.to} required onChange={(event) => updateValue("to", event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><CalendarClock size={16} /> Qeyd yarat</button></div>
        </form>
      </div>
    </div>
  );
}

export function HrVacancyModal({ employees = [], departments = [], onClose, onSubmit }) {
  const departmentOptions = [...new Set([...employees.map((employee) => employee.department), ...departments.map((department) => department.name)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "az"));
  const [values, setValues] = useState({ role: "", department: departmentOptions[0] || "", owner: "HR", targetDate: currentBusinessDate });
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-operation-modal">
        <div className="modal-head"><div><h2>Yeni vakansiya</h2><p>Rol, şöbə və hədəf tarixi qeyd etməklə işə qəbul prosesini başladın.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
        <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
          <label><span>Rol</span><input value={values.role} required autoFocus onChange={(event) => updateValue("role", event.target.value)} /></label>
          <label><span>Şöbə</span><input value={values.department} list="vacancy-departments" required onChange={(event) => updateValue("department", event.target.value)} /><datalist id="vacancy-departments">{departmentOptions.map((department) => <option key={department} value={department} />)}</datalist></label>
          <label><span>Məsul şəxs</span><input value={values.owner} required onChange={(event) => updateValue("owner", event.target.value)} /></label>
          <label><span>Hədəf tarixi</span><input type="date" value={values.targetDate} onChange={(event) => updateValue("targetDate", event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Plus size={16} /> Vakansiya yarat</button></div>
        </form>
      </div>
    </div>
  );
}
