import '../../styles/controlid-panels.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, DoorOpen, ExternalLink, Filter, RefreshCw, Users } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import { fetchControlIdAttendance, syncAllControlId, releaseControlIdGate } from '../../lib/controlidApi';
import { friendlyError } from '../../lib/errorMessages.js';
import { useTerms } from '../../lib/terminology.js';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import {
  DATE_RANGES,
  rangeToIso,
  formatDateTime,
  avatarInitial,
  groupByDate,
} from './controlIdAttendanceUtils.js';
import ControlIdReleaseDialog from './ControlIdReleaseDialog.jsx';
import { formatControlIdLastSync } from '../../lib/controlidDisplay.js';

/**
 * Histórico de presenças da catraca Control iD (filtros, sync, liberar porta).
 */
export default function ControlIdAttendancePanel({
  className = '',
  showReceptionLink = true,
  compact = false,
}) {
  const { academyId } = useLeadStore();
  const addToast = useUiStore((s) => s.addToast);
  const terms = useTerms();
  const controlId = useAcademyControlId(academyId);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('today');
  const [syncing, setSyncing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const hasFetched = useRef(false);

  const load = useCallback(
    async (rangeId = range) => {
      if (!academyId) return;
      setLoading(true);
      try {
        const { start, end } = rangeToIso(rangeId);
        const data = await fetchControlIdAttendance(academyId, { start, end, limit: 200 });
        setRecords(data.records || []);
      } catch (e) {
        addToast({ type: 'error', message: friendlyError(e, 'load') });
      } finally {
        setLoading(false);
      }
    },
    [academyId, range, addToast]
  );

  useEffect(() => {
    if (!academyId || hasFetched.current) return;
    hasFetched.current = true;
    void load('today');
  }, [academyId, load]);

  const changeRange = (r) => {
    setRange(r);
    void load(r);
  };

  const handleSyncAll = async () => {
    if (!academyId) return;
    setSyncing(true);
    try {
      const data = await syncAllControlId(academyId);
      if (!data.sucesso) throw new Error(data.erro || 'Erro ao sincronizar');
      const msg =
        data.synced > 0
          ? `${data.synced} aluno(s) sincronizado(s)${data.failed > 0 ? `, ${data.failed} com erro` : ''}${
              data.skipped_overdue > 0 ? `, ${data.skipped_overdue} inadimplente(s) ignorado(s)` : ''
            }.`
          : data.failed > 0
            ? `${data.failed} erro(s) de sincronização.`
            : data.skipped_overdue > 0
              ? `${data.skipped_overdue} inadimplente(s) ignorado(s); nenhum aluno precisava de sincronização.`
              : 'Nenhum aluno precisava de sincronização.';
      addToast({ type: data.failed > 0 ? 'warning' : 'success', message: msg });
      if (data.synced > 0) {
        controlId.refresh();
        addToast({ type: 'info', message: 'Última sincronização da catraca atualizada.' });
      }
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setSyncing(false);
    }
  };

  const handleRelease = async (reason) => {
    if (!academyId) return;
    setReleasing(true);
    try {
      const data = await releaseControlIdGate(academyId, { reason });
      if (!data.sucesso) throw new Error(data.erro || 'Falha ao liberar');
      addToast({ type: 'success', message: 'Catraca liberada.' });
      setReleaseOpen(false);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setReleasing(false);
    }
  };

  const groups = groupByDate(records);
  const isConfigured = controlId.configured && controlId.enabled;

  return (
    <div className={`controlid-attendance-panel${compact ? ' controlid-attendance-panel--compact' : ''} ${className}`.trim()}>
      {!compact && (
        <div className="controlid-attendance-panel__toolbar">
          {isConfigured && (
            <>
              {showReceptionLink && (
                <Link to="/?tab=catraca" className="btn-outline controlid-attendance-panel__tool-btn">
                  <DoorOpen size={14} aria-hidden />
                  Presença ao vivo
                  <ExternalLink size={12} aria-hidden />
                </Link>
              )}
              <button
                type="button"
                className="btn-secondary controlid-attendance-panel__tool-btn"
                onClick={() => setReleaseOpen(true)}
                disabled={releasing}
              >
                <DoorOpen size={14} aria-hidden />
                {releasing ? 'Liberando…' : 'Liberar catraca'}
              </button>
              <button
                type="button"
                className="btn-secondary controlid-attendance-panel__tool-btn"
                onClick={() => void handleSyncAll()}
                disabled={syncing}
              >
                <Users size={14} className={syncing ? 'controlid-spin' : ''} aria-hidden />
                {syncing ? 'Sincronizando…' : 'Sincronizar todos'}
              </button>
            </>
          )}
          <button
            type="button"
            className={`btn-secondary controlid-attendance-panel__tool-btn${!isConfigured ? ' controlid-attendance-panel__tool-btn--push' : ''}`}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'controlid-spin' : ''} aria-hidden />
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      )}

      {compact && (
        <div className="controlid-attendance-panel__toolbar">
          {isConfigured && showReceptionLink && (
            <Link to="/?tab=catraca" className="btn-outline controlid-attendance-panel__tool-btn">
              <DoorOpen size={14} aria-hidden /> Presença ao vivo
            </Link>
          )}
          <button
            type="button"
            className="btn-secondary controlid-attendance-panel__tool-btn controlid-attendance-panel__tool-btn--push"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'controlid-spin' : ''} aria-hidden /> Atualizar
          </button>
        </div>
      )}

      {isConfigured ? (
        <div className="controlid-attendance-panel__status controlid-attendance-panel__status--ok">
          <div className="controlid-attendance-panel__status-row">
            <span className="controlid-attendance-panel__status-dot" aria-hidden />
            Catraca configurada — {controlId.device_ip || controlId.ip}
          </div>
          <span className="controlid-attendance-panel__status-sync">
            Última sync de alunos: {formatControlIdLastSync(controlId.last_sync)}
          </span>
        </div>
      ) : (
        <div className="controlid-attendance-panel__status controlid-attendance-panel__status--warn">
          <DoorOpen size={14} aria-hidden />
          Catraca não configurada. Configure em{' '}
          <Link to="/integracoes?tab=catraca" className="controlid-attendance-panel__status-link">
            Integrações
          </Link>
          .
        </div>
      )}

      <div
        className="controlid-attendance-panel__filters"
        role="radiogroup"
        aria-label="Período do histórico"
      >
        <Filter size={14} className="controlid-attendance-panel__filter-icon" aria-hidden />
        {DATE_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={range === r.id}
            className="controlid-range-chip"
            onClick={() => changeRange(r.id)}
          >
            {r.label}
          </button>
        ))}
        {records.length > 0 && (
          <span className="controlid-attendance-panel__count">
            {records.length} registro{records.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <PageSkeleton variant="table" rows={8} columns={4} />
      ) : records.length === 0 ? (
        <EmptyState
          variant="default"
          tone="dashed"
          icon={CheckCircle2}
          title={isConfigured ? 'Nenhum registro neste período' : 'Catraca não configurada'}
          description={
            isConfigured
              ? `Os registros da catraca aparecem aqui quando ${terms.students.toLowerCase()} passam pelo equipamento.`
              : 'Configure a integração Control iD em Integrações → Catraca.'
          }
          role="status"
        />
      ) : (
        <div className="controlid-attendance-groups">
          {groups.map((group) => (
            <div key={group.date}>
              <h3 className="controlid-attendance-group__label">{group.label || group.date}</h3>
              <div className="controlid-attendance-group__rows">
                {group.records.map((rec) => (
                  <AttendanceRow key={rec.$id} rec={rec} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <ControlIdReleaseDialog
        open={releaseOpen}
        loading={releasing}
        onClose={() => !releasing && setReleaseOpen(false)}
        onConfirm={(reason) => void handleRelease(reason)}
      />
    </div>
  );
}

function AttendanceRow({ rec }) {
  const name = rec.student_name || '—';
  const initial = avatarInitial(name);
  const isManual = rec.source === 'manual';

  return (
    <div className="controlid-attendance-row">
      <div className="controlid-attendance-row__avatar">{initial}</div>
      <div className="controlid-attendance-row__body">
        <div className="controlid-attendance-row__name">{name}</div>
        {rec.student_id ? (
          <div className="controlid-attendance-row__profile">
            <Link to={`/student/${rec.student_id}`} onClick={(e) => e.stopPropagation()}>
              ver perfil →
            </Link>
          </div>
        ) : null}
      </div>
      <div className="controlid-attendance-row__time">
        <Clock size={13} className="controlid-attendance-row__time-icon" aria-hidden />
        {formatDateTime(rec.checked_in_at)}
      </div>
      <span
        className={`controlid-attendance-row__source${isManual ? ' controlid-attendance-row__source--manual' : ''}`}
      >
        {isManual ? 'Manual' : 'Catraca'}
      </span>
    </div>
  );
}
