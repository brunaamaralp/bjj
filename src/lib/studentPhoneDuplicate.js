import { normalizeEnrollmentPhone } from './publicEnrollmentSettings.js';
import { isActiveStudent } from './studentStatus.js';
import { apiFindStudentsByPhone } from './studentsApi.js';

/** Mesma normalização usada em matrícula pública e WhatsApp. */
export function normalizePhoneDedup(raw) {
  return normalizeEnrollmentPhone(raw);
}

/** Nome normalizado para deduplicação (mesma pessoa, não mesmo responsável). */
export function normalizeNameDedup(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function namesMatchForDedup(a, b) {
  const left = normalizeNameDedup(a);
  const right = normalizeNameDedup(b);
  if (!left || !right || left.length < 2 || right.length < 2) return false;
  return left === right;
}

function phonesMatch(a, b) {
  const left = normalizePhoneDedup(a);
  const right = normalizePhoneDedup(b);
  if (!left || !right || left.length < 8 || right.length < 8) return false;
  return left === right;
}

function recordMatchesPhoneAndName(record, phone, name) {
  if (!phonesMatch(record?.phone, phone)) return false;
  const compareName = String(name || '').trim();
  if (compareName.length < 2) return false;
  return namesMatchForDedup(record?.name, compareName);
}

export function findLocalStudentByPhone(students, phone, { excludeId = '', name = '' } = {}) {
  const excl = String(excludeId || '').trim();
  for (const s of students || []) {
    const id = String(s?.id || '').trim();
    if (!id || (excl && id === excl)) continue;
    if (!recordMatchesPhoneAndName(s, phone, name)) continue;
    if (!isActiveStudent(s)) continue;
    return s;
  }
  return null;
}

export function findLocalLeadByPhone(leads, phone, { excludeId = '', name = '' } = {}) {
  const excl = String(excludeId || '').trim();
  for (const l of leads || []) {
    const id = String(l?.id || '').trim();
    if (!id || (excl && id === excl)) continue;
    if (!recordMatchesPhoneAndName(l, phone, name)) continue;
    return l;
  }
  return null;
}

/**
 * Busca aluno ativo com o mesmo telefone (store local + API para órfãos/fora da página).
 */
export async function findActiveStudentByPhone({
  phone,
  name = '',
  academyId,
  students = [],
  excludeStudentId = '',
}) {
  const local = findLocalStudentByPhone(students, phone, { excludeId: excludeStudentId, name });
  if (local) return { source: 'local', student: local };

  const aid = String(academyId || '').trim();
  if (!aid || normalizePhoneDedup(phone).length < 8) return null;
  if (String(name || '').trim().length < 2) return null;

  try {
    const matches = await apiFindStudentsByPhone(phone, aid);
    for (const m of matches) {
      const s = m?.student;
      const id = String(s?.id || m?.id || '').trim();
      if (!id || (excludeStudentId && id === excludeStudentId)) continue;
      if (!recordMatchesPhoneAndName(s, phone, name)) continue;
      if (!isActiveStudent(s)) continue;
      return { source: 'api', student: s };
    }
  } catch {
    void 0;
  }
  return null;
}

export function studentPhoneDuplicateError(student) {
  const name = String(student?.name || 'outro aluno').trim() || 'outro aluno';
  const err = new Error(`phone_duplicate_active:${name}`);
  err.code = 'phone_duplicate';
  return err;
}
