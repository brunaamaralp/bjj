import React, { useMemo } from 'react';
import ReportDataTable from '../reports/shared/ReportDataTable.jsx';
import { formatBRL } from '../../lib/moneyBr.js';
import { CLOSING_STATUS_PAID } from '../../../lib/professorClosing.js';

function roleLabel(role) {
  if (role === 'instructor') return 'Instrutor';
  return 'Professor';
}

function statusBadge(status) {
  const paid = String(status || '').toLowerCase() === CLOSING_STATUS_PAID;
  return (
    <span className={`professores-status professores-status--${paid ? 'pago' : 'aberto'}`}>
      {paid ? 'Pago' : 'Aberto'}
    </span>
  );
}

/**
 * Hub mensal: seletor de mês + tabela de fechamentos.
 */
export default function ProfessoresHub({
  month,
  onMonthChange,
  rows = [],
  loading = false,
  selectedStaffRef = '',
  onSelectStaff,
  toolbarExtra = null,
}) {
  const columns = useMemo(
    () => [
      { key: 'name', label: 'Nome', render: (r) => r.name || r.staff_ref },
      { key: 'role', label: 'Papel', render: (r) => roleLabel(r.role) },
      {
        key: 'lessons',
        label: 'Aulas',
        align: 'right',
        render: (r) => r.counts?.lessons ?? 0,
      },
      {
        key: 'experimentals',
        label: 'Experimentais',
        align: 'right',
        render: (r) => r.counts?.experimentals ?? 0,
      },
      {
        key: 'withdrawals',
        label: 'Retiradas',
        align: 'right',
        render: (r) => r.counts?.withdrawals ?? 0,
      },
      {
        key: 'credits',
        label: 'Créditos',
        align: 'right',
        render: (r) =>
          formatBRL(
            (Number(r.amounts?.credits_lessons) || 0) +
              (Number(r.amounts?.credits_experimental) || 0)
          ),
      },
      {
        key: 'debits',
        label: 'Débitos',
        align: 'right',
        render: (r) => formatBRL(r.amounts?.debits_products),
      },
      {
        key: 'net',
        label: 'Líquido',
        align: 'right',
        render: (r) => formatBRL(r.amounts?.net),
      },
      {
        key: 'status',
        label: 'Status',
        align: 'center',
        render: (r) => statusBadge(r.status),
      },
    ],
    []
  );

  return (
    <section className="professores-hub" aria-label="Fechamento do mês">
      <div className="professores-toolbar">
        <div className="professores-toolbar__month">
          <label htmlFor="professores-month">Mês</label>
          <input
            id="professores-month"
            type="month"
            className="form-input"
            value={month || ''}
            onChange={(e) => onMonthChange?.(e.target.value)}
          />
        </div>
        {toolbarExtra ? <div className="professores-toolbar__actions">{toolbarExtra}</div> : null}
      </div>

      <ReportDataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="Nenhum professor ou instrutor com movimento neste mês."
        striped
        stickyHeader
        onRowClick={(row) => onSelectStaff?.(row.staff_ref)}
        getRowClassName={(row) =>
          String(row.staff_ref) === String(selectedStaffRef)
            ? 'report-data-table__row--selected'
            : ''
        }
      />
    </section>
  );
}
