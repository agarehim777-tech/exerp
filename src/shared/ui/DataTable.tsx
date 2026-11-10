import { isValidElement } from 'react';
import type { CSSProperties, Key, MouseEvent, ReactNode } from 'react';

export interface TableColumn {
  key: string | number;
  label: ReactNode;
  align?: 'left' | 'right';
  nowrap?: boolean;
  mobileHidden?: boolean;
  sticky?: boolean;
  minWidth?: CSSProperties['minWidth'];
}

export interface DataTableProps<Row extends object> {
  columns?: TableColumn[];
  rows?: Row[];
  renderCell?: (row: Row, column: TableColumn, index: number) => ReactNode;
  emptyText?: ReactNode;
  rowKey?: (row: Row, index: number) => Key;
  footer?: ReactNode;
  className?: string;
  tableClassName?: string;
  onRowClick?: (row: Row, index: number) => void;
  label?: string;
}

const cellClass = (column: TableColumn) => [
  column.align === 'right' && 'is-numeric', column.nowrap && 'is-nowrap',
  column.mobileHidden && 'mobile-hidden', column.sticky && 'is-sticky',
].filter(Boolean).join(' ');

function cellValue(row: object, key: string | number): ReactNode {
  const value: unknown = Reflect.get(row, key);
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'string' || typeof value === 'number' || isValidElement(value)) return value;
  return null;
}

export default function DataTable<Row extends object>({ columns = [], rows = [], renderCell, emptyText = 'Məlumat tapılmadı', rowKey, footer, className = '', tableClassName = '', onRowClick, label = 'Məlumat cədvəli' }: DataTableProps<Row>) {
  const activateRow = (event: MouseEvent<HTMLTableRowElement>, row: Row, index: number) => {
    if (event.target instanceof Element && event.target.closest('a,button,input,select,textarea')) return;
    onRowClick?.(row, index);
  };
  return <div className={`table-wrap ui-table-wrap ${className}`} role="region" aria-label={label} tabIndex={0}>
    <table className={`ui-table ${tableClassName}`}>
      <thead><tr>{columns.map(column => <th key={column.key} scope="col" className={cellClass(column)} style={column.minWidth ? { minWidth: column.minWidth } : undefined}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => {
        const id: unknown = Reflect.get(row, 'id');
        const key = rowKey ? rowKey(row, index) : typeof id === 'string' || typeof id === 'number' ? id : index;
        return <tr key={key} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? event => activateRow(event, row, index) : undefined} onKeyDown={onRowClick ? event => {
          if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
            event.preventDefault(); onRowClick(row, index);
          }
        } : undefined} className={onRowClick ? 'ui-table-row-action' : undefined}>
          {columns.map(column => <td key={column.key} className={cellClass(column)}>{renderCell ? renderCell(row, column, index) : cellValue(row, column.key)}</td>)}
        </tr>;
      })}{!rows.length && <tr><td colSpan={Math.max(1, columns.length)} className="ui-table-empty">{emptyText}</td></tr>}</tbody>
      {footer}
    </table>
  </div>;
}