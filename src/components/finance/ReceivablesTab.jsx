import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { fetchReceivables } from '../../lib/financeTxApi.js';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import { RECEIVABLE_SOURCE_LABELS } from '../../lib/receivablesAggregate.js';
import { FINANCEIRO_SECTIONS } from '../../lib/financeiroHubTabs.js';
import { formatMonthTitleCapitalized } from '../../lib/financeiroOverview.js';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

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

function itemActionLink(item) {
  if (item.source === 'mensalidade' && item.lead_id) {
    return `/financeiro?tab=${FINANCEIRO_SECTIONS.MENSALIDADES}&search=${encodeURIComponent(item.label)}`;
  }
  if (item.tx_id) {
    return `/financeiro?tab=movimentacoes&tx=${encodeURIComponent(item.tx_id)}`;
  }
  return `/financeiro?tab=${item.linkTab || 'movimentacoes'}`;
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'Em atraso';
  if (s === 'partial') return 'Parcial';
  if (s === 'awaiting') return 'Aguardando';
  if (s === 'pending') return 'Pendente';
  return 'Em aberto';
}

export default function ReceivablesTab({ academyId, referenceMonth }) {
  const ym = String(referenceMonth || '').trim();
  const monthLabel = useMemo(() => formatMonthTitleCapitalized(ym), [ym]);

  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async () => {
    if (!academyId || !ym) return;
    setLoading(true);
    setError('');
    try {
      const body = await fetchReceivables({ academyId, month: ym });
      setData(body);
    } catch (e) {
      console.error('[ReceivablesTab]', e);
      setData(null);
      setError('Não foi possível carregar as contas a receber.');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [academyId, ym, refreshToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const bump = () => setRefreshToken((t) => t + 1);
    window.addEventListener('navi-student-payment-updated', bump);
    window.addEventListener('navi-financial-tx-settled', bump);
    return () => {
      window.removeEventListener('navi-student-payment-updated', bump);
      window.removeEventListener('navi-financial-tx-settled', bump);
    };
  }, []);

  const items = useMemo(() => {
    const rows = data?.items || [];
    if (sourceFilter === 'all') return rows;
    return rows.filter((it) => it.source === sourceFilter);
  }, [data?.items, sourceFilter]);

  const summary = data?.summary || { total: 0, bySource: {}, count: 0 };
  const bySource = summary.bySource || {};

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia.</p>;
  }

  if (loading && !loadedOnce) {
    return (
      <div className="mt-2">
        <PageSkeleton variant="table" rows={6} />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={() => setRefreshToken((t) => t + 1)} />;
  }

  return (
    <div className="receivables-tab">
      <header className="receivables-tab__head">
        <div>
          <p className="text-small text-muted receivables-tab__period">
            Referência: {monthLabel}
          </p>
          <p className="receivables-tab__total">
            <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.aReceber}>
              Total a receber
            </FinanceLabelWithHint>
            : <strong>{fmtMoney(summary.total)}</strong>
            {summary.count > 0 ? (
              <span className="text-small text-muted receivables-tab__count">
                {' '}
                · {summary.count} item(ns)
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => setRefreshToken((t) => t + 1)}
          disabled={loading}
          aria-busy={loading}
        >
          <RefreshCw size={14} className={loading ? 'navi-async-btn__spin' : ''} aria-hidden />
          Atualizar
        </button>
      </header>

      <StatusBanner variant="info" className="receivables-tab__hint">
        {FINANCE_TERM_HINTS.mensalidadePendenteCaixa}
      </StatusBanner>

      <div className="receivables-tab__breakdown">
        {Object.entries(RECEIVABLE_SOURCE_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`receivables-tab__chip${sourceFilter === key ? ' receivables-tab__chip--active' : ''}`}
            onClick={() => setSourceFilter((cur) => (cur === key ? 'all' : key))}
          >
            <span className="receivables-tab__chip-label">{label}</span>
            <span className="receivables-tab__chip-value">{fmtMoney(bySource[key] || 0)}</span>
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="text-small text-muted receivables-tab__empty">
          Nenhuma conta a receber nesta referência.
        </p>
      ) : (
        <div className="card receivables-tab__table-wrap">
          <table className="receivables-tab__table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Origem</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th className="receivables-tab__col-amount">Valor</th>
                <th aria-label="Ação" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.label}</td>
                  <td>
                    <span className={`receivables-tab__badge receivables-tab__badge--${item.source}`}>
                      {item.sourceLabel}
                    </span>
                  </td>
                  <td>{fmtDateBr(item.due_date)}</td>
                  <td>{statusLabel(item.status)}</td>
                  <td className="receivables-tab__col-amount finance-data">{fmtMoney(item.amount)}</td>
                  <td>
                    <Link to={itemActionLink(item)} className="receivables-tab__action">
                      Abrir <ArrowRight size={12} aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
