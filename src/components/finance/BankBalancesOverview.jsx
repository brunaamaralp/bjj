import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { fetchBankBalances } from '../../lib/financeTxApi.js';
import { EMPRESA_FINANCE_CONFIG_PATH } from '../../lib/financeiroHubTabs.js';
import { UNALLOCATED_BANK_LABEL } from '../../lib/bankAccountBalances.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

export default function BankBalancesOverview({ academyId, onSelectAccount, selectedAccountLabel = '' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const body = await fetchBankBalances({ academyId });
      setData(body);
    } catch (e) {
      setData(null);
      setError(e?.message || 'Não foi possível carregar os saldos.');
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!academyId) return null;

  if (loading && !data) {
    return <PageSkeleton variant="cards" rows={2} />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={() => void load()} />;
  }

  const accounts = data?.accounts || [];
  const unallocated = data?.unallocated;

  if (!accounts.length) {
    return (
      <EmptyState
        variant="compact"
        title="Nenhuma conta bancária"
        description="Cadastre contas em Minha academia → Financeiro para acompanhar saldos."
        primaryAction={{
          label: 'Configurar contas',
          href: EMPRESA_FINANCE_CONFIG_PATH,
        }}
      />
    );
  }

  return (
    <div className="finance-bank-balances">
      <div className="finance-bank-balances__head">
        <p className="text-small text-muted" role="status">
          Saldos liquidados até {String(data?.asOf || '').split('-').reverse().join('/') || 'hoje'}
        </p>
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => void load()}
          disabled={loading}
          aria-busy={loading}
        >
          <RefreshCw size={14} className={loading ? 'navi-async-btn__spin' : ''} aria-hidden />
          Atualizar
        </button>
      </div>
      <div className="finance-bank-balances__grid">
        {accounts.map((row) => {
          const selected = selectedAccountLabel && selectedAccountLabel === row.label;
          const CardTag = onSelectAccount ? 'button' : 'article';
          return (
          <CardTag
            key={row.label}
            type={onSelectAccount ? 'button' : undefined}
            className={`finance-bank-balances__card card${selected ? ' finance-bank-balances__card--selected' : ''}${onSelectAccount ? ' finance-bank-balances__card--selectable' : ''}`}
            onClick={onSelectAccount ? () => onSelectAccount(selected ? '' : row.label) : undefined}
            aria-pressed={onSelectAccount ? selected : undefined}
          >
            <h3 className="finance-bank-balances__card-title">{row.label}</h3>
            <p className="finance-bank-balances__card-balance">{fmtMoney(row.balance)}</p>
            <p className="text-small text-muted finance-bank-balances__card-meta">
              Inicial {fmtMoney(row.openingBalance)} · +{fmtMoney(row.inflow)} · −{fmtMoney(row.outflow)}
              {row.movementCount > 0 ? ` · ${row.movementCount} mov.` : ''}
            </p>
          </CardTag>
        );
        })}
        {unallocated?.count > 0 ? (
          (() => {
            const selected = selectedAccountLabel === UNALLOCATED_BANK_LABEL;
            const CardTag = onSelectAccount ? 'button' : 'article';
            return (
          <CardTag
            type={onSelectAccount ? 'button' : undefined}
            className={`finance-bank-balances__card card finance-bank-balances__card--muted${selected ? ' finance-bank-balances__card--selected' : ''}${onSelectAccount ? ' finance-bank-balances__card--selectable' : ''}`}
            onClick={onSelectAccount ? () => onSelectAccount(selected ? '' : UNALLOCATED_BANK_LABEL) : undefined}
            aria-pressed={onSelectAccount ? selected : undefined}
          >
            <h3 className="finance-bank-balances__card-title">{UNALLOCATED_BANK_LABEL}</h3>
            <p className="finance-bank-balances__card-balance">{fmtMoney(unallocated.balance)}</p>
            <p className="text-small text-muted finance-bank-balances__card-meta">
              {unallocated.count} lançamento(s) sem conta vinculada
            </p>
          </CardTag>
            );
          })()
        ) : null}
      </div>
      {onSelectAccount ? (
        <p className="text-small text-muted finance-bank-balances__filter-hint">
          Clique em uma conta para filtrar a lista abaixo. Clique de novo para remover o filtro.
        </p>
      ) : null}
      <p className="text-small text-muted finance-bank-balances__total">
        Total (contas + não alocado): <strong>{fmtMoney(data?.totalBalance)}</strong>
      </p>
      <Link to={EMPRESA_FINANCE_CONFIG_PATH} className="finance-config-context-link">
        Ajustar saldo inicial das contas →
      </Link>
    </div>
  );
}
