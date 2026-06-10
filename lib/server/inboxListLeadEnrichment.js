import { Query } from 'node-appwrite';
import { mapAppwriteDocToLead } from '../../src/lib/mapAppwriteLeadDoc.js';
import { LEAD_STATUS } from '../../src/lib/leadStatus.js';
import { inboxPhoneLookupVariants } from '../../src/lib/normalizeInboxPhone.js';
import { DB_ID, LEADS_COL } from './appwriteCollections.js';

const OPERATIONAL_STATUS_SET = new Set(Object.values(LEAD_STATUS));

const LEAD_SELECT_ATTRS = [
  '$id',
  'name',
  'phone',
  'phone_number',
  'status',
  'pipeline_stage',
  'contact_type',
  'whatsapp_lead_quente',
  'need_human',
  'whatsapp_intention',
  'whatsapp_priority',
  'academyId',
  'triage_status',
];

/** Campos usados na lista da inbox (client: enrichInboxListItems / inboxLeadMaps). */
export function toInboxListLeadSnippet(doc) {
  if (!doc) return null;
  const lead = mapAppwriteDocToLead(doc, OPERATIONAL_STATUS_SET);
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    needHuman: lead.needHuman,
    hotLead: lead.hotLead,
    priority: lead.priority,
    intention: lead.intention,
    status: lead.status,
    contact_type: lead.contact_type,
    pipelineStage: lead.pipelineStage,
    triageStatus: lead.triageStatus,
  };
}

function normalizeDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

async function fetchLeadSnippetsByIds(databases, academyId, ids) {
  const out = new Map();
  const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!databases || !LEADS_COL || !unique.length) return out;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const list = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('$id', chunk),
        Query.equal('academyId', [academyId]),
        Query.limit(chunk.length),
        Query.select(LEAD_SELECT_ATTRS),
      ]);
      for (const doc of list.documents || []) {
        const snippet = toInboxListLeadSnippet(doc);
        if (snippet?.id) out.set(snippet.id, snippet);
      }
    } catch {
      void 0;
    }
  }
  return out;
}

async function fetchLeadSnippetsByPhones(databases, academyId, phones) {
  const byPhone = new Map();
  const variants = new Set();
  for (const p of phones || []) {
    for (const v of inboxPhoneLookupVariants(p)) {
      if (v) variants.add(v);
    }
  }
  const arr = [...variants];
  if (!databases || !LEADS_COL || !arr.length) return byPhone;

  const chunkSize = 25;
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    try {
      const list = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('academyId', [academyId]),
        Query.equal('phone', chunk),
        Query.limit(100),
        Query.select(LEAD_SELECT_ATTRS),
      ]);
      for (const doc of list.documents || []) {
        const snippet = toInboxListLeadSnippet(doc);
        if (!snippet) continue;
        for (const v of inboxPhoneLookupVariants(doc.phone || doc.phone_number)) {
          if (!byPhone.has(v)) byPhone.set(v, snippet);
        }
      }
    } catch {
      void 0;
    }
  }
  return byPhone;
}

function resolveLeadFromPhoneIndex(phone, byPhone) {
  for (const v of inboxPhoneLookupVariants(phone)) {
    const hit = byPhone.get(v);
    if (hit) return hit;
  }
  const digits = normalizeDigits(phone);
  if (digits && byPhone.has(digits)) return byPhone.get(digits);
  return null;
}

/**
 * Enriquece documentos da lista de conversas com snippets de lead (por lead_id e telefone).
 * @returns {Map<string, object>} conversation $id → lead snippet
 */
export async function enrichConversationListDocs(databases, academyId, docs) {
  const result = new Map();
  const arr = Array.isArray(docs) ? docs : [];
  if (!arr.length) return result;

  const leadIds = [];
  const phoneFallbackDocs = [];

  for (const doc of arr) {
    const lid = String(doc?.lead_id || '').trim();
    if (lid) leadIds.push(lid);
    else if (String(doc?.phone_number || '').trim()) phoneFallbackDocs.push(doc);
  }

  const byId = await fetchLeadSnippetsByIds(databases, academyId, leadIds);

  for (const doc of arr) {
    const lid = String(doc?.lead_id || '').trim();
    if (lid && byId.has(lid)) result.set(doc.$id, byId.get(lid));
  }

  const phonesForLookup = [];
  for (const doc of phoneFallbackDocs) {
    if (!result.has(doc.$id)) phonesForLookup.push(doc.phone_number);
  }
  for (const doc of arr) {
    const lid = String(doc?.lead_id || '').trim();
    if (lid && !result.has(doc.$id) && doc.phone_number) phonesForLookup.push(doc.phone_number);
  }

  const byPhone = await fetchLeadSnippetsByPhones(databases, academyId, phonesForLookup);

  for (const doc of arr) {
    if (result.has(doc.$id)) continue;
    const lead = resolveLeadFromPhoneIndex(doc.phone_number, byPhone);
    if (lead) result.set(doc.$id, lead);
  }

  return result;
}
