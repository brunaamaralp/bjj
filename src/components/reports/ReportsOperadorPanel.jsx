import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, UserCircle } from 'lucide-react';
import { formatBRL } from '../../lib/moneyBr';
import { fetchReportsByOperator } from '../../lib/reportsByOperatorApi.js';
import { fetchTeamMemberships } from '../../lib/teamApi.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import { FINANCE_PAGE_CSS } from '../finance/financePageStyles.js';

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

function OperatorCard({ row, expanded, onToggle }) {
  return (
    <article className="reports-operator-card card" style={{ padding: 14, marginBottom: 10 }}>
      <button
        type="button"
        className="reports-operator-card__head"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          padding: 0,
        }}
      >
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
        <div className="text-small" style={{ marginTop: 10, color: 'var(--text-secondary)' }}>
          <strong>Top itens:</strong>{' '}
          {row.top_itens.map((t) => `${t.label} (${t.quantidade})`).join(' · ')}
        </div>
      ) : null}

      {expanded && row.vendas?.length ? (
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="reports-moves-table" style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {row.vendas.map((v) => (
                <tr key={v.sale_id}>
                  <td>{formatDate(v.date)}</td>
                  <td>{v.cliente_nome || '—'}</td>
                  <td>{formatBRL(v.total)}</td>
                  <td>{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <>
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
      <div className="mt-4">
        <div className="reports-moves-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
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
                onToggle={() =>
                  setExpandedId((id) => (id === row.usuario_id ? null : row.usuario_id))
                }
              />
            ))
          : null}
      </div>
    </>
  );
}
