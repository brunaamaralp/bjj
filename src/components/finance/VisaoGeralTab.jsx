import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useStudentStore } from '../../store/useStudentStore';
import { fetchFinanceSummary, fetchFinanceForecast, fetchMonthlyClosing } from '../../lib/financeTxApi.js';
import { getMonthlyPayments } from '../../lib/studentPayments';
import { getFinanceRegime } from '../../lib/financeCompetence.js';
import { FINANCEIRO_SECTIONS } from '../../lib/financeiroHubTabs.js';
import {
  computeMensalidadesMonthKpis,
  countClosingDivergences,
  currentMonthYm,
  flattenForecastItems,
  forecastNext30Range,
  monthPeriodBounds,
  pctChange,
  previousMonthYm,
  sumForecastInflow,
} from '../../lib/financeiroOverview.js';
import { fetchContracts } from '../../features/contracts/api.js';
import { mapContractDisplayStatusForRecord } from '../../features/contracts/status.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
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

function MetricRow({ label, value, hint }) {
  return (
    <div className="financeiro-overview-metric">
      <span className="financeiro-overview-metric__label">{label}</span>
      <span className="financeiro-overview-metric__value">{value}</span>
      {hint ? <span className="text-small text-muted">{hint}</span> : null}
    </div>
  );
}

export default function VisaoGeralTab({ academyId, financeModule, modules }) {
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const students = useStudentStore((s) => s.students);

  const referenceMonth = useMemo(() => currentMonthYm(), []);
  const { from, to } = useMemo(() => monthPeriodBounds(referenceMonth), [referenceMonth]);
  const prevMonth = useMemo(() => previousMonthYm(referenceMonth), [referenceMonth]);
  const prevBounds = useMemo(() => monthPeriodBounds(prevMonth), [prevMonth]);
  const forecastRange = useMemo(() => forecastNext30Range(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryPrev, setSummaryPrev] = useState(null);
  const [payments, setPayments] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [pendingTxCount, setPendingTxCount] = useState(0);
  const [contractsAwaiting, setContractsAwaiting] = useState(0);
  const [closingDivergences, setClosingDivergences] = useState(0);

  const regime = useMemo(
    () => (academyId ? getFinanceRegime(academyId) : 'cash'),
    [academyId]
  );

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const regimeVal = getFinanceRegime(academyId);
      const tasks = [
        fetchFinanceSummary({ academyId, from, to, regime: regimeVal }),
        fetchFinanceSummary({ academyId, from: prevBounds.from, to: prevBounds.to, regime: regimeVal }),
        getMonthlyPayments(academyId, referenceMonth, {
          activeStudentCount: (students || []).filter((s) => String(s.plan || '').trim()).length,
        }),
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
            month: referenceMonth,
            regime: regimeVal,
          })
        );
      }

      const results = await Promise.allSettled(tasks);
      const [curRes, prevRes, payRes, forecastRes, closingRes] = results;

      if (curRes.status === 'fulfilled') setSummary(curRes.value);
      else setSummary(null);

      if (prevRes.status === 'fulfilled') setSummaryPrev(prevRes.value);
      else setSummaryPrev(null);

      if (payRes.status === 'fulfilled') setPayments(payRes.value || []);
      else setPayments([]);

      if (forecastRes?.status === 'fulfilled') setForecast(forecastRes.value);
      else setForecast(null);

      if (closingRes?.status === 'fulfilled' && closingRes.value) {
        const body = closingRes.value;
        const div = countClosingDivergences({
          payments: body.payments || [],
          transactions: body.transactions || [],
          students: students || [],
          financeConfig,
          referenceMonth,
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
    }
  }, [
    academyId,
    from,
    to,
    prevBounds.from,
    prevBounds.to,
    referenceMonth,
    financeModule,
    forecastRange.from,
    forecastRange.to,
    students,
    financeConfig,
    modules?.finance,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const mensalKpis = useMemo(
    () => computeMensalidadesMonthKpis(students, payments, financeConfig, referenceMonth),
    [students, payments, financeConfig, referenceMonth]
  );

  const forecastItems = useMemo(() => flattenForecastItems(forecast), [forecast]);
  const forecastInflowTotal = useMemo(() => sumForecastInflow(forecastItems), [forecastItems]);
  const forecastTop = useMemo(() => forecastItems.filter((it) => it.flow !== 'out').slice(0, 5), [forecastItems]);

  const balanceDeltaPct = useMemo(
    () => pctChange(summary?.periodBalance, summaryPrev?.periodBalance),
    [summary, summaryPrev]
  );

  const monthLabel = useMemo(() => {
    try {
      const [y, m] = referenceMonth.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } catch {
      return referenceMonth;
    }
  }, [referenceMonth]);

  if (!academyId) {
    return (
      <p className="text-small text-muted" style={{ marginTop: 8 }}>
        Selecione uma academia para ver o resumo.
      </p>
    );
  }

  if (loading) {
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
      <p className="text-small text-muted financeiro-overview__period" role="status">
        Período: {fmtDateBr(from)} — {fmtDateBr(to)} ({monthLabel})
      </p>

      <div className="financeiro-overview-grid">
        <OverviewCard title="Saldo e movimentações" eyebrow="Caixa · mês atual">
          <div className="financeiro-overview-hero">
            <Wallet size={22} aria-hidden />
            <div>
              <p className="financeiro-overview-hero__label">Saldo do período</p>
              <p className="financeiro-overview-hero__value">{fmtMoney(summary?.periodBalance)}</p>
              {balanceDeltaPct != null ? (
                <p className="text-small text-muted" style={{ margin: '4px 0 0' }}>
                  {balanceDeltaPct >= 0 ? (
                    <TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  ) : (
                    <TrendingDown size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  )}
                  {balanceDeltaPct >= 0 ? '+' : ''}
                  {balanceDeltaPct}% vs mês anterior
                </p>
              ) : null}
            </div>
          </div>
          <div className="financeiro-overview-metrics">
            <MetricRow label="Entradas liquidadas" value={fmtMoney(summary?.settledIn)} />
            <MetricRow label="Saídas liquidadas" value={fmtMoney(summary?.settledOut)} />
          </div>
          <Link to="/financeiro?tab=movimentacoes" className="btn-outline btn-sm financeiro-overview-cta">
            Ver movimentações <ArrowRight size={14} />
          </Link>
        </OverviewCard>

        <OverviewCard title="Mensalidades" eyebrow={`Referência ${monthLabel}`}>
          <div className="financeiro-overview-metrics">
            <MetricRow label="Alunos ativos com plano" value={String(mensalKpis.activeWithPlan)} />
            <MetricRow label="Valor esperado no mês" value={fmtMoney(mensalKpis.expectedTotal)} />
            <MetricRow label="Recebido até hoje" value={fmtMoney(mensalKpis.receivedTotal)} />
            <MetricRow
              label="Inadimplentes"
              value={`${mensalKpis.overdueCount} · ${fmtMoney(mensalKpis.overdueOpen)} em aberto`}
            />
          </div>
          <Link
            to={`/financeiro?tab=${FINANCEIRO_SECTIONS.MENSALIDADES}`}
            className="btn-primary btn-sm financeiro-overview-cta"
          >
            Ver Mensalidades <ArrowRight size={14} />
          </Link>
        </OverviewCard>

        {financeModule ? (
          <OverviewCard title="Próximos recebimentos" eyebrow="Previsão · 30 dias">
            <p className="financeiro-overview-forecast-total">
              Total previsto (entradas): <strong>{fmtMoney(forecastInflowTotal)}</strong>
            </p>
            {forecastTop.length > 0 ? (
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
            ) : (
              <p className="text-small text-muted">Nenhuma entrada prevista no período.</p>
            )}
            <Link to="/financeiro?tab=previsao" className="btn-outline btn-sm financeiro-overview-cta">
              Ver Previsão <ArrowRight size={14} />
            </Link>
          </OverviewCard>
        ) : (
          <OverviewCard title="Próximos recebimentos" eyebrow="Indisponível">
            <p className="text-small text-muted">Ative o módulo financeiro para ver a previsão de caixa.</p>
          </OverviewCard>
        )}

        <OverviewCard title="Alertas operacionais" eyebrow="Atenção">
          <ul className="financeiro-overview-alerts">
            {pendingTxCount > 0 ? (
              <li>
                <AlertCircle size={16} aria-hidden />
                <span>
                  <strong>{pendingTxCount}</strong> lançamento(s) pendente(s) de liquidação
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
                  <strong>{closingDivergences}</strong> item(ns) com divergência no fechamento de{' '}
                  {monthLabel}
                </span>
                <Link to="/financeiro?tab=fechamento">Conferir</Link>
              </li>
            ) : null}
            {pendingTxCount === 0 &&
            (!modules?.finance || contractsAwaiting === 0) &&
            (!financeModule || closingDivergences === 0) ? (
              <li className="financeiro-overview-alerts--ok">Nenhum alerta no momento.</li>
            ) : null}
          </ul>
        </OverviewCard>
      </div>
    </div>
  );
}
