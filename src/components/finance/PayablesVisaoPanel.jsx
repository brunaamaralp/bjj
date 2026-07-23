import React from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown } from 'lucide-react';
import {
  PAYABLES_SECTIONS,
  buildPayablesPath,
} from '../../lib/financeiroPayablesSections.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';

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

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'Vencida';
  if (s === 'due_soon') return 'Vence em breve';
  if (s === 'open') return 'Em aberto';
  return 'Programada';
}

function statusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'finance-badge-atraso';
  if (s === 'due_soon') return 'finance-badge-aguardando';
  return 'finance-badge-pendente';
}

/**
 * Visão geral de A pagar — só próximos vencimentos (KPIs ficam na faixa do shell).
 */
export default function PayablesVisaoPanel({
  items = [],
  formatCategory,
  loading = false,
}) {
  if (loading && items.length === 0) {
    return <PageSkeleton variant="compact" />;
  }

  return (
    <div className="payables-visao-panel">
      {items.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={TrendingDown}
          title="Nenhuma conta programada"
          description="Cadastre contas fixas como água, luz e telefone para acompanhar vencimentos."
        />
      ) : (
        <>
          <h3 className="navi-section-heading text-base mb-2">Próximos vencimentos</h3>
          <ul className="financeiro-overview-list">
            {items.map((item) => {
              const category = formatCategory
                ? formatCategory(item.category)
                : String(item.category || '').trim() || '—';
              return (
                <li key={item.id}>
                  <span className="financeiro-overview-list__label">{item.vendor_label}</span>
                  <span className="financeiro-overview-list__meta">
                    {fmtDateBr(item.due_date)}
                    {' · '}
                    <span className="finance-value-negative">{fmtMoney(item.amount)}</span>
                    {' · '}
                    {category}
                    {' · '}
                    <span className={`finance-badge ${statusBadgeClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="d-flex gap-2 flex-wrap mt-3">
        <Link
          to={buildPayablesPath({ section: PAYABLES_SECTIONS.CONTAS_FIXAS })}
          className="btn-outline btn-sm financeiro-overview-cta"
        >
          Ver contas fixas
        </Link>
        <Link
          to={buildPayablesPath({ section: PAYABLES_SECTIONS.VENCIDAS })}
          className="btn-outline btn-sm financeiro-overview-cta"
        >
          Ver vencidas
        </Link>
        <Link to="/financeiro?tab=previsao" className="btn-outline btn-sm financeiro-overview-cta">
          Abrir previsão de caixa
        </Link>
      </div>
    </div>
  );
}
