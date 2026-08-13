import React, { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, Clock, Plus, Wallet } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useHrOperations } from "../../shared/hooks/useHrOperations.js";
import { calcPayroll, periodLabel, workDaysInMonth } from "./payroll.js";

const TABS = [
  { id: "attendance", label: "Davamiyyət", icon: Clock },
  { id: "leave", label: "Məzuniyyət", icon: CalendarCheck },
  { id: "payroll", label: "Əmək haqqı", icon: Wallet },
];

const money = (value) => `${Number(value || 0).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const currentPeriod = () => new Date().toISOString().slice(0, 7);

export default function HrOperationsPanel() {
  const { activeTenantId } = useAuth();
  const ops = useHrOperations(activeTenantId);
  const [tab, setTab] = useState("attendance");
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

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div>
          <div style={S.title}>HR əməliyyatları</div>
          <div style={S.sub}>Davamiyyət, məzuniyyət və əmək haqqı — real bazadan (employee_events)</div>
        </div>
        <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} style={S.input} />
      </div>

      <div style={S.tabs}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...S.tab, ...(tab === id ? S.tabOn : {}) }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {message && <div style={message.tone === "ok" ? S.ok : S.err}>{message.text}</div>}
      {ops.error && <div style={S.err}>{ops.error.message}</div>}

      {tab === "attendance" && (
        <>
          <div style={S.form}>
            <select value={attendance.employeeId} onChange={(e) => setAttendance({ ...attendance, employeeId: e.target.value })} style={S.input}>
              <option value="">Əməkdaş seçin</option>
              {ops.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </select>
            <input type="date" value={attendance.date} onChange={(e) => setAttendance({ ...attendance, date: e.target.value })} style={S.input} />
            <input type="number" min="0" max="24" step="0.5" value={attendance.hours} onChange={(e) => setAttendance({ ...attendance, hours: e.target.value })} style={S.input} placeholder="Saat" />
            <input value={attendance.note} onChange={(e) => setAttendance({ ...attendance, note: e.target.value })} style={{ ...S.input, flex: 1 }} placeholder="Qeyd" />
            <button
              disabled={busy || !attendance.employeeId}
              style={S.primary}
              onClick={() => guard(() => ops.createEvent({
                employeeId: attendance.employeeId,
                eventType: "attendance",
                status: "approved",
                startDate: attendance.date,
                amount: Number(attendance.hours || 0),
                payload: { hours: Number(attendance.hours || 0), note: attendance.note },
              }))}
            ><Plus size={15} /> Qeyd et</button>
          </div>
          <Table
            columns={["Əməkdaş", "Şöbə", "İş günü", `Norma (${norm})`, "Saat", "Faiz"]}
            rows={attendanceSummary.map(({ employee, days, hours, rate }) => [
              employee.full_name, employee.department || "—", days, norm, hours.toFixed(1),
              <span key="r" style={{ color: rate >= 90 ? "#15803d" : rate >= 60 ? "#b45309" : "#b91c1c", fontWeight: 700 }}>{rate}%</span>,
            ])}
          />
        </>
      )}

      {tab === "leave" && (
        <>
          <div style={S.form}>
            <select value={leave.employeeId} onChange={(e) => setLeave({ ...leave, employeeId: e.target.value })} style={S.input}>
              <option value="">Əməkdaş seçin</option>
              {ops.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </select>
            <select value={leave.kind} onChange={(e) => setLeave({ ...leave, kind: e.target.value })} style={S.input}>
              <option>Əmək məzuniyyəti</option>
              <option>Ödənişsiz</option>
              <option>Xəstəlik</option>
              <option>Təhsil</option>
            </select>
            <input type="date" value={leave.startDate} onChange={(e) => setLeave({ ...leave, startDate: e.target.value })} style={S.input} />
            <input type="date" value={leave.endDate} onChange={(e) => setLeave({ ...leave, endDate: e.target.value })} style={S.input} />
            <button
              disabled={busy || !leave.employeeId}
              style={S.primary}
              onClick={() => guard(() => ops.createEvent({
                employeeId: leave.employeeId,
                eventType: "leave",
                status: "draft",
                startDate: leave.startDate,
                endDate: leave.endDate,
                payload: { kind: leave.kind },
              }))}
            ><Plus size={15} /> Sorğu yarat</button>
          </div>
          <Table
            columns={["Əməkdaş", "Növ", "Başlanğıc", "Bitiş", "Gün", "Status", ""]}
            rows={ops.byType.leave.map((row) => {
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
                  <div key="a" style={{ display: "flex", gap: 6 }}>
                    <button style={S.mini} disabled={busy} onClick={() => guard(() => ops.updateEventStatus(row.id, "approved"))}>Təsdiq</button>
                    <button style={{ ...S.mini, color: "#b91c1c" }} disabled={busy} onClick={() => guard(() => ops.updateEventStatus(row.id, "rejected"))}>İmtina</button>
                  </div>
                ) : "",
              ];
            })}
          />
        </>
      )}

      {tab === "payroll" && (
        <>
          <div style={S.totals}>
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
                ? <span key="p" style={{ color: "#15803d", display: "inline-flex", gap: 4, alignItems: "center" }}><CheckCircle2 size={14} /> Bağlanıb</span>
                : <button
                    key="b"
                    style={S.mini}
                    disabled={busy}
                    onClick={() => guard(() => ops.createEvent({
                      employeeId: row.employee.id,
                      eventType: "payroll",
                      status: "approved",
                      startDate: `${period}-01`,
                      amount: row.net,
                      payload: { period, gross: row.gross, incomeTax: row.incomeTax, social: row.socialEmployee, net: row.net },
                    }))}
                  >Bağla</button>,
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
    <div style={S.total}>
      <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
      <strong style={{ fontSize: 16, color: tone || "#0f172a" }}>{value}</strong>
    </div>
  );
}

function Table({ columns, rows }) {
  if (!rows.length) return <div style={S.empty}>Qeyd yoxdur</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={S.table}>
        <thead>
          <tr>{columns.map((column) => <th key={column} style={S.th}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} style={S.td}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
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
  form: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#f8fafc", padding: 10, borderRadius: 10 },
  input: { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff" },
  primary: { display: "inline-flex", gap: 6, alignItems: "center", padding: "8px 14px", borderRadius: 8, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 },
  mini: { padding: "5px 10px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  totals: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 },
  total: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, display: "grid", gap: 3 },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 },
  ok: { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: 10, borderRadius: 8, fontSize: 13 },
  err: { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 10, borderRadius: 8, fontSize: 13 },
};
