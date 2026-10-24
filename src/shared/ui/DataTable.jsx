import React from 'react';

const cellClass = column => [
  column.align === 'right' && 'is-numeric',
  column.nowrap && 'is-nowrap',
  column.mobileHidden && 'mobile-hidden',
  column.sticky && 'is-sticky',
].filter(Boolean).join(' ');

export default function DataTable({ columns = [], rows = [], renderCell, emptyText = 'Məlumat tapılmadı', rowKey, footer, className = '', tableClassName = '', onRowClick, label = 'Məlumat cədvəli' }) {
  const activateRow = (event, row, index) => {
    if (event.target.closest('a,button,input,select,textarea')) return;
    onRowClick?.(row, index);
  };
  return (
    <div className={`table-wrap ui-table-wrap ${className}`} role="region" aria-label={label} tabIndex={0}>
      <table className={`ui-table ${tableClassName}`}>
        <thead><tr>{columns.map(column => (
          <th key={column.key} scope="col" className={cellClass(column)} style={column.minWidth ? { minWidth: column.minWidth } : undefined}>{column.label}</th>
        ))}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : row?.id ?? index}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? event => activateRow(event, row, index) : undefined}
              onKeyDown={onRowClick ? event => {
                if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault();
                  onRowClick(row, index);
                }
              } : undefined}
              className={onRowClick ? 'ui-table-row-action' : undefined}>
              {columns.map(column => <td key={column.key} className={cellClass(column)}>
                {renderCell ? renderCell(row, column, index) : row?.[column.key]}
              </td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={Math.max(1, columns.length)} className="ui-table-empty">{emptyText}</td></tr>}
        </tbody>
        {footer}
      </table>
    </div>
  );
}
