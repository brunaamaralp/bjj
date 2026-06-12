import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronDown, ChevronUp, Download, UserCircle } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { fetchReportsByOperator } from '../../lib/reportsByOperatorApi.js';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import { exportOperatorReport } from '../../lib/reportsExport.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import './reports.css';

const CHART_COLOR = 'var(--color-primary)';

function OperatorChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="reports-chart-tooltip">
      <strong>{row.nome}</strong>
      <div>{formatBRL(row.faturamento)}</div>
      <div className="text-small text-muted">{row.vendas} venda(s)</div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const VENDAS_COLUMNS = [
  { key: 'date', label: 'Data', render: (v) => formatDate(v.date) },
  { key: 'cliente_nome', label: 'Cliente', render: (v) => v.cliente_nome || '—' },
  { key: 'total', label: 'Total', render: (v) => formatBRL(v.total) },
  { key: 'status', label: 'Status' },
];

function OperatorCard({ row, expanded, onToggle }) {
  return (
    <ReportsPanelSection as="article" className="reports-operator-card">
      <button type="button" className="reports-operator-card__head" onClick={onToggle}>
        <div>
          <div className="reports-operator-card__name-row">
            <UserCircle size={20} aria-hidden />
            <strong className="reports-operator-card__name">{row.operador_nome}</strong>
          </div>
          <div className="text-small text-muted reports-operator-card__meta">
            {row.vendas_concluidas} venda(s) · {row.cancelamentos} cancelamento(s) ·{' '}
            {row.movimentos_manuais} mov. manual(is)
          </div>
        </div>
        <div className="reports-operator-card__aside">
          <div className="reports-operator-card__amount">{formatBRL(row.faturamento)}</div>
          <div className="text-small text-muted">Ticket {formatBRL(row.ticket_medio)}</div>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {row.top_itens?.length ? (
        <div className="text-small reports-operator-card__top-items">
          <strong>Top itens:</strong>{' '}
          {row.top_itens.map((t) => `${t.label} (${t.quantidade})`).join(' · ')}
        </div>
      ) : null}

      {expanded && row.vendas?.length ? (
        <div className="reports-operator-card__detail">
          <ReportDataTable
            columns={VENDAS_COLUMNS}
            rows={row.vendas.map((v) => ({ ...v, id: v.sale_id }))}
            emptyMessage="Nenhuma venda no período"
            striped={false}
          />
        </div>
      ) : null}
    </ReportsPanelSection>
  );
}

export default function ReportsOperadorPanel({ academyId, from, to, hasSales }) {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [team, setTeam] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let active = true;
    if (!academyId) return undefined;
    fetchTeamMemberships(academyId)
      .then((data) => {
        if (!active) return;
        const list = data.memberships || data.members || [];
        setTeam(
          list.map((m) => ({
            id: m.userId || m.user_id || m.$id,
            nome: m.name || m.nome || m.email || m.userId,
          }))
        );
      })
      .catch(() => {
        if (active) setTeam([]);
      });
    return () => {
      active = false;
    };
  }, [academyId]);

  const load = useCallback(async () => {
    if (!academyId || !from || !to || !hasSales) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchReportsByOperator({
        academyId,
        from,
        to,
        usuario_id: usuarioId || undefined,
      });
      setOperators(data.operators || []);
    } catch (e) {
      setError(friendlyError(e, 'load'));
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }, [academyId, from, to, hasSales, usuarioId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...operators].sort((a, b) => b.faturamento - a.faturamento),
    [operators]
  );

  const chartData = useMemo(
    () =>
      sorted.map((o) => ({
        nome: o.operador_nome,
        faturamento: Number(o.faturamento) || 0,
        vendas: Number(o.vendas_concluidas) || 0,
      })),
    [sorted]
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
            description="Ative vendas na academia para ver o relatório por operador."
            role="status"
          />
        </ReportsPanelSection>
      </ReportsPanelShell>
    );
  }

  const exportAction = (
    <button
      type="button"
      className="btn-outline btn-sm reports-export-btn reports-export-btn--icon"
      disabled={!sorted.length}
      onClick={() => exportOperatorReport(sorted, `${from}_${to}`)}
      aria-label="Exportar CSV"
      title="Exportar CSV"
    >
      <Download size={16} aria-hidden />
    </button>
  );

  return (
    <ReportsPanelShell>
      <ReportsPanelSection
        title="Por operador"
        subtitle={`${from} — ${to}`}
        action={exportAction}
      >
        <div className="reports-moves-filters">
          <div className="form-group reports-moves-filters__field">
            <label className="text-small text-muted">Operador</label>
            <select className="form-input" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
              <option value="">Todos</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
      </ReportsPanelSection>

      {loading ? (
        <ReportsPanelSection>
          <PageSkeleton variant="list" rows={4} />
        </ReportsPanelSection>
      ) : null}
      {error ? (
        <ErrorBanner message={friendlyError(error, 'load')} onRetry={() => void load()} />
      ) : null}

      {!loading && !error && chartData.length > 0 ? (
        <ReportsPanelSection title="Faturamento por operador" className="reports-panel-section--chart">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
              <XAxis
                dataKey="nome"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-28}
                textAnchor="end"
                height={70}
              />
              <YAxis tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 11 }} />
              <Tooltip content={<OperatorChartTooltip />} />
              <Bar dataKey="faturamento" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.nome} fill={CHART_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ReportsPanelSection>
      ) : null}

      {!loading && !error && !sorted.length ? (
        <ReportsPanelSection className="reports-empty">
          <EmptyState
            insideCard
            variant="compact"
            tone="dashed"
            title="Nenhuma venda no período"
            description="Altere o operador ou o intervalo de datas."
            role="status"
          />
        </ReportsPanelSection>
      ) : null}

      {!loading && !error
        ? sorted.map((row) => (
            <OperatorCard
              key={row.usuario_id}
              row={row}
              expanded={expandedId === row.usuario_id}
              onToggle={() => setExpandedId((id) => (id === row.usuario_id ? null : row.usuario_id))}
            />
          ))
        : null}
    </ReportsPanelShell>
  );
}
