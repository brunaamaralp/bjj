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
import ReportSectionHeading from './shared/ReportSectionHeading.jsx';
import '../finance/finance.css';
import './reports.css';

const CHART_COLOR = 'var(--color-primary, var(--petroleo, #003654))';

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
    <article className="card" style={{ padding: 14, marginBottom: 10 }}>
      <button type="button" className="reports-operator-card__head" onClick={onToggle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCircle size={20} aria-hidden />
            <strong style={{ fontSize: '1rem' }}>{row.operador_nome}</strong>
          </div>
          <div className="text-small text-muted" style={{ marginTop: 6 }}>
            {row.vendas_concluidas} venda(s) · {row.cancelamentos} cancelamento(s) ·{' '}
            {row.movimentos_manuais} mov. manual(is)
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{formatBRL(row.faturamento)}</div>
          <div className="text-small text-muted">Ticket {formatBRL(row.ticket_medio)}</div>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {row.top_itens?.length ? (
        <div className="text-small" style={{ marginTop: 10, color: 'var(--color-text-secondary)' }}>
          <strong>Top itens:</strong>{' '}
          {row.top_itens.map((t) => `${t.label} (${t.quantidade})`).join(' · ')}
        </div>
      ) : null}

      {expanded && row.vendas?.length ? (
        <div style={{ marginTop: 12 }}>
          <ReportDataTable
            columns={VENDAS_COLUMNS}
            rows={row.vendas.map((v) => ({ ...v, id: v.sale_id }))}
            emptyMessage="Nenhuma venda no período"
            striped={false}
          />
        </div>
      ) : null}
    </article>
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
      setError(String(e?.message || e));
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
      <div className="reports-empty card mt-4">
        <EmptyState
          insideCard
          variant="compact"
          tone="solid"
          title="Módulo de vendas desativado"
          description="Ative vendas na academia para ver o relatório por operador."
          role="status"
        />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex justify-end mb-2">
        <button
          type="button"
          className="btn-outline btn-sm"
          disabled={!sorted.length}
          onClick={() => exportOperatorReport(sorted, `${from}_${to}`)}
        >
          <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
          Exportar CSV
        </button>
      </div>
      <div className="reports-moves-filters">
        <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
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

      {loading ? (
        <div className="card" style={{ padding: 16 }}>
          <PageSkeleton variant="list" rows={4} />
        </div>
      ) : null}
      {error ? <ErrorBanner message={friendlyError(error, 'load')} className="mt-3" /> : null}

        {!loading && !error && chartData.length > 0 ? (
          <div className="reports-chart-block card mb-4" style={{ padding: 16 }}>
            <ReportSectionHeading title="Faturamento por operador" />
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
          </div>
        ) : null}

        {!loading && !error && !sorted.length ? (
          <EmptyState
          insideCard
          variant="compact"
          tone="dashed"
          title="Nenhuma venda no período"
          description="Altere o operador ou o intervalo de datas."
          role="status"
        />
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
    </div>
  );
}
