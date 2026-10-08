import React, { useMemo } from 'react';
import { CADASTRO_CELL } from '../../lib/payablesCadastro.js';
import { formatPayableCategoryLabel } from '../../lib/payablesCategoryDisplay.js';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDateBr(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function cellTitle(cell) {
  if (!cell || cell.state === CADASTRO_CELL.EMPTY) return 'Sem registro neste mês';
  const parts = [cell.label];
  if (cell.amount > 0) parts.push(fmtMoney(cell.amount));
  if (cell.state === CADASTRO_CELL.PAID && cell.settled_at) {
    parts.push(`pago em ${fmtDateBr(String(cell.settled_at).slice(0, 10))}`);
  } else if (cell.due_date) {
    parts.push(`venc. ${fmtDateBr(cell.due_date)}`);
  }
  return parts.join(' · ');
}

/**
 * Grade consultiva: contas fixas ativas × meses.
 */
export default function PayablesCadastroPanel({
  cadastro,
  chartAccounts = [],
  search = '',
  categoryFilter = '',
}) {
  const months = cadastro?.monthLabels || [];
  const rows = useMemo(() => {
    let list = cadastro?.rows || [];
    const q = String(search || '').trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const blob = `${r.vendor_label} ${r.category}`.toLowerCase();
        return blob.includes(q);
      });
    }
    const cat = String(categoryFilter || '').trim();
    if (cat) {
      list = list.filter((r) => {
        const raw = String(r.category || '').trim();
        if (raw === cat) return true;
        return (
          formatPayableCategoryLabel(raw, chartAccounts) ===
          formatPayableCategoryLabel(cat, chartAccounts)
        );
      });
    }
    return list;
  }, [cadastro?.rows, search, categoryFilter, chartAccounts]);

  if (!rows.length) {
    return (
      <p className="text-small text-muted">Nenhum resultado para a busca ou filtro atual.</p>
    );
  }

  return (
    <div className="payables-cadastro">
      <div
        className="finance-table-wrap payables-cadastro__wrap"
        role="region"
        aria-label="Cadastro de contas fixas"
      >
        <table className="finance-table payables-cadastro__table">
          <thead>
            <tr>
              <th className="payables-cadastro__sticky">Conta</th>
              <th className="finance-num payables-cadastro__amount-col">Valor</th>
              {months.map((m) => (
                <th key={m.ym} className="payables-cadastro__month" title={m.ym}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.template_id}>
                <td className="payables-cadastro__sticky">
                  <div className="payables-cadastro__account">
                    <span className="payables-cadastro__vendor">{row.vendor_label}</span>
                    <span className="payables-cadastro__meta">
                      {formatPayableCategoryLabel(row.category, chartAccounts)}
                      {row.recurrence_day ? ` · dia ${row.recurrence_day}` : ''}
                    </span>
                  </div>
                </td>
                <td className="finance-num payables-cadastro__amount-col">
                  {fmtMoney(row.amount)}
                </td>
                {months.map((m) => {
                  const cell = row.cells?.[m.ym] || { state: CADASTRO_CELL.EMPTY };
                  return (
                    <td
                      key={m.ym}
                      className={`payables-cadastro__cell payables-cadastro__cell--${cell.state}`}
                      title={cellTitle(cell)}
                    >
                      <span
                        className="payables-cadastro__dot"
                        aria-label={cellTitle(cell)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="payables-cadastro__legend" aria-label="Legenda">
        <li>
          <span className="payables-cadastro__dot payables-cadastro__cell--paid" aria-hidden />
          Pago
        </li>
        <li>
          <span className="payables-cadastro__dot payables-cadastro__cell--open" aria-hidden />
          Em aberto
        </li>
        <li>
          <span className="payables-cadastro__dot payables-cadastro__cell--overdue" aria-hidden />
          Vencido
        </li>
        <li>
          <span className="payables-cadastro__dot payables-cadastro__cell--empty" aria-hidden />
          Sem registro
        </li>
      </ul>
    </div>
  );
}
