// HR platforma bölmələri: əməkdaş 360 profili, davamiyyət, məzuniyyət, payroll və recruitment.
// HR məntiqi shared/lib/hrDomain.ts-dədir; appDomainHr.jsx bu komponentləri köhnə idxallar üçün yenidən ixrac edir.
import { CalendarClock, Check, FileText, LayoutDashboard, Pencil, Plus, Trash2, Users, Wallet, type LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  AvatarLine,
  EmptyState,
  ProgressRow,
  SimpleTable as DataTable,
  StatusBadge,
  TwoLine,
} from "../../../shared/ui/primitives.tsx";
import { money, percent } from "../../../services/format.js";
import { getHrDocumentRows } from "../../../shared/lib/hrDomain.ts";

type Row = Record<string, any>;

export function HrEmployeePlatform({ records, selectedRecord, onSelect, onEdit, onDelete, onUpdateDocuments }: {
  records: Row[];
  selectedRecord?: Row | null;
  onSelect: (employeeKey: string) => void;
  onEdit: (record: Row) => void;
  onDelete: (record: Row) => void;
  onUpdateDocuments?: (employeeKey: string, documentsComplete: number) => void;
}) {
  const [profileView, setProfileView] = useState("Ümumi");
  if (!selectedRecord) return <EmptyState title={records.length ? "Əməkdaş seçilməyib" : "Filtrə uyğun əməkdaş tapılmadı"} />;

  const documentRows = selectedRecord.documentRows || getHrDocumentRows(selectedRecord);
  const profileViews: { label: string; icon: LucideIcon; count?: number }[] = [
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
              <Icon size={15} /><span>{label}</span>{count! > 0 && <b>{count}</b>}
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
            {(selectedRecord.skills.length ? selectedRecord.skills : ["Profil bacarıqları əlavə edilməyib"]).map((skill: string) => <span key={skill}>{skill}</span>)}
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
          {documentRows.map((document: Row) => (
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

export function HrAttendancePlatform({ rows }: { rows: Row[] }) {
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
          <small>HR izləmə tapşırığı</small>
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

export function HrLeavePlatform({ rows, onCreate, onUpdateStatus }: {
  rows: Row[];
  onCreate?: () => void;
  onUpdateStatus?: (id: string, status: string) => void;
}) {
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

export function HrPayrollPlatform({ rows, totalNet, onMarkPaid }: {
  rows: Row[];
  totalNet?: number;
  onMarkPaid?: (employeeKey: string) => void;
}) {
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
        columns={["Əməkdaş", "Şöbə", "Dövr", "Maaş", "Bonus", "Tutulma", "Net", "İşəgötürən xərci", "Status", ""]}
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
                onClick={() => onMarkPaid!(row.employeeKey)}
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

export function HrRecruitmentPlatform({ rows, onCreate }: { rows: Row[]; onCreate?: () => void }) {
  const activeRows = rows.filter((row) => row.status === "Aktiv vakansiya");

  return (
    <div className="hr-platform-section">
      <div className="hr-operation-toolbar">
        <span>Vakansiya axını və namizəd mərhələləri</span>
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
        columns={["Rol", "Şöbə", "Namizəd", "Mərhələ", "Məsul", "Hədəf tarix", "Status"]}
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
