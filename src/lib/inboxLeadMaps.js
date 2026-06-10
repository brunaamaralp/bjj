import { inboxPhoneLookupVariants } from './normalizeInboxPhone.js';

const INBOX_LEAD_FP_FIELDS = [
  'id',
  'name',
  'phone',
  'needHuman',
  'hotLead',
  'priority',
  'intention',
  'status',
  'contact_type',
  'pipelineStage',
];

/** Fingerprint dos campos de lead usados na lista da inbox. */
export function leadInboxFingerprint(lead) {
  if (!lead) return '';
  return INBOX_LEAD_FP_FIELDS.map((f) => String(lead[f] ?? '')).join('|');
}

/** Leads embutidos na resposta da API de conversas (Fase 3). */
export function extractEmbeddedLeadsFromItems(items) {
  const byId = Object.create(null);
  for (const it of Array.isArray(items) ? items : []) {
    const lead = it?.lead;
    const id = String(lead?.id || '').trim();
    if (id && lead) byId[id] = lead;
  }
  return byId;
}

/**
 * @param {unknown[]} items
 * @param {string} selectedPhone
 * @param {(v: string) => string} normalizePhone
 */
export function collectVisibleLeadKeys(items, selectedPhone, normalizePhone) {
  const leadIdSet = new Set();
  const phoneSet = new Set();
  const arr = Array.isArray(items) ? items : [];
  for (const it of arr) {
    const lid = String(it?.lead_id || '').trim();
    if (lid) leadIdSet.add(lid);
    const p = normalizePhone(String(it?.phone_number || ''));
    if (p) phoneSet.add(p);
  }
  const sel = normalizePhone(String(selectedPhone || ''));
  if (sel) phoneSet.add(sel);
  return {
    leadIds: [...leadIdSet].sort(),
    phones: [...phoneSet].sort(),
  };
}

/** Índice phone → lead para todas as chaves conhecidas. */
export function buildLeadsByPhoneIndex(leadsById) {
  const byPhone = new Map();
  const src = leadsById && typeof leadsById === 'object' ? Object.values(leadsById) : [];
  for (const lead of src) {
    for (const phone of inboxPhoneLookupVariants(lead?.phone)) {
      if (!phone || byPhone.has(phone)) continue;
      byPhone.set(phone, lead);
    }
  }
  return byPhone;
}

/**
 * @param {Record<string, object>} leadsById
 * @param {{ leadIds: string[], phones: string[] }} visibleKeys
 */
export function buildInboxLeadMaps(leadsById, visibleKeys) {
  const leadById = new Map();
  const leadByPhone = new Map();
  const byIdSrc = leadsById && typeof leadsById === 'object' ? leadsById : {};
  const phoneIndex = buildLeadsByPhoneIndex(byIdSrc);

  for (const id of visibleKeys.leadIds) {
    const lead = byIdSrc[id];
    if (lead) leadById.set(id, lead);
  }

  for (const phone of visibleKeys.phones) {
    const lead = phoneIndex.get(phone);
    if (!lead || !phone) continue;
    leadByPhone.set(phone, lead);
    const lid = String(lead?.id || '').trim();
    if (lid) leadById.set(lid, lead);
  }

  return { leadById, leadByPhone };
}

export function fingerprintInboxLeadMaps(leadById, leadByPhone, visibleKeys) {
  const parts = [];
  for (const id of visibleKeys.leadIds) {
    parts.push(`i:${id}=${leadInboxFingerprint(leadById.get(id))}`);
  }
  for (const phone of visibleKeys.phones) {
    parts.push(`p:${phone}=${leadInboxFingerprint(leadByPhone.get(phone))}`);
  }
  return parts.join(';');
}
