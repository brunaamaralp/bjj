import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ShoppingBag } from 'lucide-react';
import { channelLabel } from '../../lib/salesSettings';
import { formatBRL } from '../../lib/moneyBr';
import { fetchReportsSalesLight } from '../../lib/reportsLightApi.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import { FINANCE_PAGE_CSS } from '../finance/financePageStyles.js';

export default function ReportsLojaPanel({ academyId, from, to, hasSales }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !hasSales) return;
      setLoading(true);
      setError('');
      try {
        const body = await fetchReportsSalesLight({ academyId, from, to });
        if (active) setData(body);
      } catch (e) {
        if (active) {
          setError(String(e?.message || e));
          setData(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [academyId, from, to, hasSales]);

  const totals = useMemo(
    () => ({
      concludedCount: data?.concludedCount ?? 0,
      concludedTotal: data?.concludedTotal ?? 0,
      cancelCount: data?.cancelCount ?? 0,
    }),
    [data]
  );
  const byChannel = useMemo(
    () =>
      (data?.byChannel || []).map((r) => ({
        canal: r.canal,
        label: channelLabel(r.canal),
        total: r.total,
      })),
    [data]
  );
  const ticketMedio = data?.ticketMedio ?? 0;

  const exportCsv = () => {
    const rows = [
      { metrica: 'Vendas concluídas', valor: totals.concludedCount },
      { metrica: 'Faturamento', valor: totals.concludedTotal },
      { metrica: 'Ticket médio', valor: ticketMedio },
      { metrica: 'Cancelamentos', valor: totals.cancelCount },
      ...byChannel.map((c) => ({ metrica: `Canal — ${c.label}`, valor: c.total })),
    ];
    downloadCsv(rows, `relatorio-loja-${from}_${to}.csv`);
  };

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
        <ErrorBanner message={friendlyError(error, 'load')} onRetry={() => window.location.reload()} />
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
          {data?.truncated ? (
            <p className="text-small text-muted mb-2" role="status">
              Lista de vendas pode estar truncada no servidor — reduza o período se os totais parecerem baixos.
            </p>
          ) : null}
          <div className="flex justify-end mb-2">
            <button type="button" className="btn-outline btn-sm" onClick={exportCsv}>
              <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
              Exportar CSV
            </button>
          </div>
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
