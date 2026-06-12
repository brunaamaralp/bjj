import { useCallback, useEffect, useState } from 'react';
import { Query } from 'appwrite';
import { databases, DB_ID, LEAD_EVENTS_COL } from '../lib/appwrite';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { getInboxJwt } from '../lib/inboxApiUtils.js';
import { buildFollowupEventMapsFromDocs } from '../lib/followupEventsMaps.js';
import {
  getFollowupEventsCache,
  invalidateFollowupEventsCache,
  patchFollowupInboundCache,
  setFollowupEventsCache,
} from '../lib/followupEventsCache.js';
import { FOLLOWUP_AGENDA_MAX_DAYS } from '../lib/followupState.js';
import { FOLLOWUP_INBOUND_CHANGED, FOLLOWUP_INBOUND_REFRESH } from '../lib/leadTimelineEvents.js';
import { getInboundPollMs } from '../lib/followupInboundPoll.js';
import {
  isInboundMapsEmpty,
  loadFollowupInboundMapsFromClient,
  mergeFollowupInboundMaps,
  scanRecentInboundMapsFromClient,
} from '../lib/followupInboundClient.js';
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

/** Fallback legado no browser — só se a API não estiver disponível. */
async function loadFollowupEventsClient(academyId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FOLLOWUP_AGENDA_MAX_DAYS);
  const cutoffIso = cutoff.toISOString();

  const docs = [];
  let cursor = null;
  let pageCount = 0;
  do {
    const queries = [
      Query.equal('academy_id', [String(academyId || '').trim()]),
      Query.equal('type', ['followup_done', 'followup_contact', 'followup_snooze', 'whatsapp_template_sent']),
      Query.greaterThan('at', cutoffIso),
      Query.orderDesc('at'),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, queries);
    const page = Array.isArray(res?.documents) ? res.documents : [];
    docs.push(...page);
    cursor = page.length === 100 ? page[page.length - 1]?.$id : null;
    pageCount += 1;
  } while (cursor && pageCount < 10);

  return buildFollowupEventMapsFromDocs(docs);
}

async function loadFollowupEvents(academyId, { allowClientFallback = true } = {}) {
  const fromApi = await loadFollowupEventsFromApi(academyId);
  if (fromApi.ok) {
    return {
      doneByLead: fromApi.doneByLead || {},
      contactByLead: fromApi.contactByLead || {},
      snoozeUntilByLead: fromApi.snoozeUntilByLead || {},
    };
  }
  if (!allowClientFallback || !LEAD_EVENTS_COL) {
    return { doneByLead: {}, contactByLead: {}, snoozeUntilByLead: {} };
  }
  try {
    return await loadFollowupEventsClient(academyId);
  } catch {
    return { doneByLead: {}, contactByLead: {}, snoozeUntilByLead: {} };
  }
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

async function loadInboundAfterMaps(academyId, followupLeads = [], { allowClientFallback = true } = {}) {
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
  let inbound = mergeFollowupInboundMaps(cachedInbound, apiMaps);

  if (allowClientFallback && !fromApi.ok && (followupLeads || []).length) {
    const fromLeads = await loadFollowupInboundMapsFromClient(academyId, followupLeads);
    inbound = mergeFollowupInboundMaps(inbound, fromLeads);
  }

  if (allowClientFallback && !fromApi.ok && isInboundMapsEmpty(inbound)) {
    const fromScan = await scanRecentInboundMapsFromClient(academyId);
    inbound = mergeFollowupInboundMaps(inbound, fromScan);
  }

  if (isInboundMapsEmpty(inbound) && cachedInbound) return cachedInbound;
  return inbound || { inboundAfterByLead: {}, inboundAfterByPhone: {} };
}

async function fetchFollowupEventsBundle(academyId, followupLeads = [], { allowClientFallback = true } = {}) {
  const [events, inbound] = await Promise.all([
    loadFollowupEvents(academyId, { allowClientFallback }),
    loadInboundAfterMaps(academyId, followupLeads, { allowClientFallback }),
  ]);
  return { ...events, ...inbound };
}

/**
 * Carrega eventos recentes de retorno + inbound WhatsApp por lead (cache compartilhado com Dashboard).
 * @param {string} academyId
 * @param {{ defer?: boolean; enableRealtime?: boolean; allowClientFallback?: boolean; disableInboundPoll?: boolean }} [opts]
 */
export function useFollowupEventsByLead(
  academyId,
  {
    defer = false,
    enableRealtime = true,
    eagerInbound = false,
    followupLeads = [],
    allowClientFallback = true,
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
      if (!aid || !LEAD_EVENTS_COL) return;
      if (force) invalidateFollowupEventsCache(aid);
      setLoading(true);
      try {
        const bundle = await fetchFollowupEventsBundle(aid, followupLeads, { allowClientFallback });
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
    [academyId, followupLeads, applyBundle, allowClientFallback]
  );

  const refreshInboundOnly = useCallback(async () => {
    const aid = String(academyId || '').trim();
    if (!aid) return;
    const inbound = await loadInboundAfterMaps(aid, followupLeads, { allowClientFallback });
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
  }, [academyId, followupLeads, applyBundle, allowClientFallback]);

  useEffect(() => {
    if (!academyId || !LEAD_EVENTS_COL) {
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
        const bundle = await fetchFollowupEventsBundle(academyId, followupLeads, { allowClientFallback });
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
    if (eagerInbound && academyId && LEAD_EVENTS_COL) {
      cancelInbound = (() => {
        let cancelledInbound = false;
        void (async () => {
          const inbound = await loadInboundAfterMaps(academyId, followupLeads, { allowClientFallback });
          if (cancelledInbound || !inbound) return;
          const cached = getFollowupEventsCache(academyId) || {
            doneByLead: {},
            contactByLead: {},
            snoozeUntilByLead: {},
            inboundAfterByLead: {},
            inboundAfterByPhone: {},
          };
          const bundle = { ...cached, ...inbound };
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
  }, [academyId, defer, eagerInbound, followupLeads, applyBundle, allowClientFallback]);

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
  }, [academyId, disableInboundPoll, refreshFromCache, refreshInboundOnly, realtimeOn, followupLeads]);

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
