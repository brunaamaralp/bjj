import React, { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import { EMPRESA_FINANCE_CONFIG_PATH, EMPRESA_FINANCE_RAZAO_PATH } from '../../lib/financeiroHubTabs.js';

import { Wallet2, Lock, TrendingDown, Scale, Clock } from 'lucide-react';

import { useNavigate } from 'react-router-dom';

import { fetchReportsFinanceLightResult } from '../../lib/reportsLightApi.js';

import { fetchReceivables } from '../../lib/financeTxApi.js';

import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';

import { getFinanceRegime, financeRegimeLabel } from '../../lib/financeCompetence.js';

import FinanceRegimeToggle from '../finance/FinanceRegimeToggle.jsx';

import { downloadCsv } from '../../lib/reportsExport.js';

import { kpiRagProps } from '../../lib/reportKpiGoalsUi.js';

import { useRegisterReportsExport } from '../../hooks/useReportsExportSlot.jsx';

import EmptyState from '../shared/EmptyState.jsx';

import ErrorBanner from '../shared/ErrorBanner.jsx';

import StatusBanner from '../shared/StatusBanner.jsx';

import ReportsPanelSection from './shared/ReportsPanelSection.jsx';

import ReportsPanelShell from './shared/ReportsPanelShell.jsx';

import { fmt } from '../finance/financeFmt.js';

import { formatPaymentMethod } from '../../lib/paymentMethodLabels.js';

import ReportsTab from '../finance/ReportsTab.jsx';

import './reports.css';



function OperationalFinanceReport({ academyId, from, to, periodQuery, kpiGoals = {} }) {

  const [data, setData] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [permissionDenied, setPermissionDenied] = useState(false);

  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : 'cash'));

  const [receivablesTotal, setReceivablesTotal] = useState(null);



  const load = async () => {

    if (!academyId) {

      setData(null);

      return;

    }

    setLoading(true);

    setError('');

    setPermissionDenied(false);

    try {

      const result = await fetchReportsFinanceLightResult({ academyId, from, to, regime });

      if (result.permissionDenied) {

        setPermissionDenied(true);

        setData(null);

        return;

      }

      if (!result.ok) {

        setError('Não foi possível carregar as movimentações.');

        setData(null);

        return;

      }

      setData(result.data);

    } catch (e) {

      setError('Não foi possível carregar as movimentações.');

      setData(null);

      console.error(e);

    } finally {

      setLoading(false);

    }

  };



  useEffect(() => {

    void load();

  }, [academyId, from, to, regime]);



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

  }, [academyId, to]);



  const isLimited = Boolean(data?.limited || data?.scope === 'basic');



  const totals = useMemo(() => {

    if (!data || data.permissionDenied) {

      return { received: 0, expenses: 0, balance: 0, receivedCount: 0, expenseCount: 0, methodRows: [] };

    }

    return {

      received: data.received ?? data.totalReceived ?? 0,

      expenses: data.expenses ?? data.totalExpenses ?? 0,

      balance: data.balance ?? (Number(data.received ?? data.totalReceived) || 0) - (Number(data.expenses ?? data.totalExpenses) || 0),

      receivedCount: data.receivedCount ?? 0,

      expenseCount: data.expenseCount ?? 0,

      methodRows: isLimited ? [] : (data.byMethod || []).sort((a, b) => b.total - a.total),

      truncated: data.truncated,

      totalLoaded: data.totalLoaded,

    };

  }, [data, isLimited]);



  const exportCsv = () => {

    const rows = [

      { metrica: 'Recebido', valor: totals.received },

      { metrica: 'Despesas', valor: totals.expenses },

      { metrica: 'Saldo', valor: totals.balance },

      ...(totals.methodRows || []).map((r) => ({

        metrica: `Por forma — ${formatPaymentMethod(r.method)}`,

        valor: r.total,

      })),

    ];

    downloadCsv(rows, `relatorio-financeiro-${from}_${to}.csv`);

  };



  const empty =

    Number(totals.received) === 0 &&

    Number(totals.expenses) === 0 &&

    Number(totals.balance) === 0;



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

        {!isLimited && academyId ? (

          <FinanceRegimeToggle academyId={academyId} value={regime} onChange={setRegime} className="mb-2" />

        ) : null}

        <p className="reports-panel-note" role="status">

          {isLimited

            ? 'Resumo operacional do período (valores liquidados no Caixa).'

            : `Movimentações liquidadas · regime ${financeRegimeLabel(regime).toLowerCase()}`}

        </p>

        <p className="mb-0">

          <Link to={EMPRESA_FINANCE_RAZAO_PATH} className="reports-inline-link">

            Abrir razão contábil →

          </Link>

        </p>

        {!isLimited && totals.truncated ? (

          <StatusBanner variant="warning" className="mb-0">

            Período com mais de 2.500 lançamentos — totais podem estar incompletos. Reduza o intervalo de datas.

          </StatusBanner>

        ) : null}

        <div className="reports-kpi-grid">

          <ReportKpiCard

            label="Recebido"

            value={fmt(totals.received)}

            sublabel={`${totals.receivedCount} lançamento${totals.receivedCount === 1 ? '' : 's'}`}

            icon={<Wallet2 size={20} strokeWidth={2.25} />}

          />

          <ReportKpiCard

            label="Despesas"

            value={fmt(totals.expenses)}

            sublabel={`${totals.expenseCount} lançamento${totals.expenseCount === 1 ? '' : 's'}`}

            icon={<TrendingDown size={20} strokeWidth={2.25} />}

          />

          <ReportKpiCard

            label="Saldo do período"

            value={fmt(totals.balance)}

            icon={<Scale size={20} strokeWidth={2.25} />}

            {...kpiRagProps('financeBalance', Number(totals.balance), kpiGoals)}

          />

          <ReportKpiCard

            label="A receber"

            value={receivablesTotal != null ? fmt(receivablesTotal) : '—'}

            icon={<Clock size={20} strokeWidth={2.25} />}

          />

        </div>

      </ReportsPanelSection>



      {!isLimited && totals.methodRows.length > 0 ? (

        <ReportsPanelSection title="Recebimentos por forma de pagamento">

          <div className="reports-kv-list">

            {totals.methodRows.map(({ method, total }) => (

              <div key={method} className="reports-kv-row">

                <span>{formatPaymentMethod(method)}</span>

                <span className="reports-kv-row__value">{fmt(total)}</span>

              </div>

            ))}

          </div>

        </ReportsPanelSection>

      ) : null}

    </>

  );

}



export default function ReportsFinancePanel({
  academyId,
  from,
  to,
  hasFinance,
  isOwner = false,
  kpiGoals = {},
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



  const periodQuery = from && to ? `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : '';



  const showAccountingStatements = isOwner && from && to;

  return (
    <ReportsPanelShell>
      <OperationalFinanceReport
        academyId={academyId}
        from={from}
        to={to}
        periodQuery={periodQuery}
        kpiGoals={kpiGoals}
      />

      {showAccountingStatements ? (
        <ReportsPanelSection
          title="DRE e fluxo de caixa"
          subtitle={`Demonstrativos pelo livro razão · ${from} — ${to}`}
        >
          <ReportsTab
            academyId={academyId}
            embedded
            periodFrom={from}
            periodTo={to}
            onGoToLancamentos={() => navigate('/financeiro?tab=movimentacoes')}
          />
        </ReportsPanelSection>
      ) : null}
    </ReportsPanelShell>
  );
}

