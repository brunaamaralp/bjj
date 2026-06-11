import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
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
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import '../finance/finance.css';
import './reports.css';

const CHART_COLOR = 'var(--color-primary, var(--petroleo, #003654))';

function ChannelTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="reports-chart-tooltip">
      <strong>{row.label}</strong>
      <div>{formatBRL(row.total)}</div>
      <div className="text-small text-muted">{row.pct}% do total</div>
    </div>
  );
}

export default function ReportsLojaPanel({ academyId, from, to, hasSales }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productsModalOpen, setProductsModalOpen] = useState(false);
  const [buyersModalOpen, setBuyersModalOpen] = useState(false);

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
          setError(friendlyError(e, 'load'));
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
      <div className="reports-empty card mt-4">
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
      </div>
    );
  }

  const exportAction = (
    <button type="button" className="btn-outline btn-sm" onClick={exportCsv}>
      <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
      Exportar CSV
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
              onClick: () =>
                navigate('/loja?tab=vendas', {
                  state: { subtab: 'historico', dateFrom: from, dateTo: to },
                }),
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
          <div className="flex justify-end mb-2">{exportAction}</div>
          <div className="reports-kpi-grid">
            <ReportKpiCard label="Vendas concluídas" value={totals.concludedCount} highlight="default" />
            <ReportKpiCard label="Faturamento" value={formatBRL(totals.concludedTotal)} highlight="success" />
            <ReportKpiCard label="Ticket médio" value={formatBRL(ticketMedio)} highlight="warning" />
            <ReportKpiCard label="Cancelamentos" value={totals.cancelCount} highlight="danger" />
          </div>

          <div className="reports-chart-block card mt-4">
            <ReportSectionHeading title="Por canal de venda" />
            {byChannel.length === 0 ? (
              <EmptyState
                insideCard
                variant="compact"
                tone="dashed"
                title="Sem vendas por canal"
                description="Não há faturamento por canal neste período."
                role="status"
              />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, byChannel.length * 44)}>
                <BarChart data={byChannel} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <XAxis type="number" tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip content={<ChannelTooltip />} />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                    {byChannel.map((entry) => (
                      <Cell key={entry.canal} fill={CHART_COLOR} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card mt-4" style={{ padding: '16px 18px' }}>
            <ReportSectionHeading
              title="Quem mais compra"
              subtitle="Ranking por faturamento de produtos no período (alunos e clientes avulsos)."
            />
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
          </div>

          <div className="card mt-4" style={{ padding: '16px 18px' }}>
            <ReportSectionHeading title="Produtos mais vendidos" />
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
          </div>

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
    </div>
  );
}
