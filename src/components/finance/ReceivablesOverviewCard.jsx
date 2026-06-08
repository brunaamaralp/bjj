import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import { RECEIVABLE_SOURCE_LABELS } from '../../lib/receivablesAggregate.js';
import { FINANCEIRO_SECTIONS } from '../../lib/financeiroHubTabs.js';
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

export default function ReceivablesOverviewCard({
  summary,
  topItems = [],
  failed = false,
  loading = false,
}) {
  const bySource = summary?.bySource || {};
  const total = summary?.total ?? null;

  return (
    <section className="card financeiro-overview-card financeiro-overview-card--receivables">
      <p className="navi-eyebrow financeiro-overview-card__eyebrow">Cobrança · consolidado</p>
      <h2 className="navi-section-heading financeiro-overview-card__title">
        <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.aReceber}>A receber</FinanceLabelWithHint>
      </h2>
      <div className="financeiro-overview-card__body">
        {failed ? (
          <ErrorBanner
            message="Não foi possível carregar o total a receber."
            className="financeiro-overview-card__error"
          />
        ) : null}
        <div className="financeiro-overview-hero financeiro-overview-hero--compact">
          <div>
            <p className="financeiro-overview-hero__label">Total em aberto</p>
            <p className="financeiro-overview-hero__value financeiro-overview-hero__value--md">
              {failed || loading ? '—' : fmtMoney(total)}
            </p>
          </div>
        </div>
        {!failed ? (
          <div className="financeiro-overview-metrics receivables-overview-breakdown">
            {Object.entries(RECEIVABLE_SOURCE_LABELS).map(([key, label]) => (
              <div key={key} className="financeiro-overview-metric">
                <span className="financeiro-overview-metric__label">{label}</span>
                <span className="financeiro-overview-metric__value">
                  {loading ? '—' : fmtMoney(bySource[key] || 0)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {!failed && topItems.length > 0 ? (
          <ul className="financeiro-overview-list">
            {topItems.map((item) => (
              <li key={item.id}>
                <span className="financeiro-overview-list__label">{item.label}</span>
                <span className="financeiro-overview-list__meta">
                  {item.sourceLabel} · {fmtDateBr(item.due_date)} · {fmtMoney(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : !failed && !loading ? (
          <p className="text-small text-muted">Nenhuma conta a receber nesta referência.</p>
        ) : null}
        <Link
          to={`/financeiro?tab=${FINANCEIRO_SECTIONS.A_RECEBER}`}
          className="btn-primary btn-sm financeiro-overview-cta"
        >
          Ver tudo a receber <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
