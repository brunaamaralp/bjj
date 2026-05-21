import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Wallet2 } from 'lucide-react';
import { useAccountingStore } from '../../store/useAccountingStore';
import ReportsTab from '../finance/ReportsTab.jsx';
import { fmt } from '../finance/financeFmt.js';
import { FINANCE_PAGE_CSS } from '../finance/financePageStyles.js';
import { fetchReportsFinanceLight } from '../../lib/reportsLightApi.js';
import { getFinanceRegime, financeRegimeLabel } from '../../lib/financeCompetence.js';
import FinanceRegimeToggle from '../finance/FinanceRegimeToggle.jsx';
import { downloadCsv } from '../../lib/reportsExport.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';

const METHOD_LABELS = {
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};

function OperationalFinanceReport({ academyId, from, to }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [regime, setRegime] = useState(() => (academyId ? getFinanceRegime(academyId) : 'cash'));

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId) {
        setData(null);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const body = await fetchReportsFinanceLight({ academyId, from, to, regime });
        if (active) setData(body);
      } catch (e) {
        if (active) {
          setError('Não foi possível carregar as movimentações.');
          setData(null);
        }
        console.error(e);
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [academyId, from, to, regime]);

  const totals = useMemo(() => {
    if (!data) {
      return { received: 0, expenses: 0, balance: 0, receivedCount: 0, expenseCount: 0, methodRows: [] };
    }
    return {
      received: data.received,
      expenses: data.expenses,
      balance: data.balance,
      receivedCount: data.receivedCount,
      expenseCount: data.expenseCount,
      methodRows: (data.byMethod || []).sort((a, b) => b.total - a.total),
      truncated: data.truncated,
      totalLoaded: data.totalLoaded,
    };
  }, [data]);

  const exportCsv = () => {
    const rows = [
      { metrica: 'Recebido', valor: totals.received },
      { metrica: 'Despesas', valor: totals.expenses },
      { metrica: 'Saldo', valor: totals.balance },
      ...(totals.methodRows || []).map((r) => ({
        metrica: `Por forma — ${METHOD_LABELS[r.method] || r.method}`,
        valor: r.total,
      })),
    ];
    downloadCsv(rows, `relatorio-financeiro-${from}_${to}.csv`);
  };

  if (loading) {
    return (
      <div className="mt-2">
        <PageSkeleton variant="list" rows={3} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-2">
        <ErrorBanner message={error} />
      </div>
    );
  }

  const empty = totals.receivedCount === 0 && totals.expenseCount === 0;

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
      {academyId ? (
        <FinanceRegimeToggle academyId={academyId} value={regime} onChange={setRegime} className="mb-2" />
      ) : null}
      <p className="text-xs text-muted mb-2" role="status">
        Movimentações liquidadas · regime {financeRegimeLabel(regime).toLowerCase()}
      </p>
      {totals.truncated ? (
        <p className="text-small text-muted mb-2" role="status">
          Mostrando até {totals.totalLoaded} lançamentos — o total pode estar incompleto. Reduza o período no
          filtro.
        </p>
      ) : null}
      <div className="flex justify-end mb-2">
        <button type="button" className="btn-outline btn-sm" onClick={exportCsv}>
          <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
          Exportar CSV
        </button>
      </div>
      <div className="reports-kpi-grid">
        <div className="reports-kpi-card reports-kpi-card--success">
          <div className="reports-kpi-card-head">
            <span className="reports-kpi-label">Recebido (líquido)</span>
          </div>
          <div className="reports-kpi-value">{fmt(totals.received)}</div>
          <div className="reports-kpi-trend is-up">
            <span>
              {totals.receivedCount} lançamento{totals.receivedCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="reports-kpi-card reports-kpi-card--danger">
          <div className="reports-kpi-card-head">
            <span className="reports-kpi-label">Despesas</span>
          </div>
          <div className="reports-kpi-value">{fmt(totals.expenses)}</div>
          <div className="reports-kpi-trend is-down">
            <span>
              {totals.expenseCount} lançamento{totals.expenseCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="reports-kpi-card reports-kpi-card--accent">
          <div className="reports-kpi-card-head">
            <span className="reports-kpi-label">Saldo do período</span>
          </div>
          <div className="reports-kpi-value">{fmt(totals.balance)}</div>
        </div>
      </div>

      {totals.methodRows.length > 0 ? (
        <div className="finance-reports-block mt-4">
          <h4>Recebimentos por forma de pagamento</h4>
          <div>
            {totals.methodRows.map(({ method, total }) => (
              <div key={method} className="finance-reports-row">
                <span>{METHOD_LABELS[method] || method}</span>
                <span>{fmt(total)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ReportsFinancePanel({ academyId, from, to, hasFinance, isOwner }) {
  const navigate = useNavigate();
  const loadByAcademy = useAccountingStore((s) => s.loadByAcademy);

  useEffect(() => {
    if (academyId && isOwner && hasFinance) loadByAcademy(academyId);
  }, [academyId, isOwner, hasFinance, loadByAcademy]);

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
            onClick: () => navigate('/empresa?tab=financeiro'),
          }}
        />
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
      <div className="card mt-4" style={{ padding: '16px 18px' }}>
        {isOwner ? (
          <>
            <p className="text-xs text-light" style={{ marginBottom: 12 }}>
              Demonstrações com base no livro razão · período {from} — {to}
            </p>
            <ReportsTab
              academyId={academyId}
              periodFrom={from}
              periodTo={to}
              embedded
              onGoToLancamentos={() => navigate('/caixa?tab=razao')}
            />
          </>
        ) : (
          <>
            <h3 className="navi-section-heading" style={{ marginBottom: 8 }}>
              Resumo operacional
            </h3>
            <p className="text-xs text-light" style={{ marginBottom: 12 }}>
              Movimentações liquidadas no Caixa · {from} — {to}
            </p>
            <OperationalFinanceReport academyId={academyId} from={from} to={to} />
          </>
        )}
      </div>
    </>
  );
}
