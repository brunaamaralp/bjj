import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import { PAYABLES_SECTIONS, buildPayablesPath } from '../../lib/financeiroPayablesSections.js';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDateBr(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export default function PayablesOverviewCard({
  summary,
  topItems = [],
  failed = false,
  loading = false,
}) {
  const totalOpen = summary?.totalOpen ?? null;
  const overdueCount = summary?.overdueCount ?? 0;
  const dueSoonCount = summary?.dueSoonCount ?? 0;

  return (
    <section className="card financeiro-overview-card financeiro-overview-card--payables">
      <p className="navi-eyebrow financeiro-overview-card__eyebrow">Despesas · consolidado</p>
      <h2 className="navi-section-heading financeiro-overview-card__title">
        <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.aPagar}>A pagar</FinanceLabelWithHint>
      </h2>
      <div className="financeiro-overview-card__body">
        {failed ? (
          <ErrorBanner
            message="Não foi possível carregar o total a pagar."
            className="financeiro-overview-card__error"
          />
        ) : null}
        <div className="financeiro-overview-hero financeiro-overview-hero--compact">
          <div>
            <p className="financeiro-overview-hero__label">Total em aberto (90 dias)</p>
            <p className="financeiro-overview-hero__value financeiro-overview-hero__value--md finance-value-negative">
              {failed || loading ? '—' : fmtMoney(totalOpen)}
            </p>
          </div>
        </div>
        {!failed ? (
          <div className="financeiro-overview-metrics receivables-overview-breakdown">
            <div className="financeiro-overview-metric">
              <span className="financeiro-overview-metric__label">Vencidas</span>
              <span className="financeiro-overview-metric__value">
                {loading ? '—' : `${overdueCount} · ${fmtMoney(summary?.overdueAmount || 0)}`}
              </span>
            </div>
            <div className="financeiro-overview-metric">
              <span className="financeiro-overview-metric__label">Vence em 7 dias</span>
              <span className="financeiro-overview-metric__value">
                {loading ? '—' : `${dueSoonCount} · ${fmtMoney(summary?.dueSoonAmount || 0)}`}
              </span>
            </div>
          </div>
        ) : null}
        {!failed && topItems.length > 0 ? (
          <ul className="financeiro-overview-list">
            {topItems.map((item) => (
              <li key={item.id}>
                <span className="financeiro-overview-list__label">{item.vendor_label || item.label}</span>
                <span className="financeiro-overview-list__meta">
                  {fmtDateBr(item.due_date)} · {fmtMoney(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : !failed && !loading ? (
          <p className="text-small text-muted">
            {totalOpen > 0
              ? 'Nenhuma conta com vencimento nos próximos dias.'
              : 'Nenhuma conta a pagar em aberto.'}
          </p>
        ) : null}
        <Link
          to={buildPayablesPath({
            section:
              overdueCount > 0 ? PAYABLES_SECTIONS.VENCIDAS : PAYABLES_SECTIONS.CONTAS_FIXAS,
          })}
          className="btn-primary btn-sm financeiro-overview-cta"
        >
          Ver tudo a pagar <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
