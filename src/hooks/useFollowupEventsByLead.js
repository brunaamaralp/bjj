import { useEffect, useState } from 'react';
import { Query } from 'appwrite';
import { databases, DB_ID, LEAD_EVENTS_COL } from '../lib/appwrite';
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

/**
 * Carrega eventos recentes de retorno por lead (cache compartilhado com Dashboard).
 */
export function useFollowupEventsByLead(academyId) {
  const [doneByLead, setDoneByLead] = useState({});
  const [contactByLead, setContactByLead] = useState({});
  const [snoozeUntilByLead, setSnoozeUntilByLead] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!academyId || !LEAD_EVENTS_COL) {
      setDoneByLead({});
      setContactByLead({});
      setSnoozeUntilByLead({});
      return;
    }

    const cached = getFollowupEventsCache(academyId);
    if (cached) {
      setDoneByLead(cached.doneByLead || {});
      setContactByLead(cached.contactByLead || {});
      setSnoozeUntilByLead(cached.snoozeUntilByLead || {});
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        let cursor = null;
        let pageCount = 0;
        const done = {};
        const contact = {};
        const snooze = {};
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - FOLLOWUP_AGENDA_MAX_DAYS);
        const cutoffIso = cutoff.toISOString();

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
            if (type === 'followup_done' && !done[leadId]) done[leadId] = at;
            if (type === 'followup_contact' && !contact[leadId]) contact[leadId] = at;
            if (type === 'whatsapp_template_sent' && !contact[leadId]) {
              const key = String(payload.automationKey || '').trim();
              if (key === 'presence_confirmed' || key === 'followup_d1_attended' || key === 'missed') {
                contact[leadId] = at;
              }
            }
            if (type === 'followup_snooze' && !snooze[leadId]) {
              const until = String(payload.untilYmd || '').slice(0, 10);
              if (until) snooze[leadId] = until;
            }
          }
          cursor = docs.length === 100 ? docs[docs.length - 1]?.$id : null;
          pageCount += 1;
        } while (cursor && pageCount < 10);

        if (!cancelled) {
          setDoneByLead(done);
          setContactByLead(contact);
          setSnoozeUntilByLead(snooze);
          setFollowupEventsCache(academyId, {
            doneByLead: done,
            contactByLead: contact,
            snoozeUntilByLead: snooze,
          });
        }
      } catch {
        if (!cancelled) {
          setDoneByLead({});
          setContactByLead({});
          setSnoozeUntilByLead({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  return {
    loading,
    followupDoneByLead: doneByLead,
    followupContactByLead: contactByLead,
    followupSnoozeUntilByLead: snoozeUntilByLead,
  };
}
