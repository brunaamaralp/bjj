import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Clock } from 'lucide-react';
import StatusBanner from '../shared/StatusBanner.jsx';

function fmtClosedAt(iso) {
  const d = new Date(String(iso || ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function closingPath(referenceMonth) {
  const ym = String(referenceMonth || '').trim();
  return `/financeiro?tab=fechamento&month=${encodeURIComponent(ym)}`;
}

/**
 * Handoff pós-conciliação → revisar fechamento mensal.
 * @param {{
 *   closingHints: { months: Array<{ reference_month: string, month_label: string, is_conferred: boolean, closed_at?: string }>, all_conferred: boolean } | null,
 *   statementStatus?: string,
 *   dismissed?: boolean,
 *   onDismiss?: () => void,
 * }} props
 */
export default function BankReconClosingHandoffCard({
  closingHints,
  statementStatus = '',
  dismissed = false,
  onDismiss,
}) {
  const months = closingHints?.months || [];
  const showPartialWarning = String(statementStatus || '').toLowerCase() === 'partial';

  const pendingMonths = useMemo(
    () => months.filter((row) => !row.is_conferred),
    [months]
  );

  if (dismissed || !months.length) return null;

  const allConferred = Boolean(closingHints?.all_conferred);

  return (
    <section className="card mt-4 bank-recon-closing-handoff" aria-label="Próximo passo: fechamento mensal">
      <h4 className="finance-tab__section-title bank-recon-closing-handoff__title">
        {allConferred ? 'Fechamento mensal' : 'Próximo passo: fechamento mensal'}
      </h4>

      {showPartialWarning ? (
        <StatusBanner variant="warning" className="bank-recon-closing-handoff__banner">
          Conciliação finalizada com pendências no extrato. Você ainda pode revisar o fechamento interno do mês.
        </StatusBanner>
      ) : null}

      <ul className="bank-recon-closing-handoff__list">
        {months.map((row) => {
          const closedLabel = fmtClosedAt(row.closed_at);
          return (
            <li key={row.reference_month} className="bank-recon-closing-handoff__item">
              <div className="bank-recon-closing-handoff__item-head">
                {row.is_conferred ? (
                  <CheckCircle size={16} className="bank-recon-closing-handoff__icon--ok" aria-hidden />
                ) : (
                  <Clock size={16} className="bank-recon-closing-handoff__icon--pending" aria-hidden />
                )}
                <span className="bank-recon-closing-handoff__month">{row.month_label || row.reference_month}</span>
              </div>
              {row.is_conferred ? (
                <p className="text-small text-muted bank-recon-closing-handoff__meta">
                  Conferido{closedLabel ? ` em ${closedLabel}` : ''}.
                </p>
              ) : (
                <p className="text-small text-muted bank-recon-closing-handoff__meta">
                  Revisão interna pendente — mensalidades, vendas e lançamentos do mês.
                </p>
              )}
              <Link
                to={closingPath(row.reference_month)}
                className={
                  row.is_conferred
                    ? 'btn-outline btn-sm bank-recon-closing-handoff__cta'
                    : 'btn-secondary btn-sm bank-recon-closing-handoff__cta'
                }
              >
                {row.is_conferred ? 'Ver fechamento' : 'Revisar fechamento'}
                <ArrowRight size={14} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>

      {!allConferred && pendingMonths.length > 0 ? (
        <p className="text-small text-muted bank-recon-closing-handoff__hint">
          O fechamento mensal registra que você revisou os totais internos do período — é independente do extrato
          bancário.
        </p>
      ) : null}

      {typeof onDismiss === 'function' ? (
        <button
          type="button"
          className="btn-text btn-sm p-0 bank-recon-closing-handoff__dismiss"
          onClick={onDismiss}
        >
          Agora não
        </button>
      ) : null}
    </section>
  );
}
