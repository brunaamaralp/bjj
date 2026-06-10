import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import {
  fetchControlIdAttendance,
  releaseControlIdGate,
  pollControlIdMonitor,
} from '../../lib/controlidApi';
import { avatarInitial, todayStartIso } from './controlIdAttendanceUtils.js';
import { friendlyError } from '../../lib/errorMessages.js';

const POLL_INTERVAL_MS = 6000;
const MAX_FEED_ITEMS = 30;

function formatTime(iso) {
  try {
    return format(parseISO(iso), 'HH:mm:ss', { locale: ptBR });
  } catch {
    return '—';
  }
}

/**
 * Feed ao vivo da recepção + liberar catraca.
 */
export default function RecepcaoLivePanel() {
  const { academyId } = useLeadStore();
  const addToast = useUiStore((s) => s.addToast);
  const controlId = useAcademyControlId(academyId);

  const [feed, setFeed] = useState([]);
  const [releasing, setReleasing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [lastPoll, setLastPoll] = useState(null);
  const [deviceOnline, setDeviceOnline] = useState(null);
  const pollTimer = useRef(null);
  const mountedRef = useRef(true);
  const knownIds = useRef(new Set());

  const loadToday = useCallback(async () => {
    if (!academyId) return;
    try {
      const data = await fetchControlIdAttendance(academyId, {
        start: todayStartIso(),
        limit: MAX_FEED_ITEMS,
      });
      const recs = (data.records || []).slice(0, MAX_FEED_ITEMS);
      for (const r of recs) knownIds.current.add(r.$id);
      if (mountedRef.current) setFeed(recs);
    } catch {
      /* silencioso no load inicial */
    }
  }, [academyId]);

  const doPoll = useCallback(async () => {
    if (!academyId || !controlId.configured || !controlId.enabled) return;
    if (!mountedRef.current) return;
    setPolling(true);
    try {
      const data = await pollControlIdMonitor(academyId);
      if (!mountedRef.current) return;
      setDeviceOnline(true);
      setLastPoll(new Date());

      const events = data?.events || [];
      if (events.length > 0) {
        const fresh = await fetchControlIdAttendance(academyId, {
          start: todayStartIso(),
          limit: MAX_FEED_ITEMS,
        });
        if (!mountedRef.current) return;
        const recs = fresh.records || [];
        const newOnes = recs.filter((r) => !knownIds.current.has(r.$id));
        if (newOnes.length > 0) {
          for (const r of newOnes) knownIds.current.add(r.$id);
          setFeed((prev) => [...newOnes, ...prev].slice(0, MAX_FEED_ITEMS));
        }
      }
    } catch {
      if (mountedRef.current) setDeviceOnline(false);
    } finally {
      if (mountedRef.current) setPolling(false);
    }
  }, [academyId, controlId.configured, controlId.enabled]);

  useEffect(() => {
    mountedRef.current = true;
    void loadToday();

    if (controlId.configured && controlId.enabled && academyId) {
      pollTimer.current = setInterval(() => void doPoll(), POLL_INTERVAL_MS);
    }

    return () => {
      mountedRef.current = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [academyId, controlId.configured, controlId.enabled, loadToday, doPoll]);

  const handleRelease = async () => {
    if (!academyId) return;
    setReleasing(true);
    try {
      const data = await releaseControlIdGate(academyId);
      if (!data.sucesso) throw new Error(data.erro || 'Falha ao liberar');
      addToast({ type: 'success', message: 'Catraca liberada.' });
      setFeed((prev) =>
        [
          {
            $id: `manual-${Date.now()}`,
            student_name: 'Liberação manual',
            checked_in_at: new Date().toISOString(),
            source: 'manual',
            _isManual: true,
          },
          ...prev,
        ].slice(0, MAX_FEED_ITEMS)
      );
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setReleasing(false);
    }
  };

  const isConfigured = controlId.configured && controlId.enabled;

  return (
    <div className="recepcao-live-panel">
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <DeviceStatus
          configured={isConfigured}
          online={deviceOnline}
          polling={polling}
          ip={controlId.device_ip || controlId.ip}
        />
        {feed.filter((r) => !r._isManual).length > 0 && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 999,
              background: 'var(--purple-light)',
              color: 'var(--purple)',
            }}
          >
            {feed.filter((r) => !r._isManual).length} hoje
          </span>
        )}
      </div>

      <div style={{ marginBottom: 28 }}>
        <button
          type="button"
          onClick={() => void handleRelease()}
          disabled={releasing || !isConfigured}
          className="recepcao-live-panel__release-btn"
          style={{
            width: '100%',
            padding: '18px 24px',
            borderRadius: 16,
            border: 'none',
            background: isConfigured ? 'var(--v500)' : 'var(--border)',
            color: isConfigured ? '#fff' : 'var(--text-muted)',
            fontSize: 18,
            fontWeight: 700,
            cursor: isConfigured ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            boxShadow: isConfigured ? '0 4px 16px rgba(124,58,237,0.25)' : 'none',
          }}
        >
          {releasing ? (
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <DoorOpen size={22} />
          )}
          {releasing ? 'Liberando…' : 'Liberar catraca'}
        </button>
        {!isConfigured && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Configure a catraca em{' '}
            <Link to="/empresa" style={{ color: 'var(--purple)', fontWeight: 600 }}>
              Configurações da academia
            </Link>
            .
          </p>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', margin: 0 }}>Entradas hoje</h2>
          {isConfigured && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--success)',
                flexShrink: 0,
                animation: 'pulse 2s infinite',
              }}
              title="Monitorando ao vivo"
            />
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {lastPoll ? `Atualizado ${format(lastPoll, 'HH:mm:ss')}` : 'Aguardando…'}
          </span>
        </div>

        {feed.length === 0 ? (
          <div
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1px dashed var(--border)',
            }}
          >
            <DoorOpen size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              {isConfigured
                ? 'Nenhuma entrada registrada hoje. O feed atualiza automaticamente.'
                : 'Configure a catraca para ver o feed ao vivo.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {feed.map((rec, idx) => (
              <FeedEntry key={rec.$id} rec={rec} isNew={idx === 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceStatus({ configured, online, polling, ip }) {
  if (!configured) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
        <WifiOff size={14} />
        Não configurado
      </span>
    );
  }
  if (online === null) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
        {polling ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
        {ip || 'Conectando…'}
      </span>
    );
  }
  if (online) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
        <Wifi size={14} />
        {ip || 'Online'}
      </span>
    );
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
      <WifiOff size={14} />
      Offline
    </span>
  );
}

function FeedEntry({ rec, isNew }) {
  const name = rec.student_name || (rec._isManual ? 'Liberação manual' : '—');
  const isManual = rec.source === 'manual' || rec._isManual;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--surface)',
        border: `1px solid ${isNew ? 'var(--success)' : 'var(--border-light)'}`,
        animation: isNew ? 'slideIn 0.3s ease' : 'none',
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: isManual ? 'var(--warning-light)' : 'var(--purple-light)',
          color: isManual ? 'var(--warning)' : 'var(--purple)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 15,
          flexShrink: 0,
        }}
      >
        {isManual ? <DoorOpen size={18} /> : avatarInitial(name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        {rec.student_id && !rec._isManual && (
          <Link to={`/student/${rec.student_id}`} style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ver perfil →
          </Link>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(rec.checked_in_at)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{isManual ? 'manual' : 'catraca'}</div>
      </div>
    </div>
  );
}
