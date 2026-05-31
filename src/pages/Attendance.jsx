import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, DoorOpen, ExternalLink, Filter, RefreshCw, Users } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { useAcademyControlId } from '../hooks/useAcademyControlId.js';
import { fetchControlIdAttendance, syncAllControlId, releaseControlIdGate } from '../lib/controlidApi';
import { useTerms } from '../lib/terminology.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageSkeleton from '../components/shared/PageSkeleton.jsx';

const DATE_RANGES = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'all', label: 'Todos' },
];

function rangeToIso(rangeId) {
  const now = new Date();
  if (rangeId === 'today') return { start: startOfDay(now).toISOString(), end: null };
  if (rangeId === '7d') return { start: subDays(now, 7).toISOString(), end: null };
  if (rangeId === '30d') return { start: subDays(now, 30).toISOString(), end: null };
  return { start: null, end: null };
}

function formatDateTime(iso) {
  try {
    return format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR });
  } catch {
    return iso || '—';
  }
}

function formatTime(iso) {
  try {
    return format(parseISO(iso), 'HH:mm', { locale: ptBR });
  } catch {
    return '—';
  }
}

function formatDateLabel(iso) {
  try {
    return format(parseISO(iso), "EEEE, dd 'de' MMMM", { locale: ptBR });
  } catch {
    return '';
  }
}

function avatarInitial(name) {
  return String(name || '?')[0].toUpperCase();
}

function groupByDate(records) {
  const groups = [];
  let currentDate = null;
  for (const rec of records) {
    const dateKey = String(rec.checked_in_at || '').slice(0, 10);
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      groups.push({ date: dateKey, label: formatDateLabel(rec.checked_in_at), records: [] });
    }
    groups[groups.length - 1].records.push(rec);
  }
  return groups;
}

export default function Attendance() {
  const { academyId } = useLeadStore();
  const addToast = useUiStore((s) => s.addToast);
  const terms = useTerms();
  const controlId = useAcademyControlId(academyId);

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('today');
  const [syncing, setSyncing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const hasFetched = useRef(false);

  const load = useCallback(async (rangeId = range) => {
    if (!academyId) return;
    setLoading(true);
    try {
      const { start, end } = rangeToIso(rangeId);
      const data = await fetchControlIdAttendance(academyId, { start, end, limit: 200 });
      setRecords(data.records || []);
      setTotal(data.total ?? data.records?.length ?? 0);
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Erro ao carregar presenças' });
    } finally {
      setLoading(false);
    }
  }, [academyId, range, addToast]);

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
      const msg = data.synced > 0
        ? `${data.synced} aluno(s) sincronizado(s)${data.failed > 0 ? `, ${data.failed} com erro` : ''}.`
        : data.failed > 0
        ? `${data.failed} erro(s) de sincronização.`
        : 'Nenhum aluno precisava de sincronização.';
      addToast({ type: data.failed > 0 ? 'warning' : 'success', message: msg });
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Falha ao sincronizar alunos' });
    } finally {
      setSyncing(false);
    }
  };

  const handleRelease = async () => {
    if (!academyId) return;
    setReleasing(true);
    try {
      const data = await releaseControlIdGate(academyId);
      if (!data.sucesso) throw new Error(data.erro || 'Falha ao liberar');
      addToast({ type: 'success', message: 'Catraca liberada.' });
    } catch (e) {
      addToast({ type: 'error', message: e?.message || 'Falha ao liberar catraca' });
    } finally {
      setReleasing(false);
    }
  };

  const groups = groupByDate(records);
  const isConfigured = controlId.configured && controlId.enabled;

  return (
    <div className="page-container animate-in">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">{terms.attendance}</h1>
          <p className="text-small text-muted" style={{ marginTop: 2 }}>
            Registros da catraca Control iD
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {isConfigured && (
            <>
              <Link to="/recepcao" className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <DoorOpen size={14} />
                Modo recepção
                <ExternalLink size={12} />
              </Link>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void handleRelease()}
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Carregando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {isConfigured ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
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
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
          Catraca configurada — {controlId.device_ip || controlId.ip}
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
          <Link to="/empresa" style={{ color: 'var(--warning)', fontWeight: 600, textDecoration: 'underline' }}>
            Configurações da academia
          </Link>
          .
        </div>
      )}

      {/* Filtro por período */}
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

      {/* Content */}
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
              ? 'Os registros aparecem aqui automaticamente quando alunos passam pela catraca.'
              : 'Configure a integração Control iD nas configurações da academia.'
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
        cursor: 'default',
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
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          {rec.student_id ? (
            <Link to={`/student/${rec.student_id}`} style={{ color: 'inherit', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
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
