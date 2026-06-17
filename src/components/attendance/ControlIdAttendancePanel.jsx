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
        <div className="controlid-attendance-panel__toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {isConfigured && (
            <>
              {showReceptionLink && (
                <Link
                  to="/recepcao"
                  className="btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  <DoorOpen size={14} />
                  Modo recepção
                  <ExternalLink size={12} />
                </Link>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReleaseOpen(true)}
                disabled={releasing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <DoorOpen size={14} />
                {releasing ? 'Liberando…' : 'Liberar catraca'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleSyncAll()}
                disabled={syncing}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <Users size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Sincronizando…' : 'Sincronizar todos'}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void load()}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: isConfigured ? undefined : 'auto' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      )}

      {compact && (
        <div className="controlid-attendance-panel__toolbar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {isConfigured && showReceptionLink && (
            <Link to="/recepcao" className="btn-outline" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <DoorOpen size={14} /> Recepção ao vivo
            </Link>
          )}
          <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading} style={{ fontSize: 13, marginLeft: 'auto' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      )}

      {isConfigured ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--success-light)',
            border: '1px solid var(--success)',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--success)',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            Catraca configurada — {controlId.device_ip || controlId.ip}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', paddingLeft: 16 }}>
            Última sync de alunos: {formatControlIdLastSync(controlId.last_sync)}
          </span>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--warning-light)',
            border: '1px solid var(--warning)',
            marginBottom: 16,
            fontSize: 13,
            color: 'var(--warning)',
          }}
        >
          <DoorOpen size={14} />
          Catraca não configurada. Configure em{' '}
          <Link
            to="/integracoes?tab=catraca"
            style={{ color: 'var(--warning)', fontWeight: 600, textDecoration: 'underline' }}
          >
            Integrações
          </Link>
          .
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        {DATE_RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => changeRange(r.id)}
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              border: `1px solid ${range === r.id ? 'var(--purple)' : 'var(--border)'}`,
              background: range === r.id ? 'var(--purple-light)' : 'transparent',
              color: range === r.id ? 'var(--purple)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        ))}
        {records.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group) => (
            <div key={group.date}>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                  paddingBottom: 6,
                  borderBottom: '1px solid var(--border-light)',
                }}
              >
                {group.label || group.date}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
  const source = rec.source === 'manual' ? 'Manual' : 'Catraca';
  const sourceColor = rec.source === 'manual' ? 'var(--text-muted)' : 'var(--success)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 10px',
        borderRadius: 8,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--purple-light)',
          color: 'var(--purple)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          {rec.student_id ? (
            <Link
              to={`/student/${rec.student_id}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
              onClick={(e) => e.stopPropagation()}
            >
              ver perfil →
            </Link>
          ) : null}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>
        <Clock size={13} style={{ color: 'var(--text-muted)' }} />
        {formatDateTime(rec.checked_in_at)}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: 999,
          background: rec.source === 'manual' ? 'var(--surface-hover)' : 'var(--success-light)',
          color: sourceColor,
          flexShrink: 0,
        }}
      >
        {source}
      </span>
    </div>
  );
}
