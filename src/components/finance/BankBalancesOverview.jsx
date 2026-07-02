import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { fetchBankBalances } from '../../lib/financeTxApi.js';
import { buildMovimentacoesPeriodPath, formatBalanceDelta } from '../../lib/financeiroOverview.js';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';
import { EMPRESA_FINANCE_CONFIG_PATH } from '../../lib/financeiroHubTabs.js';
import { UNALLOCATED_BANK_LABEL } from '../../lib/bankAccountBalances.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import BalanceDeltaBadge from './BalanceDeltaBadge.jsx';
import { friendlyError } from '../../lib/errorMessages.js';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function buildLancamentosAccountPath(label, unallocated, periodFrom, periodTo) {
  return buildMovimentacoesPeriodPath({
    from: periodFrom,
    to: periodTo,
    conta: unallocated ? UNALLOCATED_BANK_LABEL : label || undefined,
  });
}

function BankBalanceCard({
  label,
  balance,
  muted = false,
  unallocated = false,
  selected = false,
  selectable = false,
  onClick,
  compactLayout = false,
  accountLinks = false,
  periodFrom = '',
  periodTo = '',
  children,
}) {
  const cardClass = [
    'finance-bank-balances__card',
    'card',
    muted && !unallocated ? ' finance-bank-balances__card--muted' : '',
    unallocated ? ' finance-bank-balances__card--unallocated' : '',
    selected ? ' finance-bank-balances__card--selected' : '',
    selectable ? ' finance-bank-balances__card--selectable' : '',
    compactLayout ? ' finance-bank-balances__card--compact' : '',
    accountLinks ? ' finance-bank-balances__card--linked' : '',
  ]
    .filter(Boolean)
    .join('');

  const accountLink = accountLinks
    ? buildLancamentosAccountPath(label, unallocated, periodFrom, periodTo)
    : null;

  if (compactLayout) {
    const HeroTag = selectable ? 'button' : 'div';
    return (
      <article className={cardClass}>
        <HeroTag
          type={selectable ? 'button' : undefined}
          className="finance-bank-balances__card-hero"
          onClick={selectable ? onClick : undefined}
          aria-pressed={selectable ? selected : undefined}
        >
          <h3 className="finance-bank-balances__card-title">{label}</h3>
          <p className="finance-bank-balances__card-balance finance-bank-balances__card-balance--hero">
            {fmtMoney(balance)}
          </p>
        </HeroTag>
        {children ? (
          <details className="finance-bank-balances__card-details">
            <summary className="finance-bank-balances__card-details-summary">Detalhes</summary>
            <div className="finance-bank-balances__card-details-body">{children}</div>
          </details>
        ) : null}
      </article>
    );
  }

  const CardTag = selectable ? 'button' : 'article';
  return (
    <CardTag
      type={selectable ? 'button' : undefined}
      className={cardClass}
      onClick={onClick}
      aria-pressed={selectable ? selected : undefined}
    >
      <div className="finance-bank-balances__card-inner">
        <h3 className="finance-bank-balances__card-title">{label}</h3>
        <p className="finance-bank-balances__card-balance">{fmtMoney(balance)}</p>
        {children}
        {accountLink ? (
          <Link to={accountLink} className="finance-bank-balances__card-action">
            Ver lançamentos <ArrowRight size={14} aria-hidden />
          </Link>
        ) : null}
      </div>
    </CardTag>
  );
}

function AccountBreakdown({
  openingBalance,
  inflow,
  outflow,
  movementCount,
  periodMode = false,
}) {
  return (
    <dl className="finance-bank-balances__card-breakdown">
      <div>
        <dt>Saldo inicial</dt>
        <dd>{fmtMoney(openingBalance)}</dd>
      </div>
      <div>
        <dt>{periodMode ? 'Entradas no período' : 'Entradas'}</dt>
        <dd className="finance-bank-balances__card-breakdown--in">+{fmtMoney(inflow)}</dd>
      </div>
      <div>
        <dt>{periodMode ? 'Saídas no período' : 'Saídas'}</dt>
        <dd className="finance-bank-balances__card-breakdown--out">−{fmtMoney(outflow)}</dd>
      </div>
      {movementCount > 0 ? (
        <div>
          <dt>{periodMode ? 'Movimentações no período' : 'Movimentações'}</dt>
          <dd>{movementCount}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export default function BankBalancesOverview({
  academyId,
  onSelectAccount,
  selectedAccountLabel = '',
  compactLayout = false,
  embedded = false,
  accountLinks = false,
  periodFrom = '',
  periodTo = '',
  periodLabel = '',
  refreshKey = 0,
  compareAsOf = '',
  showTotalDelta = false,
  prefetchedData = null,
  prefetchedCompareData = null,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [prevTotalBalance, setPrevTotalBalance] = useState(null);
  const usePrefetch = prefetchedData != null;

  const load = useCallback(async () => {
    if (!academyId || usePrefetch) return;
    setLoading(true);
    setError('');
    try {
      const compareDate = showTotalDelta && compareAsOf ? String(compareAsOf).trim() : '';
      const requests = [fetchBankBalances({ academyId })];
      if (compareDate) {
        requests.push(fetchBankBalances({ academyId, asOf: compareDate }));
      }
      const [currentBody, prevBody] = await Promise.all(requests);
      setData(currentBody);
      setPrevTotalBalance(compareDate ? Number(prevBody?.totalBalance) || 0 : null);
    } catch (e) {
      setData(null);
      setPrevTotalBalance(null);
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, [academyId, compareAsOf, showTotalDelta, usePrefetch]);

  useEffect(() => {
    if (usePrefetch) {
      setData(prefetchedData);
      setPrevTotalBalance(
        showTotalDelta && prefetchedCompareData
          ? Number(prefetchedCompareData.totalBalance) || 0
          : null
      );
      setLoading(false);
      setError('');
      return;
    }
    void load();
  }, [usePrefetch, prefetchedData, prefetchedCompareData, showTotalDelta, load, refreshKey]);

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

  const selectable = Boolean(onSelectAccount);
  const showUnallocated = compactLayout || (unallocated?.count > 0);
  const resolvedPeriodFrom = periodFrom || data?.periodFrom || '';
  const resolvedPeriodTo = periodTo || data?.periodTo || '';
  const periodMode = Boolean(resolvedPeriodFrom && resolvedPeriodTo);
  const asOfLabel = periodLabel
    ? periodLabel
    : String(data?.asOf || '').split('-').reverse().join('/') || 'hoje';
  const totalDelta = showTotalDelta
    ? formatBalanceDelta(data?.totalBalance, prevTotalBalance)
    : null;

  return (
    <div
      className={[
        'finance-bank-balances',
        compactLayout ? 'finance-bank-balances--compact' : '',
        embedded ? 'finance-bank-balances--embedded' : '',
        accountLinks ? 'finance-bank-balances--overview' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!embedded ? (
        <div className="finance-bank-balances__head">
          <p className="text-small text-muted" role="status">
            Saldos liquidados até {asOfLabel}
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
      ) : (
        <p className="text-small text-muted finance-bank-balances__as-of" role="status">
          <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.saldoContaNaData}>
            Saldos liquidados em {asOfLabel}
          </FinanceLabelWithHint>
        </p>
      )}
      <div
        className={`finance-bank-balances__grid${compactLayout ? ' finance-bank-balances__grid--quad' : ''}`}
      >
        {accounts.map((row) => {
          const selected = selectedAccountLabel && selectedAccountLabel === row.label;
          const breakdownInflow = periodMode ? row.periodInflow : row.inflow;
          const breakdownOutflow = periodMode ? row.periodOutflow : row.outflow;
          const breakdownCount = periodMode ? row.periodMovementCount : row.movementCount;
          return (
            <BankBalanceCard
              key={row.label}
              label={row.label}
              balance={row.balance}
              selected={selected}
              selectable={selectable}
              compactLayout={compactLayout}
              accountLinks={accountLinks}
              periodFrom={resolvedPeriodFrom}
              periodTo={resolvedPeriodTo}
              onClick={
                selectable ? () => onSelectAccount(selected ? '' : row.label) : undefined
              }
            >
              <AccountBreakdown
                openingBalance={row.openingBalance}
                inflow={breakdownInflow}
                outflow={breakdownOutflow}
                movementCount={breakdownCount}
                periodMode={periodMode}
              />
            </BankBalanceCard>
          );
        })}
        {showUnallocated ? (
          <BankBalanceCard
            label={UNALLOCATED_BANK_LABEL}
            balance={unallocated?.balance ?? 0}
            unallocated
            selected={selectedAccountLabel === UNALLOCATED_BANK_LABEL}
            selectable={selectable}
            compactLayout={compactLayout}
            accountLinks={accountLinks}
            periodFrom={resolvedPeriodFrom}
            periodTo={resolvedPeriodTo}
            onClick={
              selectable
                ? () =>
                    onSelectAccount(
                      selectedAccountLabel === UNALLOCATED_BANK_LABEL ? '' : UNALLOCATED_BANK_LABEL
                    )
                : undefined
            }
          >
            <dl className="finance-bank-balances__card-breakdown">
              <div>
                <dt>Lançamentos</dt>
                <dd>{unallocated?.count ?? 0}</dd>
              </div>
              <div>
                <dt>Vínculo</dt>
                <dd>Sem conta bancária</dd>
              </div>
            </dl>
          </BankBalanceCard>
        ) : null}
      </div>
      {selectable ? (
        <p className="text-small text-muted finance-bank-balances__filter-hint">
          {compactLayout
            ? 'Clique no saldo para filtrar a lista. Abra “Detalhes” para ver entradas e saídas.'
            : 'Clique em uma conta para filtrar a lista abaixo. Clique de novo para remover o filtro.'}
        </p>
      ) : null}
      <div className="text-small text-muted finance-bank-balances__total">
        <span>
          <FinanceLabelWithHint hint={FINANCE_TERM_HINTS.saldoAtualBancario}>
            Total (contas + não alocado)
          </FinanceLabelWithHint>
          : <strong>{fmtMoney(data?.totalBalance)}</strong>
        </span>
        {totalDelta ? (
          <BalanceDeltaBadge
            delta={totalDelta}
            compareLabel="vs fim do mês anterior"
            className="finance-bank-balances__total-delta"
          />
        ) : null}
      </div>
      <Link to={EMPRESA_FINANCE_CONFIG_PATH} className="finance-config-context-link">
        Ajustar saldo inicial das contas →
      </Link>
    </div>
  );
}
