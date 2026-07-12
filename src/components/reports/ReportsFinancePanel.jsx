import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import { Wallet2, Lock, TrendingDown, Scale, Clock } from 'lucide-react';
import { EMPRESA_FINANCE_CONFIG_PATH, buildFinanceLancamentosPath } from '../../lib/financeiroHubTabs.js';
import { fetchReportsFinanceLightResult } from '../../lib/reportsLightApi.js';
import { fetchReceivables } from '../../lib/financeTxApi.js';
import { previousPeriodRange } from '../../lib/reportsPeriod.js';
import { pctVar } from '../../lib/reportsFunnelUtils.js';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportsFinanceDrillDialog from './ReportsFinanceDrillDialog.jsx';
import ReportsChart, { REPORTS_CHART_AXIS_TICK, ReportsChartTooltip } from './shared/ReportsChart.jsx';
import { getFinanceRegime, financeRegimeLabel } from '../../lib/financeCompetence.js';
import FinanceRegimeToggle from '../finance/FinanceRegimeToggle.jsx';
import { downloadCsv } from '../../lib/reportsExport.js';
import { kpiRagProps } from '../../lib/reportKpiGoalsUi.js';
import { reportKpiTooltip } from '../../lib/reportKpiTooltip.js';
import { useRegisterReportsExport } from '../../hooks/useReportsExportSlot.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import { fmt } from '../finance/financeFmt.js';
import { formatPaymentMethod } from '../../lib/paymentMethodLabels.js';
import { friendlyError } from '../../lib/errorMessages.js';
import './reports.css';

function receivablesMonthLabel(toYmd) {
  const ymd = String(toYmd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'A receber';
  const [y, m] = ymd.split('-').map(Number);
  const short = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  return `A receber (${short})`;
}

function financeTrend(cur, prev, hasPrev) {
  if (!hasPrev) return null;
  if (prev === 0) return cur > 0 ? 100 : null;
  return pctVar(cur, prev);
}

function FinanceReportLinks({ from, to }) {
  const receivablesMonth = String(to || '').slice(0, 7);
  const lancamentosPath = buildFinanceLancamentosPath({ from, to });
  const receivablesPath = receivablesMonth
    ? `/financeiro?tab=a-receber&month=${encodeURIComponent(receivablesMonth)}`
    : '/financeiro?tab=a-receber';

  return (
    <nav className="reports-finance-links" aria-label="Atalhos financeiros">
      <Link to={lancamentosPath} className="reports-inline-link">
        Lançamentos
      </Link>
      <Link to="/financeiro?tab=dre" className="reports-inline-link">
        DRE e DFC
      </Link>
      <Link to="/financeiro?tab=fechamento" className="reports-inline-link">
        Fechamento
      </Link>
      <Link to={receivablesPath} className="reports-inline-link">
        A receber
      </Link>
    </nav>
  );
}

function OperationalFinanceReport({
  academyId,
  from,
  to,
  preset = 'month',
  kpiGoals = {},
  refreshNonce = 0,
  onLoadingChange,
}) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [prevTotals, setPrevTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : 'cash'));
  const [receivablesTotal, setReceivablesTotal] = useState(null);
  const [drillKey, setDrillKey] = useState(null);

  const load = useCallback(async () => {
    if (!academyId) {
      setData(null);
      setPrevTotals(null);
      return;
    }
    setLoading(true);
    setError('');
    setPermissionDenied(false);
    try {
      const prev = previousPeriodRange(preset, { from, to });
      const [result, prevResult] = await Promise.all([
        fetchReportsFinanceLightResult({ academyId, from, to, regime }),
        fetchReportsFinanceLightResult({ academyId, from: prev.from, to: prev.to, regime }),
      ]);
      if (result.permissionDenied) {
        setPermissionDenied(true);
        setData(null);
        setPrevTotals(null);
        return;
      }
      if (!result.ok) {
        setError(friendlyError(result.error, 'load'));
        setData(null);
        setPrevTotals(null);
        return;
      }
      setData(result.data);
      if (prevResult.ok && !prevResult.permissionDenied && prevResult.data) {
        setPrevTotals(prevResult.data);
      } else {
        setPrevTotals(null);
      }
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setData(null);
      setPrevTotals(null);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [academyId, from, to, regime, preset]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (!academyId || !to) {
      setReceivablesTotal(null);
      return undefined;
    }
    let active = true;
    const month = String(to).slice(0, 7);
    fetchReceivables({ academyId, month })
      .then((body) => {
        if (active) setReceivablesTotal(Number(body?.summary?.total) || 0);
      })
      .catch(() => {
        if (active) setReceivablesTotal(null);
      });
    return () => {
      active = false;
    };
  }, [academyId, to, refreshNonce]);

  const isLimited = Boolean(data?.limited || data?.scope === 'basic');
  const hasPrev = Boolean(prevTotals);

  const totals = useMemo(() => {
    if (!data || data.permissionDenied) {
      return {
        received: 0,
        expenses: 0,
        balance: 0,
        receivedCount: 0,
        expenseCount: 0,
        methodRows: [],
        revenue: null,
        weeklySeries: [],
      };
    }
    const rawMethods = isLimited ? [] : data.byMethod || [];
    const sorted = [...rawMethods].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
    const methodTotal = sorted.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const methodRows = sorted.map((row) => {
      const total = Number(row.total) || 0;
      return {
        method: row.method,
        total,
        pct: methodTotal > 0 ? Math.round((total / methodTotal) * 100) : 0,
      };
    });

    return {
      received: data.received ?? data.totalReceived ?? 0,
      expenses: data.expenses ?? data.totalExpenses ?? 0,
      balance:
        data.balance ??
        (Number(data.received ?? data.totalReceived) || 0) -
          (Number(data.expenses ?? data.totalExpenses) || 0),
      receivedCount: data.receivedCount ?? 0,
      expenseCount: data.expenseCount ?? 0,
      methodRows,
      truncated: data.truncated,
      totalLoaded: data.totalLoaded,
      revenue: isLimited ? null : data.revenueBreakdown || null,
      weeklySeries: isLimited ? [] : data.weeklySeries || [],
    };
  }, [data, isLimited]);

  const hasWeeklyChart = useMemo(
    () =>
      !isLimited &&
      totals.weeklySeries.some((row) => Number(row.received) > 0 || Number(row.expenses) > 0),
    [isLimited, totals.weeklySeries]
  );

  const prevReceived = Number(prevTotals?.received ?? prevTotals?.totalReceived) || 0;
  const prevExpenses = Number(prevTotals?.expenses ?? prevTotals?.totalExpenses) || 0;
  const prevBalance =
    prevTotals?.balance != null
      ? Number(prevTotals.balance) || 0
      : prevReceived - prevExpenses;

  const receivedTrend = financeTrend(Number(totals.received), prevReceived, hasPrev);
  const expensesTrend = financeTrend(Number(totals.expenses), prevExpenses, hasPrev);
  const balanceTrend = financeTrend(Number(totals.balance), prevBalance, hasPrev);

  const balanceHighlight =
    Number(totals.balance) > 0 ? 'success' : Number(totals.balance) < 0 ? 'danger' : 'default';

  const showMdr =
    !isLimited && totals.revenue && Number(totals.revenue.fees) > 0;

  const exportCsv = () => {
    const rows = [
      { metrica: 'Período', valor: `${from} — ${to}` },
      { metrica: 'Regime', valor: financeRegimeLabel(regime) },
      { metrica: 'Recebido', valor: totals.received },
      { metrica: 'Despesas', valor: totals.expenses },
      { metrica: 'Saldo', valor: totals.balance },
      ...(showMdr
        ? [
            { metrica: 'Faturamento bruto', valor: totals.revenue.grossIn },
            { metrica: 'Taxas (MDR)', valor: totals.revenue.fees },
            { metrica: 'Recebido líquido', valor: totals.revenue.netIn },
          ]
        : []),
      ...(totals.methodRows || []).map((r) => ({
        metrica: `Forma — ${formatPaymentMethod(r.method)}`,
        valor: r.total,
        percentual: `${r.pct}%`,
      })),
    ];
    downloadCsv(rows, `relatorio-financeiro-${from}_${to}.csv`);
  };

  const empty =
    Number(totals.received) === 0 &&
    Number(totals.expenses) === 0 &&
    Number(totals.balance) === 0;

  const goToLancamentos = () => {
    navigate(buildFinanceLancamentosPath({ from, to, regime }));
  };

  useRegisterReportsExport(
    !loading && !error && !permissionDenied && !empty && !isLimited
      ? {
          disabled: false,
          loading,
          title: 'Exportar CSV financeiro',
          onExport: exportCsv,
        }
      : null
  );

  if (loading) {
    return (
      <ReportsPanelSection aria-busy="true">
        <div className="reports-kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <ReportKpiCardSkeleton key={i} />
          ))}
        </div>
      </ReportsPanelSection>
    );
  }

  if (permissionDenied) {
    return (
      <ReportsPanelSection className="reports-empty">
        <EmptyState
          insideCard
          variant="default"
          tone="dashed"
          icon={Lock}
          title="Resumo restrito"
          description="O resumo financeiro detalhado está disponível para gestores. Fale com o responsável pela academia."
          role="status"
        />
      </ReportsPanelSection>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={() => void load()} />;
  }

  if (empty) {
    return (
      <ReportsPanelSection className="reports-empty">
        <EmptyState
          insideCard
          variant="default"
          tone="dashed"
          icon={Wallet2}
          title="Nenhuma movimentação liquidada no período"
          description="Registre recebimentos e despesas no Caixa para acompanhar o resumo aqui."
          role="status"
          primaryAction={{
            label: 'Ir para Lançamentos',
            onClick: goToLancamentos,
          }}
        />
      </ReportsPanelSection>
    );
  }

  return (
    <>
      <ReportsPanelSection
        title="Resumo financeiro"
        subtitle={`Movimentações liquidadas · ${from} — ${to}`}
      >
        {isLimited ? (
          <StatusBanner variant="info" className="mb-2">
            Resumo básico — detalhes, exportação e breakdown disponíveis para gestores da academia.
          </StatusBanner>
        ) : null}

        {!isLimited && academyId ? (
          <FinanceRegimeToggle academyId={academyId} value={regime} onChange={setRegime} className="mb-2" />
        ) : null}

        <p className="reports-panel-note" role="status">
          {isLimited
            ? 'Resumo operacional do período (valores liquidados no Caixa).'
            : `Movimentações liquidadas · regime ${financeRegimeLabel(regime).toLowerCase()}`}
        </p>

        {!isLimited && totals.truncated ? (
          <StatusBanner variant="warning" className="mb-0">
            Período com mais de 2.500 lançamentos — totais podem estar incompletos. Reduza o intervalo de
            datas.
          </StatusBanner>
        ) : null}

        <div className="reports-kpi-grid">
          <ReportKpiCard
            label="Recebido"
            value={fmt(totals.received)}
            sublabel={`${totals.receivedCount} lançamento${totals.receivedCount === 1 ? '' : 's'}`}
            icon={<Wallet2 size={20} strokeWidth={2.25} />}
            tooltip={reportKpiTooltip('financeReceived', { preset })}
            trend={receivedTrend}
            trendLabel={receivedTrend != null ? 'vs. período anterior' : null}
            onClick={!isLimited ? () => setDrillKey('received') : null}
            {...kpiRagProps('financeReceived', Number(totals.received), kpiGoals)}
          />
          <ReportKpiCard
            label="Despesas"
            value={fmt(totals.expenses)}
            sublabel={`${totals.expenseCount} lançamento${totals.expenseCount === 1 ? '' : 's'}`}
            icon={<TrendingDown size={20} strokeWidth={2.25} />}
            tooltip={reportKpiTooltip('financeExpenses', { preset })}
            trend={expensesTrend}
            trendLabel={expensesTrend != null ? 'vs. período anterior' : null}
            onClick={!isLimited ? () => setDrillKey('expenses') : null}
            {...kpiRagProps('financeExpenses', Number(totals.expenses), kpiGoals)}
          />
          <ReportKpiCard
            label="Saldo do período"
            value={fmt(totals.balance)}
            icon={<Scale size={20} strokeWidth={2.25} />}
            highlight={balanceHighlight}
            tooltip={reportKpiTooltip('financeBalance', { preset })}
            trend={balanceTrend}
            trendLabel={balanceTrend != null ? 'vs. período anterior' : null}
            {...kpiRagProps('financeBalance', Number(totals.balance), kpiGoals)}
          />
          <ReportKpiCard
            label={receivablesMonthLabel(to)}
            value={receivablesTotal != null ? fmt(receivablesTotal) : '—'}
            icon={<Clock size={20} strokeWidth={2.25} />}
            tooltip={reportKpiTooltip('financeReceivablesSnapshot', { preset })}
          />
        </div>

        <FinanceReportLinks from={from} to={to} />
      </ReportsPanelSection>

      {hasWeeklyChart ? (
        <ReportsPanelSection
          title="Evolução semanal"
          subtitle={`Recebido vs despesas · ${from} — ${to}`}
          className="reports-panel-section--chart"
        >
          <ReportsChart height={260}>
            <BarChart data={totals.weeklySeries} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e8e5f5)" />
              <XAxis dataKey="label" tick={REPORTS_CHART_AXIS_TICK} />
              <YAxis
                tick={REPORTS_CHART_AXIS_TICK}
                tickFormatter={(v) =>
                  Number(v).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 0 })
                }
              />
              <Tooltip
                content={
                  <ReportsChartTooltip
                    formatter={(value) => fmt(value)}
                  />
                }
              />
              <Legend />
              <Bar
                dataKey="received"
                name="Recebido"
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="expenses"
                name="Despesas"
                fill="var(--danger, #dc2626)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ReportsChart>
        </ReportsPanelSection>
      ) : null}

      {showMdr ? (
        <ReportsPanelSection title="Faturamento e taxas">
          <div className="reports-kv-list">
            <div className="reports-kv-row">
              <span>Faturamento bruto</span>
              <span className="reports-kv-row__value">{fmt(totals.revenue.grossIn)}</span>
            </div>
            <div className="reports-kv-row">
              <span>Taxas (MDR)</span>
              <span className="reports-kv-row__value">{fmt(totals.revenue.fees)}</span>
            </div>
            <div className="reports-kv-row">
              <span>Recebido líquido</span>
              <span className="reports-kv-row__value">{fmt(totals.revenue.netIn)}</span>
            </div>
          </div>
        </ReportsPanelSection>
      ) : null}

      {!isLimited && totals.methodRows.length > 0 ? (
        <ReportsPanelSection title="Recebimentos por forma de pagamento">
          <div className="reports-kv-list">
            {totals.methodRows.map(({ method, total, pct }) => (
              <div key={method} className="reports-kv-row">
                <span>
                  {formatPaymentMethod(method)} · {pct}%
                </span>
                <span className="reports-kv-row__value">{fmt(total)}</span>
              </div>
            ))}
          </div>
        </ReportsPanelSection>
      ) : null}

      <ReportsFinanceDrillDialog
        drillKey={drillKey}
        academyId={academyId}
        from={from}
        to={to}
        regime={regime}
        onClose={() => setDrillKey(null)}
      />
    </>
  );
}

export default function ReportsFinancePanel({
  academyId,
  from,
  to,
  preset = 'month',
  hasFinance,
  kpiGoals = {},
  refreshNonce = 0,
  onLoadingChange,
}) {
  const navigate = useNavigate();

  if (!hasFinance) {
    return (
      <ReportsPanelShell>
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="compact"
            tone="solid"
            title="Módulo financeiro desativado"
            description="Ative o financeiro nas configurações da academia para ver relatórios aqui."
            role="status"
            primaryAction={{
              label: 'Configurar financeiro',
              onClick: () => navigate(EMPRESA_FINANCE_CONFIG_PATH),
            }}
          />
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  return (
    <ReportsPanelShell>
      <OperationalFinanceReport
        academyId={academyId}
        from={from}
        to={to}
        preset={preset}
        kpiGoals={kpiGoals}
        refreshNonce={refreshNonce}
        onLoadingChange={onLoadingChange}
      />
    </ReportsPanelShell>
  );
}
