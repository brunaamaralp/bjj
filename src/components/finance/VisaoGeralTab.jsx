import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BarChart2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useStudentStore } from '../../store/useStudentStore';
import {
  fetchFinanceSummary,
  fetchFinanceForecast,
  fetchMonthlyClosing,
  fetchReceivables,
} from '../../lib/financeTxApi.js';
import { getMonthlyPayments } from '../../lib/studentPayments';
import { getFinanceRegime, financeRegimeLabel, FINANCE_REGIME } from '../../lib/financeCompetence.js';
import { FINANCE_TERM_HINTS } from '../../lib/financeTermHints.js';
import FinanceLabelWithHint from './FinanceLabelWithHint.jsx';
import { FINANCEIRO_SECTIONS, EMPRESA_FINANCE_ACCOUNTS_PATH } from '../../lib/financeiroHubTabs.js';
import { hasConfiguredBankAccounts } from '../../lib/bankAccounts.js';
import {
  computeMensalidadesMonthKpis,
  countClosingDivergences,
  flattenForecastItems,
  forecastNext30Range,
  formatBalanceDelta,
  formatMonthTitleCapitalized,
  monthPeriodBounds,
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
  const { from, to } = useMemo(() => monthPeriodBounds(ym), [ym]);
  const prevMonth = useMemo(() => previousMonthYm(ym), [ym]);
  const prevBounds = useMemo(() => monthPeriodBounds(prevMonth), [prevMonth]);
  const forecastRange = useMemo(() => forecastNext30Range(), []);

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
      const tasks = [
        fetchFinanceSummary({ academyId, from, to, regime: regimeVal }),
        fetchFinanceSummary({ academyId, from: prevBounds.from, to: prevBounds.to, regime: regimeVal }),
        getMonthlyPayments(academyId, ym, {
          activeStudentCount: studentsSnapshot.filter((s) => String(s.plan || '').trim()).length,
        }),
        fetchReceivables({ academyId, month: ym }),
      ];

      if (financeModule) {
        tasks.push(
          fetchFinanceForecast({
            academyId,
            from: forecastRange.from,
            to: forecastRange.to,
          })
        );
        tasks.push(
          fetchMonthlyClosing({
            academyId,
            month: ym,
            regime: regimeVal,
          })
        );
      }

      const results = await Promise.allSettled(tasks);
      const [curRes, prevRes, payRes, receivablesRes, forecastRes, closingRes] = results;

      if (curRes.status === 'fulfilled') {
        setSummary(curRes.value);
        setSummaryFailed(false);
      } else {
        setSummary(null);
        setSummaryFailed(true);
      }

      if (prevRes.status === 'fulfilled') setSummaryPrev(prevRes.value);
      else setSummaryPrev(null);

      if (payRes.status === 'fulfilled') {
        setPayments(payRes.value || []);
        setPaymentsFailed(false);
      } else {
        setPayments([]);
        setPaymentsFailed(true);
      }

      if (receivablesRes?.status === 'fulfilled') {
        setReceivables(receivablesRes.value);
        setReceivablesFailed(false);
      } else {
        setReceivables(null);
        setReceivablesFailed(true);
      }

      if (financeModule) {
        if (forecastRes?.status === 'fulfilled') {
          setForecast(forecastRes.value);
          setForecastFailed(false);
        } else {
          setForecast(null);
          setForecastFailed(true);
        }
      } else {
        setForecast(null);
        setForecastFailed(false);
      }

      if (closingRes?.status === 'fulfilled' && closingRes.value) {
        const body = closingRes.value;
        const div = countClosingDivergences({
          payments: body.payments || [],
          transactions: body.transactions || [],
          students: studentsSnapshot,
          financeConfig: financeConfigSnapshot,
          referenceMonth: ym,
          regime: regimeVal,
        });
        setClosingDivergences(div);
        setPendingTxCount(Number(body.pendingInMonth) || 0);
      } else {
        setClosingDivergences(0);
        if (curRes.status === 'fulfilled') {
          setPendingTxCount(Number(curRes.value?.countPending) || 0);
        }
      }

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
    from,
    to,
    prevBounds.from,
    prevBounds.to,
    ym,
    financeModule,
    forecastRange.from,
    forecastRange.to,
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

  const hasAlerts =
    mensalKpis.overdueCount > 0 ||
    pendingTxCount > 0 ||
    receivablesTotal > 0 ||
    (modules?.finance && contractsAwaiting > 0) ||
    (financeModule && closingDivergences > 0);

  if (!academyId) {
    return (
      <p className="text-small text-muted financeiro-overview__empty-academy">
        Selecione uma academia para ver o resumo.
      </p>
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

  return (
    <div className="financeiro-overview">
      <header className="financeiro-overview__head">
        <div className="financeiro-overview__head-main">
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
        </div>
        <div className="financeiro-overview__head-actions">
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
        </div>
      </header>

      {showAccountsSetupAlert ? (
        <div className="financeiro-overview-accounts-alert" role="alert">
          Configure ao menos uma conta de recebimento para que sua equipe consiga registrar pagamentos.{' '}
          <Link to={EMPRESA_FINANCE_ACCOUNTS_PATH}>Configurar agora →</Link>
        </div>
      ) : null}

      {summary?.truncated ? (
        <StatusBanner variant="warning" className="mb-3">
          Período com mais de 2.500 lançamentos — totais podem estar incompletos. Reduza o intervalo de datas.
        </StatusBanner>
      ) : null}

      <div className="financeiro-overview-grid financeiro-overview-grid--hero-first">
        <OverviewCard
          title="Saldo e movimentações"
          eyebrow="Caixa · mês atual"
          className="financeiro-overview-card--hero"
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
                <p className="text-small text-muted financeiro-overview-trend">
                  {balanceDelta.type === 'pct' ? (
                    <>
                      {balanceDelta.pct >= 0 ? (
                        <TrendingUp size={14} className="financeiro-overview-trend__icon" aria-hidden />
                      ) : (
                        <TrendingDown size={14} className="financeiro-overview-trend__icon" aria-hidden />
                      )}
                      {balanceDelta.pct >= 0 ? '+' : ''}
                      {balanceDelta.pct}% vs mês anterior
                    </>
                  ) : (
                    balanceDelta.text
                  )}
                </p>
              ) : null}
            </div>
          </div>
          <div className="financeiro-overview-metrics">
            <MetricRow
              label="Entradas liquidadas"
              value={fmtMoneyOrUnavailable(summary?.settledIn, summaryFailed)}
            />
            <MetricRow
              label="Saídas liquidadas"
              value={fmtMoneyOrUnavailable(summary?.settledOut, summaryFailed)}
            />
          </div>
          <Link to="/financeiro?tab=movimentacoes" className="btn-outline btn-sm financeiro-overview-cta">
            Ver lançamentos <ArrowRight size={14} />
          </Link>
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
            to={`/financeiro?tab=${FINANCEIRO_SECTIONS.MENSALIDADES}`}
            className="btn-primary btn-sm financeiro-overview-cta"
          >
            Ver Mensalidades <ArrowRight size={14} />
          </Link>
        </OverviewCard>

        <OverviewCard title="Alertas" eyebrow="Atenção" className="financeiro-overview-card--pair">
          <ul className="financeiro-overview-alerts financeiro-overview-alerts--inline">
            {mensalKpis.overdueCount > 0 ? (
              <li>
                <AlertCircle size={16} aria-hidden />
                <span>
                  <strong>{mensalKpis.overdueCount}</strong> aluno(s) em atraso
                </span>
                <Link to="/financeiro?tab=mensalidades&filtro=pending">Ver</Link>
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
            {!receivablesFailed && receivablesTotal > 0 ? (
              <li>
                <AlertCircle size={16} aria-hidden />
                <span>
                  <strong>{fmtMoney(receivablesTotal)}</strong> a receber nesta referência
                </span>
                <Link to={`/financeiro?tab=${FINANCEIRO_SECTIONS.A_RECEBER}`}>Ver</Link>
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

        <details className="financeiro-overview-details financeiro-overview-details--banks">
          <summary className="financeiro-overview-details__summary financeiro-overview-details__summary--mobile-only">
            Saldos por conta
          </summary>
          <div className="financeiro-overview-details__body">
            <BankBalancesOverview academyId={academyId} />
          </div>
        </details>

        {financeModule ? (
          <details className="financeiro-overview-details financeiro-overview-details--forecast">
            <summary className="financeiro-overview-details__summary financeiro-overview-details__summary--mobile-only">
              Previsão · 30 dias
            </summary>
            <div className="financeiro-overview-details__body">
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
                <p className="text-small text-muted">Nenhuma entrada prevista no período.</p>
              ) : null}
              <Link to="/financeiro?tab=previsao" className="btn-outline btn-sm financeiro-overview-cta">
                Ver Previsão <ArrowRight size={14} />
              </Link>
            </div>
          </details>
        ) : (
          <details className="financeiro-overview-details financeiro-overview-details--forecast">
            <summary className="financeiro-overview-details__summary financeiro-overview-details__summary--mobile-only">
              Previsão de caixa
            </summary>
            <div className="financeiro-overview-details__body">
              <p className="text-small text-muted">Ative o módulo financeiro para ver a previsão de caixa.</p>
            </div>
          </details>
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
    </div>
  );
}
