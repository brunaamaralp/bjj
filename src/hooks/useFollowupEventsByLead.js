import { useCallback, useEffect, useState } from 'react';
import { Query } from 'appwrite';
import { account, databases, DB_ID, LEAD_EVENTS_COL } from '../lib/appwrite';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import {
  getFollowupEventsCache,
  setFollowupEventsCache,
} from '../lib/followupEventsCache.js';
import { FOLLOWUP_AGENDA_MAX_DAYS } from '../lib/followupState.js';

function parsePayload(doc) {
  const raw = doc?.payload_json ?? doc?.payloadJson;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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

async function loadFollowupEvents(academyId) {
  const doneByLead = {};
  const contactByLead = {};
  const snoozeUntilByLead = {};
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FOLLOWUP_AGENDA_MAX_DAYS);
  const cutoffIso = cutoff.toISOString();

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
    const docs = Array.isArray(res?.documents) ? res.documents : [];
    for (const d of docs) {
      const leadId = String(d?.lead_id || '').trim();
      const at = String(d?.at || '').trim();
      const type = String(d?.type || '').trim();
      if (!leadId || !at) continue;
      const payload = parsePayload(d);
      if (type === 'followup_done' && !doneByLead[leadId]) doneByLead[leadId] = at;
      if (type === 'followup_contact' && !contactByLead[leadId]) contactByLead[leadId] = at;
      if (type === 'whatsapp_template_sent' && !contactByLead[leadId]) {
        const key = String(payload.automationKey || '').trim();
        if (key === 'presence_confirmed' || key === 'followup_d1_attended' || key === 'missed') {
          contactByLead[leadId] = at;
        }
      }
      if (type === 'followup_snooze' && !snoozeUntilByLead[leadId]) {
        const until = String(payload.untilYmd || '').slice(0, 10);
        if (until) snoozeUntilByLead[leadId] = until;
      }
    }
    cursor = docs.length === 100 ? docs[docs.length - 1]?.$id : null;
    pageCount += 1;
  } while (cursor && pageCount < 10);

  return { doneByLead, contactByLead, snoozeUntilByLead };
}

async function loadInboundAfterMapsFromApi(academyId) {
  try {
    const jwt = await account.createJWT();
    const token = String(jwt?.jwt || '').trim();
    const aid = String(academyId || '').trim();
    if (!token || !aid) return null;

    const { blocked, res } = await fetchWithBillingGuard('/api/agent?route=followup-inbound', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-academy-id': aid,
      },
    });
    if (blocked || !res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return {
      inboundAfterByLead: data.inboundAfterByLead || {},
      inboundAfterByPhone: data.inboundAfterByPhone || {},
    };
  } catch {
    return null;
  }
}

async function loadInboundAfterMaps(academyId) {
  const fromApi = await loadInboundAfterMapsFromApi(academyId);
  if (fromApi) return fromApi;
  // Fallback client-side exige permissões de leitura na coleção conversations no browser;
  // sem elas gera 401 ruidoso — retorno vazio e copilot usa só eventos de lead.
  return { inboundAfterByLead: {}, inboundAfterByPhone: {} };
}

/**
 * Carrega eventos recentes de retorno + inbound WhatsApp por lead (cache compartilhado com Dashboard).
 * @param {string} academyId
 * @param {{ defer?: boolean }} [opts]
 */
export function useFollowupEventsByLead(academyId, { defer = false } = {}) {
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
    if (cached) {
      applyBundle(cached);
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const [events, inbound] = await Promise.all([
          loadFollowupEvents(academyId),
          loadInboundAfterMaps(academyId),
        ]);

        const bundle = {
          ...events,
          ...inbound,
        };

        if (!cancelled) {
          applyBundle(bundle);
          setFollowupEventsCache(academyId, bundle);
        }
      } catch {
        if (!cancelled) {
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

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [academyId, defer, applyBundle]);

  return {
    loading,
    followupDoneByLead: doneByLead,
    followupContactByLead: contactByLead,
    followupSnoozeUntilByLead: snoozeUntilByLead,
    inboundAfterByLead,
    inboundAfterByPhone,
    refreshFromCache,
  };
}
