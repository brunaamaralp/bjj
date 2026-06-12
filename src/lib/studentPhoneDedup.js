import { normalizeEnrollmentPhone } from './publicEnrollmentSettings.js';
import { isActiveStudent } from './studentStatus.js';

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
