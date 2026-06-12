import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, ShoppingBag } from 'lucide-react';
import { channelLabel } from '../../lib/salesSettings';
import { formatBRL } from '../../lib/moneyBr';
import { fetchReportsSalesLight } from '../../lib/reportsLightApi.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import ReportKpiCard from './shared/ReportKpiCard.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import './reports.css';

export default function ReportsLojaPanel({ academyId, from, to, hasSales }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productsModalOpen, setProductsModalOpen] = useState(false);
  const [buyersModalOpen, setBuyersModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!academyId || !hasSales) return;
    setLoading(true);
    setError('');
    try {
      const body = await fetchReportsSalesLight({ academyId, from, to });
      setData(body);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [academyId, from, to, hasSales]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totals = useMemo(
    () => ({
      concludedCount: data?.concludedCount ?? 0,
      concludedTotal: data?.concludedTotal ?? 0,
      cancelCount: data?.cancelCount ?? 0,
    }),
    [data]
  );

  const byChannel = useMemo(() => {
    const total = Number(data?.concludedTotal) || 0;
    return (data?.byChannel || []).map((r) => {
      const amt = Number(r.total) || 0;
      return {
        canal: r.canal,
        label: channelLabel(r.canal),
        total: amt,
        pct: total > 0 ? Math.round((amt / total) * 100) : 0,
      };
    });
  }, [data]);

  const topProducts = useMemo(() => {
    const total = Number(data?.concludedTotal) || 0;
    return (data?.byProduct || [])
      .map((p) => ({
        id: p.product_id,
        nome: p.nome || 'Produto',
        qty: Number(p.qty) || 0,
        total: Number(p.total) || 0,
        pct: total > 0 ? Math.round(((Number(p.total) || 0) / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const top5 = useMemo(() => topProducts.slice(0, 5), [topProducts]);
  const topBuyers = useMemo(() => {
    const total = Number(data?.concludedTotal) || 0;
    return (data?.byBuyer || [])
      .map((b) => ({
        id: b.aluno_id || `walkin:${b.nome}`,
        aluno_id: b.aluno_id || null,
        nome: b.nome || 'Cliente avulso',
        vendas: Number(b.vendas) || 0,
        total: Number(b.total) || 0,
        ultima_compra: b.ultima_compra || null,
        pct: total > 0 ? Math.round(((Number(b.total) || 0) / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total || b.vendas - a.vendas);
  }, [data]);
  const topBuyers5 = useMemo(() => topBuyers.slice(0, 5), [topBuyers]);
  const ticketMedio = data?.ticketMedio ?? 0;

  const formatBuyerDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const exportCsv = () => {
    const rows = [
      { metrica: 'Vendas concluídas', valor: totals.concludedCount },
      { metrica: 'Faturamento', valor: totals.concludedTotal },
      { metrica: 'Ticket médio', valor: ticketMedio },
      { metrica: 'Cancelamentos', valor: totals.cancelCount },
      ...byChannel.map((c) => ({ metrica: `Canal — ${c.label}`, valor: c.total })),
      ...topProducts.map((p) => ({
        metrica: `Produto — ${p.nome}`,
        valor: p.total,
        quantidade: p.qty,
      })),
      ...topBuyers.map((b) => ({
        metrica: `Comprador — ${b.nome}`,
        valor: b.total,
        vendas: b.vendas,
        ultima_compra: b.ultima_compra || '',
      })),
    ];
    downloadCsv(rows, `relatorio-loja-${from}_${to}.csv`);
  };

  if (!hasSales) {
    return (
      <ReportsPanelShell>
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="compact"
            tone="solid"
            title="Módulo de vendas desativado"
            description="O módulo de vendas não está ativo nesta academia."
            role="status"
            primaryAction={{
              label: 'Ver assinatura',
              onClick: () => navigate('/conta?tab=assinatura'),
            }}
          />
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  const exportAction = (
    <button
      type="button"
      className="btn-outline btn-sm reports-export-btn reports-export-btn--icon"
      onClick={exportCsv}
      aria-label="Exportar CSV"
      title="Exportar CSV"
    >
      <Download size={16} aria-hidden />
    </button>
  );

  const buyerColumns = [
    {
      key: 'nome',
      label: 'Cliente',
      render: (row) =>
        row.aluno_id ? (
          <Link to={`/student/${row.aluno_id}`} className="reports-inline-link">
            {row.nome}
          </Link>
        ) : (
          row.nome
        ),
    },
    { key: 'vendas', label: 'Compras', align: 'right' },
    {
      key: 'total',
      label: 'Total gasto',
      align: 'right',
      render: (row) => formatBRL(row.total),
    },
    {
      key: 'pct',
      label: '% do total',
      align: 'right',
      render: (row) => `${row.pct}%`,
    },
    {
      key: 'ultima_compra',
      label: 'Última compra',
      align: 'right',
      render: (row) => formatBuyerDate(row.ultima_compra),
    },
  ];

  const productColumns = [
    { key: 'nome', label: 'Produto' },
    { key: 'qty', label: 'Qtd vendida', align: 'right' },
    {
      key: 'total',
      label: 'Faturamento',
      align: 'right',
      render: (row) => formatBRL(row.total),
    },
    {
      key: 'pct',
      label: '% do total',
      align: 'right',
      render: (row) => `${row.pct}%`,
    },
  ];

  return (
    <ReportsPanelShell>
      {loading ? (
        <ReportsPanelSection>
          <PageSkeleton variant="list" rows={4} />
        </ReportsPanelSection>
      ) : error ? (
        <ErrorBanner message={friendlyError(error, 'load')} onRetry={() => void loadData()} />
      ) : totals.concludedCount === 0 && totals.cancelCount === 0 ? (
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="default"
            tone="dashed"
            icon={ShoppingBag}
            title="Nenhuma venda no período"
            description="As vendas concluídas e canceladas do intervalo selecionado aparecem aqui."
            role="status"
            primaryAction={{
              label: 'Registrar venda',
              onClick: () =>
                navigate('/loja?tab=vendas', {
                  state: { subtab: 'historico', dateFrom: from, dateTo: to },
                }),
            }}
          />
        </ReportsPanelSection>
      ) : (
        <>
          {data?.truncated ? (
            <p className="reports-panel-note" role="status">
              Lista de vendas pode estar truncada no servidor — reduza o período se os totais parecerem baixos.
            </p>
          ) : null}
          <ReportsPanelSection
            title="Vendas no período"
            subtitle={`${from} — ${to}`}
            action={exportAction}
          >
            <div className="reports-kpi-grid">
              <ReportKpiCard label="Vendas concluídas" value={totals.concludedCount} highlight="default" />
              <ReportKpiCard label="Faturamento" value={formatBRL(totals.concludedTotal)} highlight="success" />
              <ReportKpiCard label="Ticket médio" value={formatBRL(ticketMedio)} highlight="warning" />
              <ReportKpiCard label="Cancelamentos" value={totals.cancelCount} highlight="danger" />
            </div>
          </ReportsPanelSection>

          <ReportsPanelSection
            title="Quem mais compra"
            subtitle="Ranking por faturamento de produtos no período (alunos e clientes avulsos)."
          >
            <ReportDataTable
              columns={buyerColumns}
              rows={topBuyers5}
              emptyMessage="Nenhuma compra vinculada a clientes no período."
              loading={false}
              footer={
                topBuyers.length > 5 ? (
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => setBuyersModalOpen(true)}
                  >
                    Ver todos →
                  </button>
                ) : null
              }
            />
          </ReportsPanelSection>

          <ReportsPanelSection title="Produtos mais vendidos">
            <ReportDataTable
              columns={productColumns}
              rows={top5}
              emptyMessage="Nenhum produto vendido no período."
              loading={false}
              footer={
                topProducts.length > 5 ? (
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => setProductsModalOpen(true)}
                  >
                    Ver todos →
                  </button>
                ) : null
              }
            />
          </ReportsPanelSection>

          <ModalShell
            open={buyersModalOpen}
            onClose={() => setBuyersModalOpen(false)}
            title="Compradores no período"
            maxWidth={820}
          >
            <ReportDataTable columns={buyerColumns} rows={topBuyers} emptyMessage="Nenhum comprador." />
          </ModalShell>

          <ModalShell
            open={productsModalOpen}
            onClose={() => setProductsModalOpen(false)}
            title="Produtos no período"
            maxWidth={720}
          >
            <ReportDataTable
              columns={productColumns}
              rows={topProducts}
              emptyMessage="Nenhum produto."
            />
          </ModalShell>
        </>
      )}
    </ReportsPanelShell>
  );
}
