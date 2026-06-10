import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BarChart2,
  Landmark,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useStudentStore } from '../../store/useStudentStore';
import {
  fetchFinanceOverview,
} from '../../lib/financeTxApi.js';
import { getFinanceRegime, financeRegimeLabel, FINANCE_REGIME } from '../../lib/financeCompetence.js';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';
import FinanceTabShell from './FinanceTabShell.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { EMPRESA_FINANCE_ACCOUNTS_PATH } from '../../lib/financeiroHubTabs.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from '../../lib/financeiroReceivablesSections.js';
import { hasConfiguredBankAccounts } from '../../lib/bankAccounts.js';
import {
  computeMensalidadesMonthKpis,
  countClosingDivergences,
  flattenForecastItems,
  formatBalanceDelta,
  formatMonthTitleCapitalized,
  monthEndYmd,
  previousMonthYm,
  sumForecastInflow,
} from '../../lib/financeiroOverview.js';
import { fetchContracts } from '../../features/contracts/api.js';
import { mapContractDisplayStatusForRecord } from '../../features/contracts/status.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import BankBalancesOverview from './BankBalancesOverview.jsx';
import ReceivablesOverviewCard from './ReceivablesOverviewCard.jsx';
import BalanceDeltaBadge from './BalanceDeltaBadge.jsx';
import PeriodFlowMiniChart from './PeriodFlowMiniChart.jsx';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtMoneyOrUnavailable(value, failed) {
  if (failed) return '—';
  if (value == null || Number.isNaN(Number(value))) return '—';
  return fmtMoney(value);
}

function fmtDateBr(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return ymd || '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function OverviewCard({ title, eyebrow, children, className = '' }) {
  return (
    <section className={`card financeiro-overview-card ${className}`.trim()}>
      {eyebrow ? <p className="navi-eyebrow financeiro-overview-card__eyebrow">{eyebrow}</p> : null}
      <h2 className="navi-section-heading financeiro-overview-card__title">{title}</h2>
      <div className="financeiro-overview-card__body">{children}</div>
    </section>
  );
}

function MetricRow({ label, value, hint, labelHint }) {
  return (
    <div className="financeiro-overview-metric">
      <span className="financeiro-overview-metric__label">
        {labelHint ? <FinanceLabelWithHint hint={labelHint}>{label}</FinanceLabelWithHint> : label}
      </span>
      <span className="financeiro-overview-metric__value">{value}</span>
      {hint ? <span className="text-small text-muted">{hint}</span> : null}
    </div>
  );
}

function CardLoadError({ message }) {
  return <ErrorBanner message={message} className="financeiro-overview-card__error" />;
}

export default function VisaoGeralTab({
  academyId,
  financeModule,
  modules,
  isOwner = false,
  referenceMonth,
}) {
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const students = useStudentStore((s) => s.students);

  const ym = String(referenceMonth || '').trim();
  const prevMonth = useMemo(() => previousMonthYm(ym), [ym]);
  const bankCompareAsOf = useMemo(() => monthEndYmd(prevMonth), [prevMonth]);

  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [paymentsFailed, setPaymentsFailed] = useState(false);
  const [forecastFailed, setForecastFailed] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryPrev, setSummaryPrev] = useState(null);
  const [payments, setPayments] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [pendingTxCount, setPendingTxCount] = useState(0);
  const [contractsAwaiting, setContractsAwaiting] = useState(0);
  const [closingDivergences, setClosingDivergences] = useState(0);
  const [receivables, setReceivables] = useState(null);
  const [receivablesFailed, setReceivablesFailed] = useState(false);
  const [bankBalancesData, setBankBalancesData] = useState(null);
  const [bankBalancesCompare, setBankBalancesCompare] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const regime = useMemo(
    () => (academyId ? getFinanceRegime(academyId) : 'cash'),
    [academyId]
  );

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    setSummaryFailed(false);
    setPaymentsFailed(false);
    setForecastFailed(false);
    setReceivablesFailed(false);
    try {
      const regimeVal = getFinanceRegime(academyId);
      const studentsSnapshot = useStudentStore.getState().students || [];
      const financeConfigSnapshot = useLeadStore.getState().financeConfig;

      const overview = await fetchFinanceOverview({
        academyId,
        month: ym,
        regime: regimeVal,
        includeForecast: financeModule,
        bankCompareAsOf,
      });

      setSummary(overview.summary ?? null);
      setSummaryFailed(!overview.summary);
      setSummaryPrev(overview.summaryPrev ?? null);

      setPayments(overview.payments || []);
      setPaymentsFailed(false);

      if (overview.receivables) {
        setReceivables(overview.receivables);
        setReceivablesFailed(false);
      } else {
        setReceivables(null);
        setReceivablesFailed(true);
      }

      if (financeModule) {
        if (overview.forecast) {
          setForecast(overview.forecast);
          setForecastFailed(false);
        } else {
          setForecast(null);
          setForecastFailed(true);
        }
      } else {
        setForecast(null);
        setForecastFailed(false);
      }

      const closingBody = overview.closing;
      if (closingBody) {
        const div = countClosingDivergences({
          payments: closingBody.payments || [],
          transactions: closingBody.transactions || [],
          students: studentsSnapshot,
          financeConfig: financeConfigSnapshot,
          referenceMonth: ym,
          regime: regimeVal,
        });
        setClosingDivergences(div);
        setPendingTxCount(Number(closingBody.pendingInMonth) || 0);
      } else {
        setClosingDivergences(0);
        setPendingTxCount(Number(overview.summary?.countPending) || 0);
      }

      setBankBalancesData(overview.bankBalances ?? null);
      setBankBalancesCompare(overview.bankBalancesCompare ?? null);

      if (modules?.finance) {
        try {
          const list = await fetchContracts({ limit: 100 });
          const awaiting = (list.data || []).filter((c) => {
            const d = mapContractDisplayStatusForRecord(c);
            return d === 'sent' || d === 'viewed';
          }).length;
          setContractsAwaiting(awaiting);
        } catch {
          setContractsAwaiting(0);
        }
      } else {
        setContractsAwaiting(0);
      }
    } catch (e) {
      console.error('[VisaoGeralTab]', e);
      setError('Não foi possível carregar o resumo financeiro.');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [
    academyId,
    ym,
    financeModule,
    bankCompareAsOf,
    modules?.finance,
  ]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    const bump = () => setRefreshToken((t) => t + 1);
    window.addEventListener('navi-student-payment-updated', bump);
    window.addEventListener('navi-financial-tx-settled', bump);
    return () => {
      window.removeEventListener('navi-student-payment-updated', bump);
      window.removeEventListener('navi-financial-tx-settled', bump);
    };
  }, []);

  const mensalKpis = useMemo(
    () => computeMensalidadesMonthKpis(students, payments, financeConfig, ym),
    [students, payments, financeConfig, ym]
  );

  const forecastItems = useMemo(() => flattenForecastItems(forecast), [forecast]);
  const forecastInflowTotal = useMemo(() => sumForecastInflow(forecastItems), [forecastItems]);
  const forecastTop = useMemo(() => forecastItems.filter((it) => it.flow !== 'out').slice(0, 5), [forecastItems]);
  const receivablesTop = useMemo(() => (receivables?.items || []).slice(0, 5), [receivables]);

  const balanceDelta = useMemo(
    () => formatBalanceDelta(summary?.periodBalance, summaryPrev?.periodBalance),
    [summary, summaryPrev]
  );

  const monthLabel = useMemo(() => formatMonthTitleCapitalized(ym), [ym]);

  const showAccountsSetupAlert = isOwner && !hasConfiguredBankAccounts(financeConfig);

  const receivablesTotal = receivables?.summary?.total ?? 0;
  const receivablesSectionPath = buildReceivablesPath({
    section: RECEIVABLES_SECTIONS.MENSALIDADES,
  });
  const receivablesPendingPath = buildReceivablesPath({
    section: RECEIVABLES_SECTIONS.MENSALIDADES,
    filtro: 'pending',
  });

  const hasAlerts =
    mensalKpis.overdueCount > 0 ||
    pendingTxCount > 0 ||
    receivablesTotal > 0 ||
    (modules?.finance && contractsAwaiting > 0) ||
    (financeModule && closingDivergences > 0);

  if (!academyId) {
    return (
      <EmptyState
        variant="compact"
        title="Selecione uma academia"
        description="Escolha uma academia para ver o resumo financeiro."
      />
    );
  }

  if (loading && !loadedOnce) {
    return (
      <div className="mt-2">
        <PageSkeleton variant="cards" rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2">
        <ErrorBanner message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const refreshBtn = (
    <button
      type="button"
      className="btn-outline btn-sm financeiro-overview-refresh"
      onClick={() => void load()}
      disabled={loading}
      aria-busy={loading}
      aria-label="Atualizar resumo"
    >
      <RefreshCw size={14} className={loading ? 'navi-async-btn__spin' : ''} aria-hidden />
      <span className="financeiro-overview-refresh__label">Atualizar</span>
    </button>
  );

  const regimeBadge = (
    <p className="text-small text-muted financeiro-overview__regime" role="status">
      <FinanceLabelWithHint
        hint={
          regime === FINANCE_REGIME.COMPETENCE
            ? FINANCE_TERM_HINTS.regimeCompetence
            : FINANCE_TERM_HINTS.regimeCaixa
        }
      >
        Régime {financeRegimeLabel(regime)}
      </FinanceLabelWithHint>
    </p>
  );

  return (
    <FinanceTabShell
      panelClassName="financeiro-overview"
      badge={regimeBadge}
      actions={refreshBtn}
      intro={
        showAccountsSetupAlert ? (
          <StatusBanner variant="warning" className="finance-tab-intro">
            Configure ao menos uma conta de recebimento para que sua equipe consiga registrar pagamentos.{' '}
            <Link to={EMPRESA_FINANCE_ACCOUNTS_PATH}>Configurar agora →</Link>
          </StatusBanner>
        ) : null
      }
    >

      {summary?.truncated ? (
        <StatusBanner variant="warning" className="mb-3">
          Período com mais de 2.500 lançamentos — totais podem estar incompletos. Reduza o intervalo de datas.
        </StatusBanner>
      ) : null}

      <div className="financeiro-overview-grid financeiro-overview-grid--dashboard">
        <OverviewCard
          title="Saldo e movimentações"
          eyebrow="Caixa · mês atual"
          className="financeiro-overview-card--period"
        >
          {summaryFailed ? (
            <CardLoadError message="Não foi possível carregar o saldo. Tente atualizar." />
          ) : null}
          <div className="financeiro-overview-hero">
            <Wallet size={22} aria-hidden />
            <div>
              <p className="financeiro-overview-hero__label">Saldo do período</p>
              <p className="financeiro-overview-hero__value">
                {fmtMoneyOrUnavailable(summary?.periodBalance, summaryFailed)}
              </p>
              {!summaryFailed ? (
                <BalanceDeltaBadge delta={balanceDelta} className="financeiro-overview-trend" />
              ) : null}
            </div>
          </div>
          <PeriodFlowMiniChart
            inflow={summary?.settledIn}
            outflow={summary?.settledOut}
            failed={summaryFailed}
          />
          <Link to="/financeiro?tab=movimentacoes" className="btn-outline btn-sm financeiro-overview-cta">
            Ver lançamentos <ArrowRight size={14} />
          </Link>
        </OverviewCard>

        <OverviewCard
          title="Saldos por conta"
          eyebrow="Caixa · posição atual"
          className="financeiro-overview-card--banks"
        >
          <div className="financeiro-overview-banks-intro">
            <Landmark size={20} className="financeiro-overview-banks-intro__icon" aria-hidden />
            <p className="text-small text-muted financeiro-overview-banks-intro__text">
              Valores liquidados em cada conta bancária. Para filtrar lançamentos, use o link em cada conta.
            </p>
          </div>
          <BankBalancesOverview
            academyId={academyId}
            embedded
            accountLinks
            refreshKey={refreshToken}
            compareAsOf={bankCompareAsOf}
            showTotalDelta
            prefetchedData={bankBalancesData}
            prefetchedCompareData={bankBalancesCompare}
          />
        </OverviewCard>

        <ReceivablesOverviewCard
          summary={receivables?.summary}
          topItems={receivablesTop}
          failed={receivablesFailed}
          loading={loading}
        />

        <OverviewCard title="Mensalidades" eyebrow={`Referência ${monthLabel}`} className="financeiro-overview-card--pair">
          {paymentsFailed ? (
            <CardLoadError message="Não foi possível carregar as mensalidades. Tente atualizar." />
          ) : null}
          <div className="financeiro-overview-metrics">
            <MetricRow
              label="Alunos ativos com plano"
              value={paymentsFailed ? '—' : String(mensalKpis.activeWithPlan)}
            />
            <MetricRow
              label="Valor esperado no mês"
              value={fmtMoneyOrUnavailable(mensalKpis.expectedTotal, paymentsFailed)}
            />
            <MetricRow
              label="Recebido até hoje"
              value={fmtMoneyOrUnavailable(mensalKpis.receivedTotal, paymentsFailed)}
            />
            <MetricRow
              label="Inadimplentes"
              labelHint={FINANCE_TERM_HINTS.inadimplentes}
              value={
                paymentsFailed
                  ? '—'
                  : `${mensalKpis.overdueCount} · ${fmtMoney(mensalKpis.overdueOpen)} em aberto`
              }
            />
          </div>
          <Link
            to={receivablesSectionPath}
            className="btn-primary btn-sm financeiro-overview-cta"
          >
            Ver Mensalidades <ArrowRight size={14} />
          </Link>
        </OverviewCard>

        <OverviewCard title="Alertas" eyebrow="Atenção" className="financeiro-overview-card--pair">
          <ul className="financeiro-overview-alerts financeiro-overview-alerts--inline">
            {!receivablesFailed && (mensalKpis.overdueCount > 0 || receivablesTotal > 0) ? (
              <li>
                <AlertCircle size={16} aria-hidden />
                <span>
                  {mensalKpis.overdueCount > 0 ? (
                    <>
                      <strong>{mensalKpis.overdueCount}</strong> aluno(s) em atraso ·{' '}
                    </>
                  ) : null}
                  <strong>{fmtMoney(receivablesTotal)}</strong> a receber nesta referência
                </span>
                <Link to={receivablesPendingPath}>Ver</Link>
              </li>
            ) : null}
            {pendingTxCount > 0 ? (
              <li>
                <AlertCircle size={16} aria-hidden />
                <span>
                  <strong>{pendingTxCount}</strong> lançamento(s) pendente(s)
                </span>
                <Link to="/financeiro?tab=movimentacoes">Ver</Link>
              </li>
            ) : null}
            {modules?.finance && contractsAwaiting > 0 ? (
              <li>
                <AlertCircle size={16} aria-hidden />
                <span>
                  <strong>{contractsAwaiting}</strong> contrato(s) aguardando assinatura
                </span>
                <Link to="/alunos?tab=contratos">Ver</Link>
              </li>
            ) : null}
            {financeModule && closingDivergences > 0 ? (
              <li>
                <AlertCircle size={16} aria-hidden />
                <span>
                  <strong>{closingDivergences}</strong> divergência(s) em {monthLabel}
                </span>
                <Link to="/financeiro?tab=fechamento">Conferir</Link>
              </li>
            ) : null}
            {!hasAlerts ? (
              <li className="financeiro-overview-alerts--ok">Nenhum alerta no momento.</li>
            ) : null}
          </ul>
        </OverviewCard>

        {financeModule ? (
          <OverviewCard title="Previsão · 30 dias" eyebrow="Entradas futuras" className="financeiro-overview-card--pair">
            {forecastFailed ? (
              <CardLoadError message="Não foi possível carregar a previsão. Tente atualizar." />
            ) : null}
            <p className="financeiro-overview-forecast-total">
              Total previsto (entradas):{' '}
              <strong>{fmtMoneyOrUnavailable(forecastInflowTotal, forecastFailed)}</strong>
            </p>
            {!forecastFailed && forecastTop.length > 0 ? (
              <ul className="financeiro-overview-list">
                {forecastTop.map((item, idx) => (
                  <li key={`${item.due_date}-${idx}`}>
                    <span className="financeiro-overview-list__label">
                      {item.student_name || item.label || 'Lançamento'}
                    </span>
                    <span className="financeiro-overview-list__meta">
                      {fmtDateBr(item.due_date)} · {fmtMoney(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : !forecastFailed ? (
              <EmptyState variant="embedded" title="Nenhuma entrada prevista no período" />
            ) : null}
            <Link to="/financeiro?tab=previsao" className="btn-outline btn-sm financeiro-overview-cta">
              Ver Previsão <ArrowRight size={14} />
            </Link>
          </OverviewCard>
        ) : (
          <OverviewCard title="Previsão de caixa" eyebrow="Módulo financeiro" className="financeiro-overview-card--pair">
            <EmptyState
              variant="embedded"
              title="Previsão indisponível"
              description="Ative o módulo financeiro para ver a previsão de caixa."
            />
          </OverviewCard>
        )}
      </div>

      {isOwner ? (
        <Link to="/reports?tab=financeiro" className="financeiro-overview-reports-card card">
          <BarChart2 size={22} className="financeiro-overview-reports-card__icon" aria-hidden />
          <div className="financeiro-overview-reports-card__body">
            <p className="financeiro-overview-reports-card__title">Relatórios financeiros</p>
            <p className="text-small text-muted financeiro-overview-reports-card__desc">
              DRE, receita por período e breakdown por forma de pagamento
            </p>
          </div>
          <ArrowRight size={18} className="financeiro-overview-reports-card__arrow" aria-hidden />
        </Link>
      ) : null}
    </FinanceTabShell>
  );
}
