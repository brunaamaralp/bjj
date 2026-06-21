import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ChevronRight, Loader2 } from 'lucide-react';
import { fetchAuditFeed } from '../../lib/auditFeedApi.js';
import { friendlyError } from '../../lib/errorMessages';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import ReportDataTable from './shared/ReportDataTable.jsx';
import ReportsPanelSection from './shared/ReportsPanelSection.jsx';
import ReportsPanelShell from './shared/ReportsPanelShell.jsx';
import './reports.css';

const DOMAIN_OPTIONS = [
  { value: '', label: 'Todos os módulos' },
  { value: 'tasks', label: 'Tarefas' },
  { value: 'sales', label: 'Vendas' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'team', label: 'Equipe' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'inventory', label: 'Estoque' },
];

function formatOccurredAt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export default function ReportsAtividadePanel({
  academyId,
  from,
  to,
  isOwner,
  operatorTeam = [],
  operatorFilter = '',
  onOperatorFilterChange,
}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [domain, setDomain] = useState('');
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [scope, setScope] = useState('all');

  const loadFeed = useCallback(
    async ({ append = false, nextCursor = null } = {}) => {
      if (!academyId || !from || !to) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const body = await fetchAuditFeed({
          academyId,
          from,
          to,
          domain: domain || undefined,
          actor_id: operatorFilter || undefined,
          cursor: nextCursor || undefined,
          limit: 50,
        });
        const list = Array.isArray(body.events) ? body.events : [];
        setScope(body.scope || 'all');
        setCursor(body.next_cursor || null);
        setHasMore(Boolean(body.has_more));
        setEvents((prev) => (append ? [...prev, ...list] : list));
      } catch (e) {
        setError(friendlyError(e, 'load'));
        if (!append) setEvents([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [academyId, from, to, domain, operatorFilter]
  );

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const columns = useMemo(
    () => [
      {
        key: 'occurred_at',
        label: 'Quando',
        width: '120px',
        render: (row) => formatOccurredAt(row.occurred_at),
      },
      {
        key: 'actor',
        label: 'Quem',
        render: (row) => row.actor?.name || '—',
      },
      {
        key: 'domain',
        label: 'Módulo',
        width: '110px',
        render: (row) => (
          <span className="reports-activity-domain">{row.domain_label || row.domain || '—'}</span>
        ),
      },
      {
        key: 'summary',
        label: 'Ação',
        render: (row) => row.summary || row.event_type,
      },
      {
        key: 'link',
        label: '',
        width: '40px',
        align: 'right',
        render: (row) =>
          row.link ? (
            <Link to={row.link} className="reports-activity-link" aria-label="Abrir registro">
              <ChevronRight size={16} aria-hidden />
            </Link>
          ) : null,
      },
    ],
    []
  );

  const teamOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Toda a equipe' }];
    for (const m of Array.isArray(operatorTeam) ? operatorTeam : []) {
      const id = String(m.id || m.userId || m.user_id || '').trim();
      if (!id) continue;
      opts.push({
        value: id,
        label: String(m.nome || m.userName || m.userEmail || m.name || 'Membro').trim() || 'Membro',
      });
    }
    return opts;
  }, [operatorTeam]);

  return (
    <ReportsPanelShell>
      <ReportsPanelSection
        title="Atividade da academia"
        subtitle={
          scope === 'self'
            ? 'Exibindo apenas suas ações no período selecionado.'
            : 'Registro unificado de ações da equipe no período selecionado.'
        }
      >
        <div className="reports-activity-filters">
          <label className="reports-activity-filter">
            <span className="reports-activity-filter__label">Módulo</span>
            <select
              className="navi-select"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={loading}
            >
              {DOMAIN_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {isOwner && teamOptions.length > 1 ? (
            <label className="reports-activity-filter">
              <span className="reports-activity-filter__label">Pessoa</span>
              <select
                className="navi-select"
                value={operatorFilter}
                onChange={(e) => onOperatorFilterChange?.(e.target.value)}
                disabled={loading}
              >
                {teamOptions.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {error ? <ErrorBanner className="mt-3" message={error} onRetry={() => loadFeed()} /> : null}

        {!error && !loading && events.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nenhuma atividade no período"
            description="Tente ampliar o intervalo de datas ou remover filtros."
          />
        ) : (
          <ReportDataTable
            className="mt-3"
            columns={columns}
            rows={events}
            loading={loading}
            emptyMessage="Nenhuma atividade no período."
            stickyHeader
          />
        )}

        {hasMore && !loading ? (
          <div className="reports-panel-actions mt-3">
            <button
              type="button"
              className="navi-btn navi-btn--secondary"
              disabled={loadingMore}
              onClick={() => loadFeed({ append: true, nextCursor: cursor })}
            >
              {loadingMore ? (
                <>
                  <Loader2 size={16} className="reports-spin" aria-hidden />
                  Carregando…
                </>
              ) : (
                'Carregar mais'
              )}
            </button>
          </div>
        ) : null}
      </ReportsPanelSection>
    </ReportsPanelShell>
  );
}
