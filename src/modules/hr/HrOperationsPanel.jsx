import { Button, Input, Select } from '../../shared/ui/primitives';
import React, { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, Clock, Info, Plus, Users, Wallet } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useHrOperations } from "../../shared/hooks/useHrOperations.js";
import { calcPayroll, periodLabel, workDaysInMonth } from "./payroll.js";
import { toLocalIsoDate } from "../../services/date.js";

const TABS = [
  { id: "attendance", label: "Davamiyyət", icon: Clock, description: "Əməkdaşın gündəlik işlədiyi saatı qeyd edin və aylıq davamiyyət faizini izləyin." },
  { id: "leave", label: "Məzuniyyət", icon: CalendarCheck, description: "Məzuniyyət sorğusu yaradın, müddəti və təsdiq vəziyyətini idarə edin." },
  { id: "payroll", label: "Əmək haqqı", icon: Wallet, description: "Seçilmiş ay üzrə davamiyyətə əsaslanan əmək haqqını hesablayın və dövrü bağlayın." },
];

const money = (value) => `${Number(value || 0).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;
const todayIso = () => toLocalIsoDate();
const currentPeriod = () => toLocalIsoDate().slice(0, 7);

export default function HrOperationsPanel({ employees = [], controlledTab = null }) {
  const { activeTenantId } = useAuth();
  const ops = useHrOperations(activeTenantId, employees);
  const [internalTab, setInternalTab] = useState("attendance");
  const tab = controlledTab || internalTab;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [period, setPeriod] = useState(currentPeriod());

  const [attendance, setAttendance] = useState({ employeeId: "", date: todayIso(), hours: 8, note: "" });
  const [leave, setLeave] = useState({ employeeId: "", startDate: todayIso(), endDate: todayIso(), kind: "Əmək məzuniyyəti" });

  const guard = async (fn) => {
    setBusy(true);
    setMessage(null);
    try { await fn(); setMessage({ tone: "ok", text: "Yadda saxlanıldı" }); }
    catch (error) { setMessage({ tone: "err", text: error.message || String(error) }); }
    finally { setBusy(false); }
  };

  const [year, month] = period.split("-").map(Number);
  const norm = workDaysInMonth(year, month);

  const attendanceSummary = useMemo(() => {
    const rows = ops.byType.attendance.filter((row) => (row.start_date || "").startsWith(period));
    const map = new Map();
    rows.forEach((row) => {
      const entry = map.get(row.employee_id) || { days: 0, hours: 0 };
      entry.days += 1;
      entry.hours += Number(row.payload?.hours ?? row.amount ?? 0);
      map.set(row.employee_id, entry);
    });
    return ops.employees.map((employee) => {
      const entry = map.get(employee.id) || { days: 0, hours: 0 };
      return { employee, ...entry, rate: norm ? Math.round((entry.days / norm) * 100) : 0 };
    });
  }, [ops.byType.attendance, ops.employees, period, norm]);

  const payrollRows = useMemo(() => attendanceSummary.map(({ employee, days }) => {
    const posted = ops.byType.payroll.find(
      (row) => row.employee_id === employee.id && (row.payload?.period === period),
    );
    const result = calcPayroll({
      baseSalary: employee.salary,
      workDays: norm,
      workedDays: days || norm,
    });
    return { employee, ...result, posted };
  }), [attendanceSummary, ops.byType.payroll, period, norm]);

  const payrollTotals = payrollRows.reduce((acc, row) => ({
    gross: acc.gross + row.gross,
    net: acc.net + row.net,
    tax: acc.tax + row.incomeTax + row.socialEmployee + row.unemploymentEmployee + row.medicalEmployee,
    cost: acc.cost + row.employerCost,
  }), { gross: 0, net: 0, tax: 0, cost: 0 });
  const activeTab = TABS.find((item) => item.id === tab) || TABS[0];
  const ActiveTabIcon = activeTab.icon;
  const attendanceTotals = attendanceSummary.reduce((acc, row) => ({ days: acc.days + row.days, hours: acc.hours + row.hours }), { days: 0, hours: 0 });
  const periodLeaveRows = ops.byType.leave.filter((row) => (row.start_date || "").slice(0, 7) === period);

  return (
    <div className={"ui-page-stack"}>
      <div className={"ui-toolbar"}>
        <div>
          <div className={"ui-section-title"}>HR əməliyyatları</div>
          <div className={"ui-help-text"}>Davamiyyət, məzuniyyət və əmək haqqı əməliyyatlarının vahid idarəetmə sahəsi</div>
        </div>
        <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className={"ui-input"} />
      </div>

      {!controlledTab && <div className={"ui-tabs"}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button key={id} onClick={() => setInternalTab(id)} className={["ui-button ui-button-tab",tab === id ? "active" : [].filter(Boolean).join(' ')].filter(Boolean).join(' ')}>
            <Icon size={15} /> {label}
          </Button>
        ))}
      </div>}

      <div className={"ui-notice"}>
        <ActiveTabIcon size={19} />
        <div className={"ui-detail-stack"}><strong>{activeTab.label}</strong><span>{activeTab.description}</span></div>
        <div className={"ui-help-text"}><Info size={13} /> Məlumat mənbəyi: employee_events</div>
      </div>

      {message && <div className={message.tone === "ok" ? "ui-notice ui-notice-success" : "ui-notice ui-notice-danger"}>{message.text}</div>}
      {ops.error && <div className={"ui-notice ui-notice-danger"}>{ops.error.message}</div>}
      {ops.loading && <div className={"ui-notice ui-notice-info"}>Əməkdaş reyestri yenilənir...</div>}

      {tab === "attendance" && (
        <>
          <div className={["hr-ops-form","ui-form-grid ui-form-surface"].filter(Boolean).join(' ')} >
            <Field label="Əməkdaş" hint="Davamiyyəti qeydə alınacaq şəxs">
            <Select value={attendance.employeeId} onChange={(e) => setAttendance({ ...attendance, employeeId: e.target.value })} className={"ui-input"}>
              <option value="">Əməkdaş seçin</option>
              {ops.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </Select>
            </Field>
            <Field label="İş günü" hint="Faktiki iş tarixi"><Input type="date" value={attendance.date} onChange={(e) => setAttendance({ ...attendance, date: e.target.value })} className={"ui-input"} /></Field>
            <Field label="İşlənmiş saat" hint="0–24 saat aralığı"><div className={"ui-unit-input"}><Input type="number" min="0" max="24" step="0.5" value={attendance.hours} onChange={(e) => setAttendance({ ...attendance, hours: e.target.value })} className={["ui-input",'ui-unit-field'].filter(Boolean).join(' ')} /><span className={"ui-unit-label"}>saat</span></div></Field>
            <Field label="Qeyd" hint="İstəyə bağlı izah"><Input value={attendance.note} onChange={(e) => setAttendance({ ...attendance, note: e.target.value })} className={"ui-input"} placeholder="Məsələn, yarım iş günü" /></Field>
            <Button
              disabled={busy || !attendance.employeeId}
              className={"ui-button ui-button-primary"}
              onClick={() => guard(() => ops.createEvent({
                employeeId: attendance.employeeId,
                eventType: "attendance",
                status: "approved",
                startDate: attendance.date,
                amount: Number(attendance.hours || 0),
                payload: { hours: Number(attendance.hours || 0), note: attendance.note },
              }))}
            ><Plus size={15} /> Davamiyyəti qeyd et</Button>
          </div>
          <div className={"ui-stat-grid"}>
            <Total label="Hesabat dövrü" value={periodLabel(period)} />
            <Total label="Əməkdaş sayı" value={`${ops.employees.length} nəfər`} />
            <Total label="Qeyd olunmuş iş günü" value={`${attendanceTotals.days} gün`} tone="#0f766e" />
            <Total label="Cəmi iş saatı" value={`${attendanceTotals.hours.toFixed(1)} saat`} tone="#2563a9" />
          </div>
          <SectionTitle title="Aylıq davamiyyət cədvəli" subtitle={`${norm} iş günü norması üzrə əməkdaş nəticələri`} />
          <Table
            columns={["Əməkdaş", "Şöbə", "İş günü", `Norma (${norm})`, "Saat", "Faiz"]}
            rows={attendanceSummary.map(({ employee, days, hours, rate }) => [
              employee.full_name, employee.department || "—", days, norm, hours.toFixed(1),
              <span key="r" className={[(rate >= 90 ? 'amount-due' : 'amount-positive'),'ui-emphasis'].filter(Boolean).join(' ')}>{rate}%</span>,
            ])}
          />
        </>
      )}

      {tab === "leave" && (
        <>
          <div className={["hr-ops-form","ui-form-grid ui-form-surface"].filter(Boolean).join(' ')} >
            <Field label="Əməkdaş" hint="Sorğunu yaradan şəxs"><Select value={leave.employeeId} onChange={(e) => setLeave({ ...leave, employeeId: e.target.value })} className={"ui-input"}>
              <option value="">Əməkdaş seçin</option>
              {ops.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </Select></Field>
            <Field label="Məzuniyyət növü" hint="Ödəniş qaydasını müəyyən edir"><Select value={leave.kind} onChange={(e) => setLeave({ ...leave, kind: e.target.value })} className={"ui-input"}>
              <option>Əmək məzuniyyəti</option>
              <option>Ödənişsiz</option>
              <option>Xəstəlik</option>
              <option>Təhsil</option>
            </Select></Field>
            <Field label="Başlanğıc tarixi" hint="İlk məzuniyyət günü"><Input type="date" value={leave.startDate} onChange={(e) => setLeave({ ...leave, startDate: e.target.value })} className={"ui-input"} /></Field>
            <Field label="Bitiş tarixi" hint="Son məzuniyyət günü"><Input type="date" min={leave.startDate} value={leave.endDate} onChange={(e) => setLeave({ ...leave, endDate: e.target.value })} className={"ui-input"} /></Field>
            <Button
              disabled={busy || !leave.employeeId}
              className={"ui-button ui-button-primary"}
              onClick={() => guard(() => ops.createEvent({
                employeeId: leave.employeeId,
                eventType: "leave",
                status: "draft",
                startDate: leave.startDate,
                endDate: leave.endDate,
                payload: { kind: leave.kind },
              }))}
            ><Plus size={15} /> Sorğu yarat</Button>
          </div>
          <div className={"ui-stat-grid"}>
            <Total label="Bu ay sorğu" value={`${periodLeaveRows.length} sorğu`} />
            <Total label="Təsdiq gözləyir" value={`${periodLeaveRows.filter((row) => row.status === "draft").length} sorğu`} tone="#b45309" />
            <Total label="Təsdiqlənib" value={`${periodLeaveRows.filter((row) => row.status === "approved").length} sorğu`} tone="#15803d" />
          </div>
          <SectionTitle title="Məzuniyyət sorğuları" subtitle={`${periodLabel(period)} dövrünə aid müraciətlər`} />
          <Table
            columns={["Əməkdaş", "Növ", "Başlanğıc", "Bitiş", "Gün", "Status", ""]}
            rows={periodLeaveRows.map((row) => {
              const employee = ops.employeeMap[row.employee_id];
              const days = row.start_date && row.end_date
                ? Math.round((new Date(row.end_date) - new Date(row.start_date)) / 86400000) + 1
                : 1;
              return [
                employee?.full_name || "—",
                row.payload?.kind || "Məzuniyyət",
                row.start_date || "—",
                row.end_date || "—",
                days,
                <StatusChip key="s" status={row.status} />,
                row.status === "draft" ? (
                  <div key="a" className="u-display-flex u-gap-6px">
                    <Button className={"ui-button ui-button-secondary ui-button-compact"} disabled={busy} onClick={() => guard(() => ops.updateEventStatus(row.id, "approved"))}>Təsdiq</Button>
                    <Button className={["ui-button ui-button-secondary ui-button-compact",'amount-due'].filter(Boolean).join(' ')} disabled={busy} onClick={() => guard(() => ops.updateEventStatus(row.id, "rejected"))}>İmtina</Button>
                  </div>
                ) : "",
              ];
            })}
          />
        </>
      )}

      {tab === "payroll" && (
        <>
          <SectionTitle title="Aylıq əmək haqqı hesablaması" subtitle="Davamiyyət günləri, vergi və məcburi ayırmalar avtomatik hesablanır" />
          <div className={"ui-stat-grid"}>
            <Total label={`Dövr: ${periodLabel(period)}`} value={`${payrollRows.length} əməkdaş`} />
            <Total label="Brutto fond" value={money(payrollTotals.gross)} />
            <Total label="Netto ödəniş" value={money(payrollTotals.net)} tone="#15803d" />
            <Total label="Vergi və ayırmalar" value={money(payrollTotals.tax)} tone="#b45309" />
            <Total label="İşəgötürən xərci" value={money(payrollTotals.cost)} tone="#4338ca" />
          </div>
          <Table
            columns={["Əməkdaş", "Brutto", "Gəlir vergisi", "DSMF", "İşsizlik", "Tibbi", "Netto", ""]}
            rows={payrollRows.map((row) => [
              row.employee.full_name,
              money(row.gross),
              money(row.incomeTax),
              money(row.socialEmployee),
              money(row.unemploymentEmployee),
              money(row.medicalEmployee),
              <strong key="n">{money(row.net)}</strong>,
              row.posted
                ? <span key="p" className="u-color-15803d u-display-inline_flex u-gap-4px u-align-items-center"><CheckCircle2 size={14} /> Bağlanıb</span>
                : <Button
                    key="b"
                    className={"ui-button ui-button-secondary ui-button-compact"}
                    disabled={busy}
                    onClick={() => guard(() => ops.createEvent({
                      employeeId: row.employee.id,
                      eventType: "payroll",
                      status: "approved",
                      startDate: `${period}-01`,
                      amount: row.net,
                      payload: { period, gross: row.gross, incomeTax: row.incomeTax, social: row.socialEmployee, net: row.net },
                    }))}
                  >Bağla</Button>,
            ])}
          />
        </>
      )}
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    draft: { label: "Gözləyir", bg: "#fffbeb", color: "#b45309" },
    approved: { label: "Təsdiqləndi", bg: "#f0fdf4", color: "#15803d" },
    rejected: { label: "İmtina", bg: "#fef2f2", color: "#b91c1c" },
  };
  const tone = map[status] || { label: status, bg: "#f1f5f9", color: "#475569" };
  return <span style={{ background: tone.bg, color: tone.color, padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{tone.label}</span>;
}

function Total({ label, value, tone }) {
  return (
    <div className={"ui-stat-card"}>
      <span className="u-font-size-12px u-color-text_secondary">{label}</span>
      <strong className={['ui-small-value','amount-due'].filter(Boolean).join(' ')}>{value}</strong>
    </div>
  );
}

function Field({ label, hint, children }) {
  return <label className={"ui-field"}><span className={"ui-stat-label"}>{label}</span>{children}<small className={"ui-help-text"}>{hint}</small></label>;
}

function SectionTitle({ title, subtitle }) {
  return <div className={"ui-toolbar"}><div><strong>{title}</strong><span>{subtitle}</span></div></div>;
}

function Table({ columns, rows }) {
  if (!rows.length) return <div className={"ui-empty-box"}>Qeyd yoxdur</div>;
  return (
    <div className="u-overflow-x-auto">
      <Table className={"ui-table"}>
        <thead>
          <tr>{columns.map((column) => <th key={column} className={""}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className={""}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

const S = {
  wrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, display: "grid", gap: 12 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 15, fontWeight: 800, color: "#0f172a" },
  sub: { fontSize: 12, color: "#64748b" },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: { display: "inline-flex", gap: 6, alignItems: "center", padding: "8px 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  tabOn: { background: "#0f172a", color: "#fff", borderColor: "#0f172a" },
  guide: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid #d7e5e1", borderRadius: 8, color: "#0f766e", background: "#f5faf8", flexWrap: "wrap" },
  guideText: { minWidth: 220, display: "grid", flex: 1, gap: 2, color: "#0f172a", fontSize: 13 },
  source: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, color: "#64748b", fontSize: 11 },
  form: { display: "grid", gridTemplateColumns: "minmax(180px,1.2fr) minmax(150px,.8fr) minmax(140px,.7fr) minmax(220px,1.5fr) auto", gap: 10, alignItems: "end", background: "#f8fafc", padding: 14, borderRadius: 8, border: "1px solid #e5e7eb" },
  field: { minWidth: 0, display: "grid", gap: 5 },
  fieldLabel: { color: "#334155", fontSize: 12, fontWeight: 700 },
  fieldHint: { minHeight: 14, color: "#94a3b8", fontSize: 10 },
  input: { width: "100%", minWidth: 0, height: 40, boxSizing: "border-box", padding: "8px 10px", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff" },
  unitInput: { position: "relative" },
  unit: { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#64748b", fontSize: 11, pointerEvents: "none" },
  primary: { minHeight: 40, display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "center", padding: "8px 14px", borderRadius: 7, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap", marginBottom: 19 },
  mini: { padding: "5px 10px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  totals: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 },
  total: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, display: "grid", gap: 3 },
  sectionTitle: { display: "flex", justifyContent: "space-between", alignItems: "end", paddingTop: 3 },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 },
  ok: { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: 10, borderRadius: 8, fontSize: 13 },
  err: { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 10, borderRadius: 8, fontSize: 13 },
  loading: { background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", padding: 10, borderRadius: 8, fontSize: 13 },
};

