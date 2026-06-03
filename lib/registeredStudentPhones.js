import { normalizeEnrollmentPhone } from '../src/lib/publicEnrollmentSettings.js';

/** Telefones do cadastro de aluno que identificam pai/responsável ou o próprio aluno. */
export function collectRegisteredPhonesFromStudentDoc(doc) {
  const phones = new Set();
  const add = (v) => {
    const n = normalizeEnrollmentPhone(v);
    if (n) phones.add(n);
  };
  add(doc?.phone);
  add(doc?.emergencyPhone);
  add(doc?.emergency_phone);
  return phones;
}

export function studentDocMatchesPhone(doc, phone) {
  const target = normalizeEnrollmentPhone(phone);
  if (!target) return false;
  return collectRegisteredPhonesFromStudentDoc(doc).has(target);
}
