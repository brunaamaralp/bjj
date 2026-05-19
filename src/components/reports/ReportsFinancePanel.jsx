import React, { useEffect, useMemo, useState } from 'react';
import { Query } from 'appwrite';
import { useNavigate } from 'react-router-dom';
import { Wallet2 } from 'lucide-react';
import { databases, DB_ID, FINANCIAL_TX_COL } from '../../lib/appwrite';
import { useAccountingStore } from '../../store/useAccountingStore';
import ReportsTab from '../finance/ReportsTab.jsx';
import { fmt } from '../finance/financeFmt.js';
import { FINANCE_PAGE_CSS } from '../finance/financePageStyles.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';

function computeOperationalTotals(transactions) {
  let received = 0;
  let expenses = 0;
  let receivedCount = 0;
  let expenseCount = 0;
  const byMethod = {};

  for (const tx of transactions || []) {
    if (String(tx.status || '').toLowerCase() === 'cancelled') continue;
    if (String(tx.status || '').toLowerCase() !== 'settled') continue;

    const isExpense = String(tx.type || '').toLowerCase() === 'expense';
    const net = Number(tx.net);
    const gross = Number(tx.gross);
    const amt = Number.isFinite(net) ? net : Number.isFinite(gross) ? gross : 0;

    if (isExpense) {
      expenses += amt;
      expenseCount += 1;
    } else {
      received += amt;
      receivedCount += 1;
      const method = String(tx.method || 'outro').toLowerCase();
      byMethod[method] = (byMethod[method] || 0) + amt;
    }
  }

  const methodRows = Object.entries(byMethod)
    .map(([method, total]) => ({ method, total }))
    .sort((a, b) => b.total - a.total);

  return {
    received,
    expenses,
    balance: received - expenses,
    receivedCount,
    expenseCount,
    methodRows,
  };
}

const METHOD_LABELS = {
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};

function OperationalFinanceReport({ academyId, from, to }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !FINANCIAL_TX_COL) {
        setTransactions([]);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const filters = [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderDesc('$createdAt'),
        ];
        if (from) filters.push(Query.greaterThanEqual('$createdAt', new Date(`${from}T00:00:00`).toISOString()));
        if (to) {
          const d = new Date(`${to}T00:00:00`);
          d.setDate(d.getDate() + 1);
          filters.push(Query.lessThan('$createdAt', d.toISOString()));
        }
        const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, filters);
        if (!active) return;
        setTransactions(
          (res.documents || []).map((d) => ({
            type: d.type || '',
            method: d.method || '',
            gross: Number(d.gross || 0),
            net: Number(d.net || 0),
            status: d.status || '',
          }))
        );
      } catch (e) {
        if (active) {
          setError('Não foi possível carregar as movimentações.');
          setTransactions([]);
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
  }, [academyId, from, to]);

  const totals = useMemo(() => computeOperationalTotals(transactions), [transactions]);

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
