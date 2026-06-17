import { useCallback, useEffect, useState } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { getInboxJwt } from '../lib/inboxApiUtils.js';
import {
  getFollowupEventsCache,
  invalidateFollowupEventsCache,
  patchFollowupInboundCache,
  setFollowupEventsCache,
} from '../lib/followupEventsCache.js';
import { mergeFollowupInboundMaps } from '../lib/followupInboundClient.js';
import { FOLLOWUP_INBOUND_CHANGED, FOLLOWUP_INBOUND_REFRESH } from '../lib/leadTimelineEvents.js';
import { getInboundPollMs } from '../lib/followupInboundPoll.js';
import { useFollowupInboundRealtime } from './useFollowupInboundRealtime.js';

function scheduleDeferredWork(run) {
  if (typeof window === 'undefined') {
    run();
    return () => {};
  }
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout: 1500 });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1500);
  return () => window.clearTimeout(id);
}

function applyBundleToState(bundle, setters) {
  setters.setDoneByLead(bundle.doneByLead || {});
  setters.setContactByLead(bundle.contactByLead || {});
  setters.setSnoozeUntilByLead(bundle.snoozeUntilByLead || {});
  setters.setInboundAfterByLead(bundle.inboundAfterByLead || {});
  setters.setInboundAfterByPhone(bundle.inboundAfterByPhone || {});
}

async function loadFollowupEventsFromApi(academyId) {
  try {
    const token = await getInboxJwt();
    const aid = String(academyId || '').trim();
    if (!token || !aid) return { ok: false };

    const { blocked, res } = await fetchWithBillingGuard('/api/agent?route=followup-events', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-academy-id': aid,
      },
    });
    if (blocked || !res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      doneByLead: data.doneByLead || {},
      contactByLead: data.contactByLead || {},
      snoozeUntilByLead: data.snoozeUntilByLead || {},
    };
  } catch {
    return { ok: false };
  }
}

async function loadFollowupEvents(academyId) {
  const fromApi = await loadFollowupEventsFromApi(academyId);
  if (fromApi.ok) {
    return {
      doneByLead: fromApi.doneByLead || {},
      contactByLead: fromApi.contactByLead || {},
      snoozeUntilByLead: fromApi.snoozeUntilByLead || {},
    };
  }
  return { doneByLead: {}, contactByLead: {}, snoozeUntilByLead: {} };
}

async function loadInboundAfterMapsFromApi(academyId) {
  try {
    const token = await getInboxJwt();
    const aid = String(academyId || '').trim();
    if (!token || !aid) return { ok: false };

    const { blocked, res } = await fetchWithBillingGuard('/api/agent?route=followup-inbound', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-academy-id': aid,
      },
    });
    if (blocked || !res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      inboundAfterByLead: data.inboundAfterByLead || {},
      inboundAfterByPhone: data.inboundAfterByPhone || {},
    };
  } catch {
    return { ok: false };
  }
}

async function loadInboundAfterMaps(academyId) {
  const cached = getFollowupEventsCache(academyId);
  const cachedInbound = cached
    ? {
        inboundAfterByLead: cached.inboundAfterByLead || {},
        inboundAfterByPhone: cached.inboundAfterByPhone || {},
      }
    : null;

  const fromApi = await loadInboundAfterMapsFromApi(academyId);
  const apiMaps = fromApi.ok
    ? {
        inboundAfterByLead: fromApi.inboundAfterByLead || {},
        inboundAfterByPhone: fromApi.inboundAfterByPhone || {},
      }
    : null;
  const inbound = mergeFollowupInboundMaps(cachedInbound, apiMaps);

  if (cachedInbound && !fromApi.ok) return cachedInbound;
  return inbound || { inboundAfterByLead: {}, inboundAfterByPhone: {} };
}

async function fetchFollowupEventsBundle(academyId) {
  const [events, inbound] = await Promise.all([loadFollowupEvents(academyId), loadInboundAfterMaps(academyId)]);
  return { ...events, ...inbound };
}

/**
 * Carrega eventos recentes de retorno + inbound WhatsApp por lead (cache compartilhado com Dashboard).
 * Dados vêm apenas de /api/agent (sem fallback direto ao Appwrite no browser).
 * @param {string} academyId
 * @param {{ defer?: boolean; enableRealtime?: boolean; eagerInbound?: boolean; disableInboundPoll?: boolean }} [opts]
 */
export function useFollowupEventsByLead(
  academyId,
  {
    defer = false,
    enableRealtime = true,
    eagerInbound = false,
    disableInboundPoll = false,
  } = {}
) {
  const { realtimeOn } = useFollowupInboundRealtime(academyId, { enabled: enableRealtime });
  const [doneByLead, setDoneByLead] = useState({});
  const [contactByLead, setContactByLead] = useState({});
  const [snoozeUntilByLead, setSnoozeUntilByLead] = useState({});
  const [inboundAfterByLead, setInboundAfterByLead] = useState({});
  const [inboundAfterByPhone, setInboundAfterByPhone] = useState({});
  const [loading, setLoading] = useState(false);

  const applyBundle = useCallback((bundle) => {
    applyBundleToState(bundle, {
      setDoneByLead,
      setContactByLead,
      setSnoozeUntilByLead,
      setInboundAfterByLead,
      setInboundAfterByPhone,
    });
  }, []);

  const refreshFromCache = useCallback(() => {
    const cached = getFollowupEventsCache(academyId);
    if (cached) applyBundle(cached);
  }, [academyId, applyBundle]);

  const refreshFollowupEvents = useCallback(
    async ({ force = false } = {}) => {
      const aid = String(academyId || '').trim();
      if (!aid) return;
      if (force) invalidateFollowupEventsCache(aid);
      setLoading(true);
      try {
        const bundle = await fetchFollowupEventsBundle(aid);
        applyBundle(bundle);
        setFollowupEventsCache(aid, bundle);
      } catch {
        if (force) {
          applyBundle({
            doneByLead: {},
            contactByLead: {},
            snoozeUntilByLead: {},
            inboundAfterByLead: {},
            inboundAfterByPhone: {},
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [academyId, applyBundle]
  );

  const refreshInboundOnly = useCallback(async () => {
    const aid = String(academyId || '').trim();
    if (!aid) return;
    const inbound = await loadInboundAfterMaps(aid);
    if (!inbound) return;
    const cached = getFollowupEventsCache(aid) || {
      doneByLead: {},
      contactByLead: {},
      snoozeUntilByLead: {},
      inboundAfterByLead: {},
      inboundAfterByPhone: {},
    };
    const bundle = { ...cached, ...inbound };
    applyBundle(bundle);
    setFollowupEventsCache(aid, bundle);
  }, [academyId, applyBundle]);

  useEffect(() => {
    if (!academyId) {
      applyBundle({
        doneByLead: {},
        contactByLead: {},
        snoozeUntilByLead: {},
        inboundAfterByLead: {},
        inboundAfterByPhone: {},
      });
      return;
    }

    const cached = getFollowupEventsCache(academyId);
    if (cached) applyBundle(cached);

    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const bundle = await fetchFollowupEventsBundle(academyId);
        if (!cancelled) {
          applyBundle(bundle);
          setFollowupEventsCache(academyId, bundle);
        }
      } catch {
        if (!cancelled && !cached) {
          applyBundle({
            doneByLead: {},
            contactByLead: {},
            snoozeUntilByLead: {},
            inboundAfterByLead: {},
            inboundAfterByPhone: {},
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const cancelSchedule = defer ? scheduleDeferredWork(() => void load()) : (void load(), () => {});

    let cancelInbound = () => {};
    if (eagerInbound && academyId) {
      cancelInbound = (() => {
        let cancelledInbound = false;
        void (async () => {
          const inbound = await loadInboundAfterMaps(academyId);
          if (cancelledInbound || !inbound) return;
          const cachedNow = getFollowupEventsCache(academyId) || {
            doneByLead: {},
            contactByLead: {},
            snoozeUntilByLead: {},
            inboundAfterByLead: {},
            inboundAfterByPhone: {},
          };
          const bundle = { ...cachedNow, ...inbound };
          applyBundle(bundle);
          setFollowupEventsCache(academyId, bundle);
        })();
        return () => {
          cancelledInbound = true;
        };
      })();
    }

    return () => {
      cancelled = true;
      cancelSchedule();
      cancelInbound();
    };
  }, [academyId, defer, eagerInbound, applyBundle]);

  useEffect(() => {
    if (disableInboundPoll || !academyId || typeof window === 'undefined') return undefined;

    let pollId = null;
    let refreshDebounceId = null;

    const onInboundChanged = (ev) => {
      const detail = ev?.detail || {};
      const aid = String(detail.academyId || academyId || '').trim();
      if (aid && aid !== String(academyId || '').trim()) return;
      patchFollowupInboundCache(aid, {
        leadId: detail.leadId,
        phone: detail.phone,
        lastUserMsgAt: detail.lastUserMsgAt,
      });
      refreshFromCache();
    };

    const onInboundRefresh = (ev) => {
      const detail = ev?.detail || {};
      const aid = String(detail.academyId || academyId || '').trim();
      if (aid && aid !== String(academyId || '').trim()) return;
      if (refreshDebounceId) window.clearTimeout(refreshDebounceId);
      refreshDebounceId = window.setTimeout(() => {
        refreshDebounceId = null;
        void refreshInboundOnly();
      }, 400);
    };

    const restartPoll = () => {
      if (pollId) window.clearInterval(pollId);
      pollId = null;
      const ms = getInboundPollMs(realtimeOn, document.visibilityState === 'hidden');
      if (!ms) return;
      pollId = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void refreshInboundOnly();
      }, ms);
    };

    restartPoll();
    const onVisibility = () => restartPoll();

    window.addEventListener(FOLLOWUP_INBOUND_CHANGED, onInboundChanged);
    window.addEventListener(FOLLOWUP_INBOUND_REFRESH, onInboundRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (pollId) window.clearInterval(pollId);
      if (refreshDebounceId) window.clearTimeout(refreshDebounceId);
      window.removeEventListener(FOLLOWUP_INBOUND_CHANGED, onInboundChanged);
      window.removeEventListener(FOLLOWUP_INBOUND_REFRESH, onInboundRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [academyId, disableInboundPoll, refreshFromCache, refreshInboundOnly, realtimeOn]);

  return {
    loading,
    followupDoneByLead: doneByLead,
    followupContactByLead: contactByLead,
    followupSnoozeUntilByLead: snoozeUntilByLead,
    inboundAfterByLead,
    inboundAfterByPhone,
    followupRealtimeOn: realtimeOn,
    refreshFromCache,
    refreshFollowupEvents,
  };
}
