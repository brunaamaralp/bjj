import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useSalesStore } from '../../store/useSalesStore';
import { computeHistoryTotals } from '../../lib/salesHistory';
import { channelLabel } from '../../lib/salesSettings';
import { formatBRL } from '../../lib/moneyBr';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import { FINANCE_PAGE_CSS } from '../finance/financePageStyles.js';

function aggregateByChannel(sales) {
  const map = {};
  for (const s of sales || []) {
    if (String(s.status || '').toLowerCase() !== 'concluida') continue;
    const canal = String(s.canal || 'presencial');
    const total = Number(s.total) || 0;
    map[canal] = (map[canal] || 0) + total;
  }
  return Object.entries(map)
    .map(([canal, total]) => ({ canal, label: channelLabel(canal), total }))
    .sort((a, b) => b.total - a.total);
}

export default function ReportsLojaPanel({ academyId, from, to, hasSales }) {
  const navigate = useNavigate();
  const fetchSalesList = useSalesStore((s) => s.fetchSalesList);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSales = useCallback(async () => {
    if (!academyId || !hasSales) return;
    setLoading(true);
    setError('');
    try {
      const list = await fetchSalesList({ from, to });
      setSales(list);
    } catch (e) {
      setError(String(e?.message || e));
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [academyId, from, to, hasSales, fetchSalesList]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const totals = useMemo(() => computeHistoryTotals(sales), [sales]);
  const byChannel = useMemo(() => aggregateByChannel(sales), [sales]);
  const ticketMedio =
    totals.concludedCount > 0 ? totals.concludedTotal / totals.concludedCount : 0;

  if (!hasSales) {
    return (
      <div className="reports-empty card mt-4">
        <EmptyState
          insideCard
          variant="compact"
          tone="solid"
          title="Módulo de vendas desativado"
          description="Ative vendas nas configurações da academia para ver relatórios da loja aqui."
          role="status"
          primaryAction={{
            label: 'Configurar vendas',
            onClick: () => navigate('/empresa?tab=vendas'),
          }}
        />
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
    <div className="mt-4">
      {loading ? (
        <div className="card" style={{ padding: 16 }}>
          <PageSkeleton variant="list" rows={4} />
        </div>
      ) : error ? (
        <ErrorBanner message={friendlyError(error, 'load')} onRetry={() => void loadSales()} />
      ) : totals.concludedCount === 0 && totals.cancelCount === 0 ? (
        <div className="card" style={{ padding: 16 }}>
          <EmptyState
            variant="default"
            tone="dashed"
            icon={ShoppingBag}
            title="Nenhuma venda no período"
            description="As vendas concluídas e canceladas do intervalo selecionado aparecem aqui."
            role="status"
            primaryAction={{
              label: 'Registrar venda',
              onClick: () => navigate('/loja?tab=vendas'),
            }}
          />
        </div>
      ) : (
        <>
          <div className="reports-kpi-grid">
            <div className="reports-kpi-card reports-kpi-card--accent">
              <div className="reports-kpi-card-head">
                <span className="reports-kpi-label">Vendas concluídas</span>
              </div>
              <div className="reports-kpi-value">{totals.concludedCount}</div>
            </div>
            <div className="reports-kpi-card reports-kpi-card--success">
              <div className="reports-kpi-card-head">
                <span className="reports-kpi-label">Faturamento</span>
              </div>
              <div className="reports-kpi-value">{formatBRL(totals.concludedTotal)}</div>
            </div>
            <div className="reports-kpi-card reports-kpi-card--warning">
              <div className="reports-kpi-card-head">
                <span className="reports-kpi-label">Ticket médio</span>
              </div>
              <div className="reports-kpi-value">{formatBRL(ticketMedio)}</div>
            </div>
            <div className="reports-kpi-card reports-kpi-card--danger">
              <div className="reports-kpi-card-head">
                <span className="reports-kpi-label">Cancelamentos</span>
              </div>
              <div className="reports-kpi-value">{totals.cancelCount}</div>
            </div>
          </div>

          {byChannel.length > 0 ? (
            <div className="card mt-4 finance-reports-block" style={{ padding: '16px 18px' }}>
              <h4 className="navi-section-heading" style={{ marginBottom: 12 }}>
                Faturamento por canal
              </h4>
              <div>
                {byChannel.map(({ canal, label, total }) => (
                  <div key={canal} className="finance-reports-row">
                    <span>{label}</span>
                    <span>{formatBRL(total)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
    </>
  );
}
