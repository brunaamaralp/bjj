/**
 * Registro operacional de aula (professor + observações) na Recepção.
 * Domínio puro — sem I/O.
 */

import { addDaysYmd, weekdayCodeInTz } from '../../lib/bookingDateTime.js';

const WEEKDAY_INDEX = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

const NOTES_MAX = 4000;
const NAME_MAX = 100;

/**
 * YMD da coluna (mon…sun) na semana corrente (segunda–domingo) relativa a `todayYmd`.
 * @param {string} weekdayId
 * @param {string} todayYmd YYYY-MM-DD
 * @param {string} [timeZone]
 */
export function ymdForWeekdayInCurrentWeek(
  weekdayId,
  todayYmd,
  timeZone = 'America/Sao_Paulo'
) {
  const target = WEEKDAY_INDEX[String(weekdayId || '').trim().toLowerCase()];
  const today = String(todayYmd || '').trim();
  if (target == null || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return '';

  const todayCode = weekdayCodeInTz(today, timeZone);
  const todayIdx = WEEKDAY_INDEX[todayCode];
  if (todayIdx == null) return '';

  const mondayYmd = addDaysYmd(today, -todayIdx, timeZone);
  return addDaysYmd(mondayYmd, target, timeZone);
}

/**
 * @param {{
 *   instructorId?: string,
 *   instructorName?: string,
 *   notes?: string,
 *   recordedBy?: string,
 *   recordedByName?: string,
 *   recordedAt?: string,
 * }} input
 */
export function buildLessonRegisterPatch(input = {}) {
  const recordedAt =
    String(input.recordedAt || '').trim() || new Date().toISOString();
  return {
    instructor_id: String(input.instructorId || '').trim(),
    instructor: String(input.instructorName || '').trim().slice(0, NAME_MAX),
    lesson_notes: String(input.notes || '').trim().slice(0, NOTES_MAX),
    lesson_recorded_by: String(input.recordedBy || '').trim().slice(0, 128),
    lesson_recorded_by_name: String(input.recordedByName || '').trim().slice(0, 128),
    lesson_recorded_at: recordedAt,
  };
}

/** @param {object | null | undefined} slot */
export function hasLessonRegister(slot) {
  if (!slot || typeof slot !== 'object') return false;
  return Boolean(
    String(slot.lesson_recorded_at || '').trim() ||
      String(slot.instructor_id || '').trim() ||
      String(slot.lesson_notes || '').trim()
  );
}

/** @param {object | null | undefined} doc */
export function mapInstructorDoc(doc) {
  if (!doc) return null;
  const id = String(doc.$id || doc.id || '').trim();
  if (!id) return null;
  return {
    id,
    academy_id: String(doc.academy_id || '').trim(),
    name: String(doc.name || '').trim(),
    is_active: doc.is_active !== false,
    sort_order: Number(doc.sort_order ?? 0) || 0,
    created_at: doc.$createdAt || doc.created_at || '',
    updated_at: doc.$updatedAt || doc.updated_at || '',
  };
}

/**
 * @param {object} data
 * @param {string} academyId
 */
export function buildInstructorPayload(data, academyId) {
  return {
    academy_id: String(academyId || data?.academy_id || '').trim(),
    name: String(data?.name || '').trim().slice(0, NAME_MAX),
    is_active: data?.is_active !== false,
    sort_order: Number(data?.sort_order ?? 0) || 0,
  };
}

/**
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateInstructorForm(data) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!String(data?.name || '').trim()) errors.name = 'Informe o nome do professor.';
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * @param {Array<{ id?: string, name?: string }>} instructors
 * @param {string} name
 */
export function matchInstructorByName(instructors, name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  const found = (instructors || []).find(
    (i) => String(i?.name || '').trim().toLowerCase() === needle
  );
  return found || null;
}

export { NOTES_MAX, NAME_MAX };
