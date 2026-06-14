import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Receipt, DollarSign, Tag, XCircle } from 'lucide-react';
import { channelLabel } from '../../lib/salesSettings';
import { formatBRL } from '../../lib/moneyBr';
import { fetchReportsSalesLight } from '../../lib/reportsLightApi.js';
import { fetchReportsByOperator } from '../../lib/reportsByOperatorApi.js';
import { downloadCsv } from '../../lib/reportsExport.js';
import { kpiRagProps } from '../../lib/reportKpiGoalsUi.js';
import { useRegisterReportsExport } from '../../hooks/useReportsExportSlot.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import ReportKpiCard, { ReportKpiCardSkeleton } from './shared/ReportKpiCard.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import './reports.css';

function aggregateBuyersFromSales(vendas, totalRevenue) {
  const byKey = new Map();
  for (const v of vendas || []) {
    const nome = String(v.cliente_nome || '').trim() || 'Cliente avulso';
    const key = nome.toLowerCase();
    const prev = byKey.get(key) || {
      id: key,
      aluno_id: null,
      nome,
      vendas: 0,
      total: 0,
      ultima_compra: null,
    };
    prev.vendas += 1;
    prev.total += Number(v.total) || 0;
    const date = v.date || null;
    if (date && (!prev.ultima_compra || date > prev.ultima_compra)) prev.ultima_compra = date;
    byKey.set(key, prev);
  }
  return [...byKey.values()]
    .map((b) => ({
      ...b,
      pct: totalRevenue > 0 ? Math.round((b.total / totalRevenue) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.vendas - a.vendas);
}

export default function ReportsLojaPanel({ academyId, from, to, hasSales, operatorFilter = '', kpiGoals = {} }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [operatorPayload, setOperatorPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productsModalOpen, setProductsModalOpen] = useState(false);
  const [buyersModalOpen, setBuyersModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!academyId || !hasSales) return;
    setLoading(true);
    setError('');
    try {
      if (operatorFilter) {
        const body = await fetchReportsByOperator({
          academyId,
          from,
          to,
          usuario_id: operatorFilter,
        });
        setOperatorPayload(body);
        setData(null);
      } else {
        const body = await fetchReportsSalesLight({ academyId, from, to });
        setData(body);
        setOperatorPayload(null);
      }
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setData(null);
      setOperatorPayload(null);
    } finally {
      setLoading(false);
    }
  }, [academyId, from, to, hasSales, operatorFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedOperator = useMemo(() => {
    if (!operatorFilter || !operatorPayload?.operators?.length) return null;
    return (
      operatorPayload.operators.find((o) => String(o.usuario_id) === operatorFilter) ||
      operatorPayload.operators[0] ||
      null
    );
  }, [operatorFilter, operatorPayload]);

  const totals = useMemo(() => {
    if (selectedOperator) {
      return {
        concludedCount: selectedOperator.vendas_concluidas ?? 0,
        concludedTotal: selectedOperator.faturamento ?? 0,
        cancelCount: selectedOperator.cancelamentos ?? 0,
        ticketMedio: selectedOperator.ticket_medio ?? 0,
      };
    }
    return {
      concludedCount: data?.concludedCount ?? 0,
      concludedTotal: data?.concludedTotal ?? 0,
      cancelCount: data?.cancelCount ?? 0,
      ticketMedio: data?.ticketMedio ?? 0,
    };
  }, [data, selectedOperator]);

  const byChannel = useMemo(() => {
    if (operatorFilter) return [];
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
  }, [data, operatorFilter]);

  const topProducts = useMemo(() => {
    const total = Number(totals.concludedTotal) || 0;
    if (selectedOperator) {
      return (selectedOperator.top_itens || [])
        .map((p, i) => ({
          id: `op-${i}-${p.label}`,
          nome: p.label || 'Item',
          qty: Number(p.quantidade) || 0,
          total: 0,
          pct: 0,
        }))
        .sort((a, b) => b.qty - a.qty);
    }
    return (data?.byProduct || [])
      .map((p) => ({
        id: p.product_id,
        nome: p.nome || 'Produto',
        qty: Number(p.qty) || 0,
        total: Number(p.total) || 0,
        pct: total > 0 ? Math.round(((Number(p.total) || 0) / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [data, selectedOperator, totals.concludedTotal]);

  const top5 = useMemo(() => topProducts.slice(0, 5), [topProducts]);

  const topBuyers = useMemo(() => {
    const total = Number(totals.concludedTotal) || 0;
    if (selectedOperator) {
      return aggregateBuyersFromSales(selectedOperator.vendas, total);
    }
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
  }, [data, selectedOperator, totals.concludedTotal]);

  const topBuyers5 = useMemo(() => topBuyers.slice(0, 5), [topBuyers]);

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
      { metrica: 'Ticket médio', valor: totals.ticketMedio },
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
    const suffix = operatorFilter ? `-operador-${operatorFilter}` : '';
    downloadCsv(rows, `relatorio-loja-${from}_${to}${suffix}.csv`);
  };

  const hasSalesData = totals.concludedCount > 0 || totals.cancelCount > 0;

  useRegisterReportsExport(
    hasSales && !loading && !error && hasSalesData
      ? {
          disabled: false,
          loading,
          title: 'Exportar CSV de vendas',
          onExport: exportCsv,
        }
      : null
  );

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
      render: (row) => (row.total > 0 ? formatBRL(row.total) : '—'),
    },
    {
      key: 'pct',
      label: '% do total',
      align: 'right',
      render: (row) => (row.pct > 0 ? `${row.pct}%` : '—'),
    },
  ];

  return (
    <ReportsPanelShell>
      {loading ? (
        <ReportsPanelSection aria-busy="true">
          <div className="reports-kpi-grid">
            {[1, 2, 3, 4].map((i) => (
              <ReportKpiCardSkeleton key={i} />
            ))}
          </div>
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
            description={
              operatorFilter
                ? 'Este operador não registrou vendas concluídas nem cancelamentos no intervalo.'
                : 'As vendas concluídas e canceladas do intervalo selecionado aparecem aqui.'
            }
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
          {!operatorFilter && data?.truncated ? (
            <p className="reports-panel-note" role="status">
              Lista de vendas pode estar truncada no servidor — reduza o período se os totais parecerem baixos.
            </p>
          ) : null}
          <ReportsPanelSection
            title="Vendas no período"
            subtitle={`${from} — ${to}${selectedOperator ? ` · ${selectedOperator.operador_nome}` : ''}`}
          >
            <div className="reports-kpi-grid">
              <ReportKpiCard
                label="Vendas concluídas"
                value={totals.concludedCount}
                icon={<Receipt size={20} strokeWidth={2.25} />}
              />
              <ReportKpiCard
                label="Faturamento"
                value={formatBRL(totals.concludedTotal)}
                icon={<DollarSign size={20} strokeWidth={2.25} />}
              />
              <ReportKpiCard
                label="Ticket médio"
                value={formatBRL(totals.ticketMedio)}
                icon={<Tag size={20} strokeWidth={2.25} />}
              />
              <ReportKpiCard
                label="Cancelamentos"
                value={totals.cancelCount}
                icon={<XCircle size={20} strokeWidth={2.25} />}
                {...kpiRagProps('cancelCount', Number(totals.cancelCount), kpiGoals)}
              />
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
