import React from 'react';
import { Inbox } from 'lucide-react';

const SKELETON_ROWS = 5;

function cellAlignClass(align) {
  if (align === 'right') return 'report-data-table__align-right';
  if (align === 'center') return 'report-data-table__align-center';
  return '';
}

/**
 * Tabela padronizada para painéis de Relatórios.
 *
 * @param {object} props
 * @param {Array<{ key: string, label: string, align?: string, width?: string, render?: (row: object) => React.ReactNode }>} props.columns
 * @param {Array<object>} props.rows
 * @param {string} props.emptyMessage
 * @param {boolean} [props.loading]
 * @param {(row: object, index: number) => void} [props.onRowClick]
 * @param {(row: object, index: number) => string} [props.getRowClassName]
 * @param {boolean} [props.striped]
 * @param {boolean} [props.stickyHeader]
 * @param {React.ReactNode} [props.footer]
 * @param {string} [props.className]
 * @param {string} [props.wrapClassName]
 * @param {(ctx: { rows: object[], columns: object[] }) => React.ReactNode} [props.renderBody]
 */
export default function ReportDataTable({
  columns = [],
  rows = [],
  emptyMessage = 'Nenhum registro encontrado.',
  loading = false,
  onRowClick = null,
  getRowClassName = null,
  striped = true,
  stickyHeader = false,
  footer = null,
  className = '',
  wrapClassName = '',
  scrollRef = null,
  renderBody = null,
}) {
  const wrapClasses = [
    'report-data-table-wrap',
    stickyHeader ? 'report-data-table-wrap--sticky' : '',
    wrapClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const tableClasses = ['report-data-table', striped ? 'report-data-table--striped' : '', className]
    .filter(Boolean)
    .join(' ');

  const renderCell = (row, col) => {
    if (typeof col.render === 'function') return col.render(row);
    return row[col.key] ?? '—';
  };

  const defaultBody = () =>
    rows.map((row, index) => {
      const clickable = typeof onRowClick === 'function';
      const extraClass = getRowClassName ? getRowClassName(row, index) : '';
      return (
        <tr
          key={row.id ?? row.$id ?? row.move_id ?? row.sale_id ?? `${index}`}
          className={[clickable ? 'report-data-table__row--clickable' : '', extraClass].filter(Boolean).join(' ')}
          onClick={clickable ? () => onRowClick(row, index) : undefined}
        >
          {columns.map((col) => (
            <td key={col.key} className={cellAlignClass(col.align)} style={col.width ? { width: col.width } : undefined}>
              {renderCell(row, col)}
            </td>
          ))}
        </tr>
      );
    });

  return (
    <div ref={scrollRef} className={wrapClasses}>
      <table className={tableClasses}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cellAlignClass(col.align)}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <tr key={`sk-${i}`} className="report-data-table__skeleton-row" aria-hidden>
                {columns.map((col) => (
                  <td key={col.key}>
                    <div className="report-data-table__skeleton-cell" />
                  </td>
                ))}
              </tr>
            ))
          ) : renderBody ? (
            renderBody({ rows, columns })
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)} className="report-data-table__empty">
                <div className="report-data-table__empty-icon" aria-hidden>
                  <Inbox size={28} strokeWidth={1.5} />
                </div>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            defaultBody()
          )}
        </tbody>
      </table>
      {footer ? <div className="report-data-table__footer">{footer}</div> : null}
    </div>
  );
}
