import { Query } from 'node-appwrite';
import { findStudentsByPhone } from './studentAcademyRepair.js';
import { DB_ID, LEADS_COL, STUDENTS_COL } from './appwriteCollections.js';
import { normalizePhoneSearchDigits } from '../../src/lib/phoneSearchQuery.js';
import { suggestPeopleByPhone } from '../nlStudentMatch.js';

/**
 * @param {{ id: string, name?: string, phone?: string, kind?: string }[]} hits
 * @param {string} phoneDigits
 */
export function buildNlPhoneLookupResponse(hits, phoneDigits) {
  const digits = normalizePhoneSearchDigits(phoneDigits);
  const list = Array.isArray(hits) ? hits : [];
  if (!list.length) {
    return {
      resposta: `Não encontrei aluno nem lead com telefone parecido com ${digits}.`,
      rows: [],
      count: 0,
      query_type: 'find_by_phone',
    };
  }
  const rows = list.map((h) => {
    const kind = String(h.kind || 'student').trim() === 'lead' ? 'lead' : 'student';
    const phone = normalizePhoneSearchDigits(h.phone) || digits;
    return {
      id: String(h.id).trim(),
      linkKind: kind,
      name: String(h.name || '').trim() || '—',
      line: `${kind === 'lead' ? 'Lead' : 'Aluno'} · ${phone}`,
    };
  });
  const label =
    rows.length === 1
      ? `Encontrei 1 contato: ${rows[0].name}.`
      : `Encontrei ${rows.length} contatos com esse telefone.`;
  return {
    resposta: label,
    rows,
    count: rows.length,
    query_type: 'find_by_phone',
  };
}

/**
 * Busca no Appwrite alunos + leads da academia por telefone (≥8 dígitos).
 */
export async function lookupPeopleByPhoneForNl(databases, academyId, phoneDigits, { limit = 8 } = {}) {
  const digits = normalizePhoneSearchDigits(phoneDigits);
  if (!databases || !digits || digits.length < 8) return [];

  const aid = String(academyId || '').trim();
  const found = new Map();

  if (STUDENTS_COL && DB_ID) {
    try {
      const docs = await findStudentsByPhone(databases, DB_ID, STUDENTS_COL, digits, { limit: 15 });
      for (const doc of docs || []) {
        const docAcademy = String(doc.academyId || doc.academy_id || '').trim();
        if (aid && docAcademy && docAcademy !== aid) continue;
        const id = String(doc.$id || '').trim();
        if (!id || found.has(`student:${id}`)) continue;
        found.set(`student:${id}`, {
          id,
          name: String(doc.name || '').trim(),
          phone: normalizePhoneSearchDigits(doc.phone || doc.phone_number || ''),
          kind: 'student',
        });
      }
    } catch (e) {
      console.warn('[nl-phone-lookup] students', e?.message || e);
    }
  }

  if (LEADS_COL && DB_ID && aid) {
    try {
      const res = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('academyId', aid),
        Query.contains('phone', digits.length > 11 ? digits.slice(-11) : digits),
        Query.limit(Math.min(limit, 15)),
      ]);
      for (const doc of res.documents || []) {
        const id = String(doc.$id || '').trim();
        if (!id || found.has(`lead:${id}`) || found.has(`student:${id}`)) continue;
        const phone = normalizePhoneSearchDigits(doc.phone || '');
        if (!phone || !(phone.includes(digits) || digits.includes(phone) || phone.endsWith(digits.slice(-8)))) {
          continue;
        }
        found.set(`lead:${id}`, {
          id,
          name: String(doc.name || '').trim(),
          phone,
          kind: 'lead',
        });
      }
    } catch (e) {
      console.warn('[nl-phone-lookup] leads', e?.message || e);
    }
  }

  return [...found.values()].slice(0, limit);
}

/**
 * Combina stubs do cliente + lookup no servidor.
 */
export async function resolveNlPhonePeople(databases, academyId, phoneDigits, clientPeople, { limit = 8 } = {}) {
  const fromClient = suggestPeopleByPhone(phoneDigits, clientPeople, limit);
  if (fromClient.length >= limit) return fromClient.slice(0, limit);
  const fromServer = await lookupPeopleByPhoneForNl(databases, academyId, phoneDigits, { limit });
  const merged = new Map();
  for (const h of [...fromClient, ...fromServer]) {
    const key = `${h.kind || 'student'}:${h.id}`;
    if (!merged.has(key)) merged.set(key, h);
  }
  return [...merged.values()].slice(0, limit);
}
