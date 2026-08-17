import { Filter } from "lucide-react";

function normalizeText(value) {
  return String(value ?? "").toLocaleLowerCase("az-AZ");
}

export function MetricCard({ label, value, trend, icon: Icon, tone = "primary", onClick, title }) {
  return (
    <article
      className={`metric-card${onClick ? " metric-card-clickable" : ""}`}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
    >
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {trend && <small>{trend}</small>}
      </div>
      <div className={`metric-icon ${tone}`}>
        <Icon size={20} />
      </div>
    </article>
  );
}

export function Panel({ children, className = "", ...props }) {
  return (
    <section className={`panel ${className}`} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, subtitle, icon: Icon }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {Icon && <Icon size={18} />}
    </div>
  );
}

export function DataTable({ columns, rows, onRowClick }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} onClick={() => onRowClick?.(rowIndex)} style={onRowClick ? { cursor: "pointer" } : undefined}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <EmptyState title="Axtarışa uyğun məlumat tapılmadı" />}
    </div>
  );
}

export function StatusBadge({ status }) {
  const className = `status ${statusClass(status)}`;
  return <span className={className}>{status}</span>;
}

function statusClass(status) {
  const text = normalizeText(status);
  if (text.includes("çatışmazlıq") || text.includes("backorder") || text.includes("qismən təhvil")) return "warning";
  if (text.includes("yüksək roi")) return "ok";
  if (text.includes("büdcə aşımı")) return "danger";
  if (text.includes("kritik") || text.includes("bloker") || text.includes("yüksək")) return "danger";
  if (text.includes("verilməyib")) return "danger";
  if (text.includes("qismən sifarişdə")) return "warning";
  if (text.includes("sifariş verilib")) return "ok";
  if (text.includes("xəbərdarlıq") || text.includes("nəzarət") || text.includes("hazırlanır") || text.includes("orta")) return "warning";
  if (text.includes("sağlam") || text.includes("test ok") || text.includes("hazır") || text.includes("aşağı")) return "ok";
  if (text.includes("ödənilib") || text.includes("ödənildi") || text.includes("tamam")) return "ok";
  if (text.includes("yenilənməlidir") || text.includes("sənəd gözləyir")) return "warning";
  if (text.includes("kredit satış")) return "warning";
  if (text.includes("istehsal edildi") || text.includes("xammal çıxıldı") || text.includes("çıxışa hazır")) return "ok";
  if (text.includes("təsdiq edildi") || text.includes("aktiv") || text.includes("platin") || text.includes("canlı")) return "ok";
  if (text.includes("təhvil verilib") || text.includes("imzalanıb") || text.includes("tamamlandı")) return "ok";
  if (text.includes("gecik") || text.includes("imtina") || text.includes("çatmir") || text.includes("çatmır") || text.includes("aşağı") || text.includes("sürücü yoxdur")) return "danger";
  if (text.includes("gözləyir") || text.includes("hazır") || text.includes("risk") || text.includes("prioritet") || text.includes("yaxınlaşır")) return "warning";
  if (text.includes("yoldadır") || text.includes("push") || text.includes("sms") || text.includes("planlı") || text.includes("baza")) return "info";
  return "neutral";
}

export function TwoLine({ title, subtitle }) {
  return (
    <div className="two-line">
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}

export function AvatarLine({ initials, title, subtitle }) {
  return (
    <div className="avatar-line">
      <span className="small-avatar">{initials}</span>
      <TwoLine title={title} subtitle={subtitle} />
    </div>
  );
}

export function ProgressRow({ label, value, caption, compact = false }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress-row ${compact ? "compact" : ""}`}>
      {label && (
        <div className="progress-meta">
          <span>{label}</span>
          {caption && <small>{caption}</small>}
        </div>
      )}
      <progress className="progress-track" value={bounded} max="100" aria-label={label || caption || "Progress"} />
    </div>
  );
}

export function EmptyState({ title }) {
  return (
    <div className="empty-state">
      <Filter size={20} />
      <span>{title}</span>
    </div>
  );
}

export function Field({ label, value, onChange, full = false, disabled = false }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
