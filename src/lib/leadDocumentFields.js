import { Query } from 'appwrite';
import { normalizeEnrollmentPhone } from './publicEnrollmentSettings.js';

/** Campos canônicos para escrita em leads: academyId + phone. */

/**
 * @param {object} params
 * @returns {object}
 */
export function buildCanonicalLeadPayload({
  academyId,
  phone,
  name = '',
  status = 'Novo',
  origin = '',
  pipelineStage = 'Novo',
  extra = {},
}) {
  const a = String(academyId || '').trim();
  const telefone = normalizeEnrollmentPhone(phone) || String(phone || '').replace(/\D/g, '');
  const nowIso = new Date().toISOString();
  return {
    name: String(name || '').trim() || telefone,
    phone: telefone,
    academyId: a,
    status,
    origin: String(origin || '').trim(),
    pipeline_stage: String(pipelineStage || 'Novo').trim(),
    status_changed_at: nowIso,
    pipeline_stage_changed_at: nowIso,
    ...extra,
  };
}

/**
 * Queries padronizadas para buscar lead por telefone (escrita canônica).
 * @param {string} academyId
 * @param {string} phone
 * @returns {import('appwrite').Query[]}
 */
export function leadQueryByPhone(academyId, phone) {
  const a = String(academyId || '').trim();
  const p = normalizeEnrollmentPhone(phone) || String(phone || '').replace(/\D/g, '');
  return [Query.equal('academyId', [a]), Query.equal('phone', [p]), Query.limit(1)];
}

/**
 * Variantes legadas para leitura de documentos antigos.
 */
export const LEGACY_LEAD_QUERY_COMBOS = [
  { academy: 'academy_id', phone: 'phone_number' },
  { academy: 'academy_id', phone: 'phone' },
  { academy: 'academyId', phone: 'phone_number' },
];
