import { Query } from 'node-appwrite';
import { DB_ID, LEAD_EVENTS_COL } from './appwriteCollections.js';

const CONTACT_TYPES = ['followup_done', 'followup_contact', 'whatsapp_template_sent'];

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {number} [maxDays]
 */
export async function listAcademyFollowupEvents(databases, academyId, maxDays = 14) {
  if (!databases || !DB_ID || !LEAD_EVENTS_COL || !academyId) {
    return { doneByLead: {}, contactByLead: {}, snoozeUntilByLead: {} };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  const cutoffIso = cutoff.toISOString();

  const doneByLead = {};
  const contactByLead = {};
  const snoozeUntilByLead = {};

  let cursor = null;
  let pages = 0;

  do {
    const queries = [
      Query.equal('academy_id', [String(academyId).trim()]),
      Query.equal('type', [...CONTACT_TYPES, 'followup_snooze']),
      Query.greaterThan('at', cutoffIso),
      Query.orderDesc('at'),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB_ID, LEAD_EVENTS_COL, queries);
    const docs = res.documents || [];

    for (const d of docs) {
      const leadId = String(d.lead_id || '').trim();
      const at = String(d.at || '').trim();
      const type = String(d.type || '').trim();
      if (!leadId || !at) continue;
      const payload = parsePayload(d.payload_json);

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
    pages += 1;
  } while (cursor && pages < 15);

  return { doneByLead, contactByLead, snoozeUntilByLead };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {string} leadId
 * @param {string} classDateYmd
 */
export async function hasFollowupContactSinceClass(databases, academyId, leadId, classDateYmd) {
  const ymd = String(classDateYmd || '').slice(0, 10);
  if (!ymd) return false;
  const classMs = new Date(`${ymd}T00:00:00`).getTime();
  if (!Number.isFinite(classMs)) return false;

  const bundle = await listAcademyFollowupEvents(databases, academyId, 14);
  const lid = String(leadId || '').trim();
  const candidates = [bundle.doneByLead[lid], bundle.contactByLead[lid]].filter(Boolean);
  return candidates.some((at) => new Date(at).getTime() >= classMs);
}
