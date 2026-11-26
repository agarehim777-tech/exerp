// Typed ports of the former components/ui.jsx widgets. Markup and class names are identical
// (metric-card, panel, panel-header, status, two-line, ...) so existing CSS and E2E selectors keep working.
import { Filter } from 'lucide-react';
import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import SharedDataTable, { type DataTableProps, type TableColumn } from './DataTable.tsx';

type IconComponent = ComponentType<{ size?: number | string }>;

export interface MetricCardProps {
  label?: ReactNode; value?: ReactNode; trend?: ReactNode; icon: IconComponent;
  tone?: string; onClick?: () => void; title?: string;
}
export function MetricCard({ label, value, trend, icon: Icon, tone = 'primary', onClick, title }: MetricCardProps) {
  return (
    <article
      className={`metric-card${onClick ? ' metric-card-clickable' : ''}`}
      onClick={onClick}
      onKeyDown={onClick ? event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); }
      } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={title}
    >
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {trend && <small>{trend}</small>}
      </div>
      <div className={`metric-icon ${tone}`}><Icon size={20} /></div>
    </article>
  );
}

export function Panel({ children, className = '', ...props }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
  return <section className={`panel ${className}`} {...props}>{children}</section>;
}

export function PanelHeader({ title, subtitle, icon: Icon }: { title?: ReactNode; subtitle?: ReactNode; icon?: IconComponent }) {
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

const numericLabels = /məbləğ|qiymət|maaş|borc|qalıq|ödəni|gəlir|xərc|cəmi|ümumi|say|ədəd|faiz|kpi|aylıq|netto|brutto|vergi|dsmf|işsizlik|tibbi|stok|rezerv|norma|saat|gün/i;

export type SimpleColumn = ReactNode | Omit<TableColumn, 'key'>;
export interface SimpleTableProps extends Omit<DataTableProps<ReactNode[]>, 'columns' | 'rows' | 'onRowClick' | 'renderCell'> {
  columns: SimpleColumn[];
  rows: ReactNode[][];
  onRowClick?: (index: number) => void;
}

const isColumnConfig = (column: SimpleColumn): column is Omit<TableColumn, 'key'> =>
  typeof column === 'object' && column !== null && !Array.isArray(column) && 'label' in column && !('$$typeof' in column);

/** Positional table: each row is an array of cells, columns are labels (numeric labels align right). */
export function SimpleTable({ columns, rows, onRowClick, emptyText = "Axtarışa uyğun məlumat tapılmadı", ...props }: SimpleTableProps) {
  const normalized = columns.map((column, index): TableColumn => {
    if (isColumnConfig(column)) return { ...column, key: index };
    const label = column as ReactNode;
    return { key: index, label, align: numericLabels.test(String(label)) ? 'right' : 'left' };
  });
  return <SharedDataTable<ReactNode[]> {...props} columns={normalized} rows={rows}
    emptyText={emptyText}
    renderCell={(row, column) => row[Number(column.key)]}
    onRowClick={onRowClick ? (_row, index) => onRowClick(index) : undefined} />;
}

const normalizeText = (value: unknown) => String(value ?? '').toLocaleLowerCase('az-AZ');

export function statusClass(status: unknown): 'ok' | 'warning' | 'danger' | 'info' | 'neutral' {
  const text = normalizeText(status);
  const has = (...words: string[]) => words.some(word => text.includes(word));
  if (has('çatışmazlıq', 'backorder', 'qismən təhvil')) return 'warning';
  if (has('yüksək roi')) return 'ok';
  if (has('büdcə aşımı')) return 'danger';
  if (has('kritik', 'bloker', 'yüksək')) return 'danger';
  if (has('verilməyib')) return 'danger';
  if (has('qismən sifarişdə')) return 'warning';
  if (has('sifariş verilib')) return 'ok';
  if (has('xəbərdarlıq', 'nəzarət', 'hazırlanır', 'orta')) return 'warning';
  if (has('sağlam', 'test ok', 'hazır', 'aşağı')) return 'ok';
  if (has('ödənilib', 'ödənildi', 'tamam')) return 'ok';
  if (has('yenilənməlidir', 'sənəd gözləyir')) return 'warning';
  if (has('kredit satış')) return 'warning';
  if (has('istehsal edildi', 'xammal çıxıldı', 'çıxışa hazır')) return 'ok';
  if (has('təsdiq edildi', 'aktiv', 'platin', 'canlı')) return 'ok';
  if (has('təhvil verilib', 'imzalanıb', 'tamamlandı')) return 'ok';
  if (has('gecik', 'imtina', 'çatmir', 'çatmır', 'aşağı', 'sürücü yoxdur')) return 'danger';
  if (has('gözləyir', 'hazır', 'risk', 'prioritet', 'yaxınlaşır')) return 'warning';
  if (has('yoldadır', 'push', 'sms', 'planlı', 'baza')) return 'info';
  return 'neutral';
}

export function StatusBadge({ status }: { status?: ReactNode }) {
  return <span className={`status ${statusClass(status)}`}>{status}</span>;
}

export function TwoLine({ title, subtitle }: { title?: ReactNode; subtitle?: ReactNode }) {
  return <div className="two-line"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>;
}

export function AvatarLine({ initials, title, subtitle }: { initials?: ReactNode; title?: ReactNode; subtitle?: ReactNode }) {
  return <div className="avatar-line"><span className="small-avatar">{initials}</span><TwoLine title={title} subtitle={subtitle} /></div>;
}

export function ProgressRow({ label, value, caption, compact = false }: { label?: string; value: number; caption?: string; compact?: boolean }) {
  const bounded = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`progress-row ${compact ? 'compact' : ''}`}>
      {label && <div className="progress-meta"><span>{label}</span>{caption && <small>{caption}</small>}</div>}
      <progress className="progress-track" value={bounded} max="100" aria-label={label || caption || 'Progress'} />
    </div>
  );
}

export function EmptyState({ title }: { title?: ReactNode }) {
  return <div className="empty-state"><Filter size={20} /><span>{title}</span></div>;
}

export function TextField({ label, value, onChange, full = false, disabled = false }: { label?: ReactNode; value?: string | number; onChange: (value: string) => void; full?: boolean; disabled?: boolean }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      <input value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
    </label>
  );
}
