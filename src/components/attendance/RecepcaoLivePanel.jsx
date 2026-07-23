import '../../styles/controlid-panels.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, Loader2, RefreshCw, Wifi, WifiOff, Ban } from 'lucide-react';
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
import ControlIdReleaseDialog from './ControlIdReleaseDialog.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import { summarizeReleaseReason } from '../../../lib/controlidRelease.js';
import { controlIdIgnoreReasonLabel } from '../../lib/controlidDisplay.js';
import { countRealFeedEntries } from '../../lib/recepcaoLiveFeed.js';

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
 * @param {{ onEntriesTodayChange?: (count: number) => void }} [props]
 */
export default function RecepcaoLivePanel({ onEntriesTodayChange } = {}) {
  const { academyId } = useLeadStore();
  const addToast = useUiStore((s) => s.addToast);
  const controlId = useAcademyControlId(academyId);

  const [feed, setFeed] = useState([]);
  const [feedReady, setFeedReady] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [polling, setPolling] = useState(false);
  const [lastPoll, setLastPoll] = useState(null);
  const [deviceOnline, setDeviceOnline] = useState(null);
  const pollTimer = useRef(null);
  const mountedRef = useRef(true);
  const knownIds = useRef(new Set());
  const entriesToday = countRealFeedEntries(feed);

  useEffect(() => {
    if (!feedReady) return;
    onEntriesTodayChange?.(entriesToday);
  }, [entriesToday, onEntriesTodayChange, feedReady]);

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
    } finally {
      if (mountedRef.current) setFeedReady(true);
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
      const ignored = data?.ignored || [];

      if (ignored.length > 0) {
        const ignoredEntries = ignored.map((item, i) => ({
          $id: `ignored-${item.reason}-${item.leadId}-${Date.now()}-${i}`,
          student_name: item.name,
          student_id: item.leadId,
          checked_in_at: new Date().toISOString(),
          source: 'ignored',
          ignore_reason: item.reason,
          _isIgnored: true,
        }));
        setFeed((prev) => [...ignoredEntries, ...prev].slice(0, MAX_FEED_ITEMS));
      }

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

    const stopPoll = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    const startPoll = () => {
      stopPoll();
      if (!controlId.configured || !controlId.enabled || !academyId) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pollTimer.current = setInterval(() => void doPoll(), POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void doPoll();
        startPoll();
      } else {
        stopPoll();
      }
    };

    startPoll();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mountedRef.current = false;
      stopPoll();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [academyId, controlId.configured, controlId.enabled, loadToday, doPoll]);

  const handleRelease = async (reason) => {
    if (!academyId) return;
    setReleasing(true);
    try {
      const data = await releaseControlIdGate(academyId, { reason });
      if (!data.sucesso) throw new Error(data.erro || 'Falha ao liberar');
      addToast({ type: 'success', message: 'Catraca liberada.' });
      setReleaseOpen(false);
      setFeed((prev) =>
        [
          {
            $id: `manual-${Date.now()}`,
            student_name: 'Liberação manual',
            checked_in_at: new Date().toISOString(),
            source: 'manual',
            release_reason: reason,
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
      <div className="controlid-live__status-row">
        <DeviceStatus
          configured={isConfigured}
          online={deviceOnline}
          polling={polling}
          ip={controlId.device_ip || controlId.ip}
        />
        {entriesToday > 0 && (
          <span className="controlid-live__count-badge">{entriesToday} hoje</span>
        )}
      </div>

      {isConfigured && deviceOnline === false ? (
        <StatusBanner
          variant="warning"
          className="reception-section"
          onRetry={() => void doPoll()}
          retryLabel="Tentar de novo"
          action={{ href: '/integracoes?tab=catraca', label: 'Abrir Integrações' }}
        >
          Catraca offline — confira o servidor na recepção e a rede local.
        </StatusBanner>
      ) : null}

      <div className="controlid-live__release-wrap">
        <button
          type="button"
          onClick={() => setReleaseOpen(true)}
          disabled={releasing || !isConfigured}
          className="controlid-live__release-btn"
        >
          {releasing ? (
            <Loader2 size={22} className="controlid-spin" aria-hidden />
          ) : (
            <DoorOpen size={22} aria-hidden />
          )}
          {releasing ? 'Liberando…' : 'Liberar catraca'}
        </button>
        {!isConfigured && (
          <p className="controlid-live__release-hint">
            Configure a catraca em <Link to="/integracoes?tab=catraca">Integrações</Link>.
          </p>
        )}
      </div>

      <div>
        <div className="controlid-live__feed-head">
          <h2 className="controlid-live__feed-title">Entradas hoje</h2>
          {isConfigured && deviceOnline !== false && (
            <span className="controlid-live__live-dot" title="Monitorando ao vivo" aria-hidden />
          )}
          <span className="controlid-live__feed-meta">
            {lastPoll ? `Atualizado ${format(lastPoll, 'HH:mm:ss')}` : 'Aguardando…'}
          </span>
        </div>

        {feed.length === 0 ? (
          <div className="controlid-live__empty">
            <DoorOpen size={32} className="controlid-live__empty-icon" aria-hidden />
            <p>
              {isConfigured
                ? 'Nenhuma entrada registrada hoje. O feed atualiza automaticamente.'
                : 'Configure a catraca para ver o feed ao vivo.'}
            </p>
          </div>
        ) : (
          <div className="controlid-live__feed-list">
            {feed.map((rec, idx) => (
              <FeedEntry key={rec.$id} rec={rec} isNew={idx === 0} />
            ))}
          </div>
        )}
      </div>
      <ControlIdReleaseDialog
        open={releaseOpen}
        loading={releasing}
        onClose={() => !releasing && setReleaseOpen(false)}
        onConfirm={(reason) => void handleRelease(reason)}
      />
    </div>
  );
}

function DeviceStatus({ configured, online, polling, ip }) {
  if (!configured) {
    return (
      <span className="controlid-live__device controlid-live__device--muted">
        <WifiOff size={14} aria-hidden />
        Não configurado
      </span>
    );
  }
  if (online === null) {
    return (
      <span className="controlid-live__device controlid-live__device--muted">
        {polling ? <Loader2 size={14} className="controlid-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
        {ip || 'Conectando…'}
      </span>
    );
  }
  if (online) {
    return (
      <span className="controlid-live__device controlid-live__device--online">
        <Wifi size={14} aria-hidden />
        {ip || 'Online'}
      </span>
    );
  }
  return (
    <span className="controlid-live__device controlid-live__device--offline">
      <WifiOff size={14} aria-hidden />
      Offline
    </span>
  );
}

function FeedEntry({ rec, isNew }) {
  const name = rec.student_name || (rec._isManual ? 'Liberação manual' : '—');
  const isManual = rec.source === 'manual' || rec._isManual;
  const isIgnored = rec.source === 'ignored' || rec._isIgnored;
  const reasonSummary = isManual
    ? summarizeReleaseReason(rec.release_reason)
    : isIgnored
      ? controlIdIgnoreReasonLabel(rec.ignore_reason)
      : '';

  const entryClass = [
    'controlid-feed-entry',
    isIgnored ? 'controlid-feed-entry--ignored' : '',
    isNew && !isIgnored ? 'controlid-feed-entry--new' : '',
    isManual ? 'controlid-feed-entry--manual' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const avatarClass = [
    'controlid-feed-entry__avatar',
    isManual ? 'controlid-feed-entry__avatar--manual' : '',
    isIgnored ? 'controlid-feed-entry__avatar--ignored' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={entryClass}>
      <div className={avatarClass}>
        {isManual ? <DoorOpen size={18} aria-hidden /> : isIgnored ? <Ban size={18} aria-hidden /> : avatarInitial(name)}
      </div>
      <div className="controlid-feed-entry__body">
        <div className="controlid-feed-entry__name">{name}</div>
        {reasonSummary ? <div className="controlid-feed-entry__reason">{reasonSummary}</div> : null}
        {rec.student_id && !isManual ? (
          <Link to={`/student/${rec.student_id}`} className="controlid-feed-entry__profile">
            ver perfil →
          </Link>
        ) : null}
      </div>
      <div className="controlid-feed-entry__time-wrap">
        <div className="controlid-feed-entry__time">{formatTime(rec.checked_in_at)}</div>
        <div className="controlid-feed-entry__source">
          {isManual ? 'manual' : isIgnored ? 'não contou' : 'catraca'}
        </div>
      </div>
    </div>
  );
}
