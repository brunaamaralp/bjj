import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EMPRESA_FINANCE_CONFIG_PATH } from '../../lib/financeiroHubTabs.js';
import { Download, Wallet2, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../finance/finance.css';
import { fetchReportsFinanceLightResult } from '../../lib/reportsLightApi.js';
import ReportKpiCard from './shared/ReportKpiCard.jsx';
import { getFinanceRegime, financeRegimeLabel } from '../../lib/financeCompetence.js';
import FinanceRegimeToggle from '../finance/FinanceRegimeToggle.jsx';
import { downloadCsv } from '../../lib/reportsExport.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import { fmt } from '../finance/financeFmt.js';
import { formatPaymentMethod } from '../../lib/paymentMethodLabels.js';
import './reports.css';

function OperationalFinanceReport({ academyId, from, to, periodQuery }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : 'cash'));

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

  const dreLink = `/financeiro?tab=extrato${periodQuery}`;

  if (loading) {
    return (
      <div className="mt-2">
        <PageSkeleton variant="list" rows={3} />
      </div>
    );
  }
  if (permissionDenied) {
    return (
      <EmptyState
        variant="default"
        tone="dashed"
        icon={Lock}
        title="Resumo restrito"
        description="O resumo financeiro detalhado está disponível para gestores. Fale com o responsável pela academia."
        role="status"
      />
    );
  }

  if (error) {
    return (
      <div className="mt-2">
        <ErrorBanner message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const empty =
    Number(totals.received) === 0 &&
    Number(totals.expenses) === 0 &&
    Number(totals.balance) === 0;

  if (empty) {
    return (
      <EmptyState
        variant="default"
        tone="dashed"
        icon={Wallet2}
        title="Nenhuma movimentação liquidada no período"
        description="Registre recebimentos e despesas no Caixa para acompanhar o resumo aqui."
        role="status"
      />
    );
  }

  return (
    <div className="reports-finance-operational mt-2">
      {!isLimited && academyId ? (
        <FinanceRegimeToggle academyId={academyId} value={regime} onChange={setRegime} className="mb-2" />
      ) : null}
      <p className="text-xs text-muted mb-2" role="status">
        {isLimited
          ? 'Resumo operacional do período (valores liquidados no Caixa).'
          : `Movimentações liquidadas · regime ${financeRegimeLabel(regime).toLowerCase()}`}
      </p>
      <p className="mb-3">
        <Link to={dreLink} className="reports-inline-link">
          Ver DRE e fluxo de caixa →
        </Link>
      </p>
      {!isLimited && totals.truncated ? (
        <StatusBanner variant="warning" className="mb-2">
          Período com mais de 2.500 lançamentos — totais podem estar incompletos. Reduza o intervalo de datas.
        </StatusBanner>
      ) : null}
      {!isLimited ? (
        <div className="flex justify-end mb-2">
          <button type="button" className="btn-outline btn-sm" onClick={exportCsv}>
            <Download size={14} aria-hidden />
            Exportar CSV
          </button>
        </div>
      ) : null}
      <div className="reports-kpi-grid">
        <ReportKpiCard
          label="Recebido (líquido)"
          value={fmt(totals.received)}
          highlight="success"
          trendLabel={`${totals.receivedCount} lançamento${totals.receivedCount === 1 ? '' : 's'}`}
        />
        <ReportKpiCard
          label="Despesas"
          value={fmt(totals.expenses)}
          highlight="danger"
          trendLabel={`${totals.expenseCount} lançamento${totals.expenseCount === 1 ? '' : 's'}`}
        />
        <ReportKpiCard label="Saldo do período" value={fmt(totals.balance)} highlight="default" />
      </div>

      {!isLimited && totals.methodRows.length > 0 ? (
        <div className="finance-reports-block mt-4">
          <ReportSectionHeading title="Recebimentos por forma de pagamento" />
          <div>
            {totals.methodRows.map(({ method, total }) => (
              <div key={method} className="finance-reports-row">
                <span>{formatPaymentMethod(method)}</span>
                <span>{fmt(total)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ReportsFinancePanel({ academyId, from, to, hasFinance }) {
  const navigate = useNavigate();

  if (!hasFinance) {
    return (
      <div className="reports-empty card mt-4">
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
      </div>
    );
  }

  const periodQuery = from && to ? `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : '';

  return (
    <div className="card reports-panel-card mt-4">
      <ReportSectionHeading
        title="Resumo financeiro"
        subtitle={`Movimentações liquidadas · ${from} — ${to}`}
      />
      <OperationalFinanceReport academyId={academyId} from={from} to={to} periodQuery={periodQuery} />
    </div>
  );
}
