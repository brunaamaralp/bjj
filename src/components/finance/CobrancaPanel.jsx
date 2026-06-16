import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, RefreshCw, CheckSquare } from 'lucide-react';
import { fetchCollectionQueue } from '../../lib/collectionQueueApi.js';
import { formatBRL } from '../../lib/moneyBr.js';
import {
  RECEIVABLES_SECTIONS,
  buildReceivablesSearchParams,
} from '../../lib/financeiroReceivablesSections.js';
import { FINANCE_SETTINGS_SECTIONS } from '../../lib/financeSettingsSections.js';
import CobrancaRowActions from './CobrancaRowActions.jsx';
import SearchField from '../shared/SearchField.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import useDebounce from '../../hooks/useDebounce.js';

function fmtMonthShort(ym) {
  if (!ym) return '—';
  try {
    return new Date(`${ym}-02T12:00:00`).toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return ym;
  }
}

export default function CobrancaPanel({ academyId, onSectionChange }) {
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [stageFilter, setStageFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const body = await fetchCollectionQueue({ academyId });
      setData(body);
    } catch (e) {
      console.error('[CobrancaPanel]', e);
      setData(null);
      setError('Não foi possível carregar a fila de cobrança.');
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    const bump = () => setRefreshToken((t) => t + 1);
    window.addEventListener('navi-student-payment-updated', bump);
    return () => window.removeEventListener('navi-student-payment-updated', bump);
  }, []);

  const summary = data?.summary || { students: 0, totalOpen: 0, byStage: {} };
  const collectionRules = data?.collectionRules || [];
  const currentMonth = data?.currentMonth || '';

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return (data?.rows || []).filter((row) => {
      if (stageFilter !== 'all') {
        const day = Number(stageFilter);
        if (Number(row.stage?.day) !== day) return false;
      }
      if (!q) return true;
      return String(row.name || '').toLowerCase().includes(q);
    });
  }, [data?.rows, debouncedSearch, stageFilter]);

  const handleRegisterPayment = (row, month) => {
    if (!onSectionChange) return;
    onSectionChange(RECEIVABLES_SECTIONS.MENSALIDADES, {
      search: row.name,
      filtro: '',
      extra: {
        pay_student: row.studentId,
        pay_month: month.referenceMonth,
      },
    });
  };

  if (!academyId) {
    return <p className="text-small text-muted">Selecione uma academia.</p>;
  }

  if (loading && !loadedOnce) {
    return <PageSkeleton variant="table" rows={6} />;
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={() => setRefreshToken((t) => t + 1)} />;
  }

  const reguaConfigPath = `/empresa?tab=financeiro&section=${FINANCE_SETTINGS_SECTIONS.REGUA}`;

  return (
    <div className="cobranca-panel">
      <div className="cobranca-panel__toolbar">
        <SearchField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar aluno…"
          aria-label="Buscar aluno na fila de cobrança"
        />
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => setRefreshToken((t) => t + 1)}
          disabled={loading}
          aria-busy={loading}
        >
          <RefreshCw size={14} className={loading ? 'navi-async-btn__spin' : ''} aria-hidden />
          Atualizar
        </button>
        <Link to="/tarefas?status=vencidas" className="btn-outline btn-sm cobranca-panel__tasks-link">
          <CheckSquare size={14} aria-hidden />
          Tarefas vencidas
        </Link>
      </div>

      <section className="mensal-collection-dashboard card cobranca-panel__kpis">
        <div className="mensal-collection-dashboard__grid">
          <div>
            <div className="mensal-collection-dashboard__value mensal-collection-dashboard__value--alert">
              {summary.students}
            </div>
            <div className="mensal-collection-dashboard__label">Inadimplentes</div>
          </div>
          <div>
            <div className="mensal-collection-dashboard__value finance-data">
              {formatBRL(summary.totalOpen)}
            </div>
            <div className="mensal-collection-dashboard__label">Valor em aberto</div>
          </div>
          {collectionRules.map((rule) => (
            <button
              key={rule.day}
              type="button"
              className={[
                'cobranca-stage-chip',
                stageFilter === String(rule.day) ? 'cobranca-stage-chip--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                setStageFilter((prev) => (prev === String(rule.day) ? 'all' : String(rule.day)))
              }
            >
              <div className="mensal-collection-dashboard__value">
                {summary.byStage?.[String(rule.day)] || 0}
              </div>
              <div className="mensal-collection-dashboard__label">
                D+{rule.day} · {rule.label}
              </div>
            </button>
          ))}
        </div>
      </section>

      {filteredRows.length === 0 ? (
        <EmptyState
          variant="compact"
          title="Nenhuma pendência em atraso"
          description="Quando houver mensalidades vencidas, os alunos aparecerão nesta fila."
          primaryAction={{
            label: 'Configurar régua de cobrança',
            href: reguaConfigPath,
          }}
        />
      ) : (
        <div className="finance-table-wrap cobranca-panel__table-wrap">
          <table className="finance-table cobranca-panel__table">
            <thead>
              <tr>
                <th aria-label="Expandir" />
                <th>Aluno</th>
                <th>Meses</th>
                <th>D+</th>
                <th>Etapa</th>
                <th className="cobranca-panel__col-amount">Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const expanded = expandedId === row.studentId;
                const Chevron = expanded ? ChevronDown : ChevronRight;
                return (
                  <React.Fragment key={row.studentId}>
                    <tr className={row.snoozed ? 'cobranca-panel__row--snoozed' : ''}>
                      <td>
                        <button
                          type="button"
                          className="cobranca-panel__expand-btn"
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Recolher meses' : 'Ver meses em aberto'}
                          onClick={() =>
                            setExpandedId((id) => (id === row.studentId ? null : row.studentId))
                          }
                        >
                          <Chevron size={16} />
                        </button>
                      </td>
                      <td>
                        <Link to={`/student/${row.studentId}`} className="cobranca-panel__student-link">
                          {row.name}
                        </Link>
                        {row.snoozed ? (
                          <span className="cobranca-panel__snooze-badge">Régua adiada</span>
                        ) : null}
                        <div className="text-small text-muted">{row.plan || '—'}</div>
                      </td>
                      <td className="finance-data">{row.openMonths?.length || 0}</td>
                      <td className="finance-data">D+{row.oldestDaysOverdue}</td>
                      <td>{row.stage?.label || '—'}</td>
                      <td className="cobranca-panel__col-amount finance-data">
                        {formatBRL(row.totalOpen)}
                      </td>
                      <td>
                        <CobrancaRowActions
                          studentId={row.studentId}
                          studentName={row.name}
                          phone={row.phone}
                          stage={row.stage}
                          daysOverdue={row.oldestDaysOverdue}
                          amount={row.totalOpen}
                          currentMonth={currentMonth}
                          busy={busyId === row.studentId}
                          onBusyChange={setBusyId}
                          onSnoozed={() => setRefreshToken((t) => t + 1)}
                          compact
                        />
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="cobranca-panel__detail-row">
                        <td colSpan={7}>
                          <ul className="cobranca-month-list">
                            {(row.openMonths || []).map((month) => (
                              <li key={month.referenceMonth} className="cobranca-month-list__item">
                                <span>
                                  <strong>{fmtMonthShort(month.referenceMonth)}</strong>
                                  <span className="text-small text-muted">
                                    {' '}
                                    · {formatBRL(month.amount)} · D+{month.daysOverdue}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  className="btn-outline btn-sm"
                                  onClick={() => handleRegisterPayment(row, month)}
                                >
                                  Registrar pagamento
                                </button>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-small text-muted cobranca-panel__footnote">
        Fila acumulada dos últimos 12 meses. O badge do aluno pode divergir até o próximo ciclo da
        régua automática.{' '}
        <Link to={reguaConfigPath}>Configurar régua</Link>
      </p>
    </div>
  );
}
