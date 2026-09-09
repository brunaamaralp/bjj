/**
 * Domínio puro — confirmação de professor/instrutor por ocorrência de aula.
 */

export const LESSON_STATUS_PENDING = '';
export const LESSON_STATUS_CONFIRMED = 'confirmed';
export const LESSON_STATUS_CANCELLED = 'cancelled';

export const LESSON_STATUS_LABELS = {
  [LESSON_STATUS_PENDING]: 'Pendente',
  [LESSON_STATUS_CONFIRMED]: 'Confirmada',
  [LESSON_STATUS_CANCELLED]: 'Não houve',
};

/**
 * @param {unknown} raw
 * @returns {''| 'confirmed' | 'cancelled'}
 */
export function normalizeLessonStatus(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === LESSON_STATUS_CONFIRMED) return LESSON_STATUS_CONFIRMED;
  if (s === LESSON_STATUS_CANCELLED || s === 'did_not_happen' || s === 'no_class') {
    return LESSON_STATUS_CANCELLED;
  }
  return LESSON_STATUS_PENDING;
}

/**
 * @param {object} input
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateLessonStaffConfirmInput(input = {}) {
  const status = normalizeLessonStatus(input.lesson_status);
  if (status === LESSON_STATUS_PENDING) {
    return { ok: false, error: 'Informe se a aula foi confirmada ou se não houve aula.' };
  }

  if (status === LESSON_STATUS_CANCELLED) {
    const reason = String(input.lesson_cancel_reason || '').trim();
    if (!reason) {
      return { ok: false, error: 'Informe o motivo de não ter havido aula.' };
    }
    return { ok: true };
  }

  const professorId = String(input.professor_user_id || '').trim();
  const instructorId = String(input.instructor_user_id || '').trim();
  if (!professorId && !instructorId) {
    return {
      ok: false,
      error: 'Informe o professor ou o instrutor, ou marque que não houve aula.',
    };
  }
  return { ok: true };
}

/**
 * @param {object} input
 */
export function buildLessonStaffPatch(input = {}) {
  const status = normalizeLessonStatus(input.lesson_status);
  const recordedAt =
    String(input.recorded_at || '').trim() || new Date().toISOString();
  const recordedBy = String(input.recorded_by || '').trim();
  const recordedByName = String(input.recorded_by_name || '').trim();

  if (status === LESSON_STATUS_CANCELLED) {
    return {
      lesson_status: LESSON_STATUS_CANCELLED,
      professor_user_id: '',
      professor_name: '',
      instructor_user_id: '',
      instructor_name: '',
      lesson_cancel_reason: String(input.lesson_cancel_reason || '').trim(),
      lesson_recorded_by: recordedBy,
      lesson_recorded_by_name: recordedByName,
      lesson_recorded_at: recordedAt,
    };
  }

  return {
    lesson_status: LESSON_STATUS_CONFIRMED,
    professor_user_id: String(input.professor_user_id || '').trim(),
    professor_name: String(input.professor_name || '').trim(),
    instructor_user_id: String(input.instructor_user_id || '').trim(),
    instructor_name: String(input.instructor_name || '').trim(),
    lesson_cancel_reason: '',
    lesson_recorded_by: recordedBy,
    lesson_recorded_by_name: recordedByName,
    lesson_recorded_at: recordedAt,
  };
}

/**
 * @param {object[]} slots
 * @param {{ userId?: string }} [opts]
 */
export function aggregateLessonStaffTotals(slots = [], opts = {}) {
  const userFilter = String(opts.userId || '').trim();
  /** @type {Map<string, { user_id: string, name: string, as_professor: number, as_instructor: number }>} */
  const byUser = new Map();
  let confirmedCount = 0;
  let cancelledCount = 0;
  /** @type {object[]} */
  const detail = [];

  const bump = (userId, name, role) => {
    const id = String(userId || '').trim();
    if (!id) return;
    if (userFilter && id !== userFilter) return;
    const existing = byUser.get(id) || {
      user_id: id,
      name: String(name || '').trim() || id,
      as_professor: 0,
      as_instructor: 0,
    };
    if (String(name || '').trim()) existing.name = String(name).trim();
    if (role === 'professor') existing.as_professor += 1;
    if (role === 'instructor') existing.as_instructor += 1;
    byUser.set(id, existing);
  };

  for (const slot of slots || []) {
    const status = normalizeLessonStatus(slot?.lesson_status);
    if (status === LESSON_STATUS_CANCELLED) {
      cancelledCount += 1;
      if (
        !userFilter ||
        String(slot.professor_user_id || '') === userFilter ||
        String(slot.instructor_user_id || '') === userFilter
      ) {
        // cancelled rows only in detail when filtering? Skip — cancelled don't credit anyone
      }
      continue;
    }
    if (status !== LESSON_STATUS_CONFIRMED) continue;

    confirmedCount += 1;
    const professorId = String(slot.professor_user_id || '').trim();
    const instructorId = String(slot.instructor_user_id || '').trim();

    if (userFilter && professorId !== userFilter && instructorId !== userFilter) {
      continue;
    }

    detail.push(slot);
    bump(professorId, slot.professor_name, 'professor');
    bump(instructorId, slot.instructor_name, 'instructor');
  }

  // When filtering by user, recount confirmedCount as detail length for that user
  if (userFilter) {
    confirmedCount = detail.length;
    cancelledCount = 0;
  }

  return { byUser, confirmedCount, cancelledCount, detail };
}

/**
 * @param {object[]} slots
 */
export function buildLessonStaffCsvRows(slots = []) {
  return (slots || []).map((slot) => {
    const status = normalizeLessonStatus(slot?.lesson_status);
    return {
      Data: String(slot.slot_date || '').trim(),
      Início: String(slot.time_start || '').trim(),
      Fim: String(slot.time_end || '').trim(),
      Aula: String(slot.name || '').trim(),
      Modalidade: String(slot.modality || '').trim(),
      Status: LESSON_STATUS_LABELS[status] || LESSON_STATUS_LABELS[LESSON_STATUS_PENDING],
      Professor: String(slot.professor_name || '').trim(),
      Instrutor: String(slot.instructor_name || '').trim(),
      Motivo: String(slot.lesson_cancel_reason || '').trim(),
    };
  });
}

/**
 * Lista schedules ativos que caem no weekday da data YMD.
 * @param {object[]} schedules
 * @param {string} dateYmd
 * @param {string} weekdayId mon|tue|...
 */
export function filterSchedulesForWeekday(schedules, weekdayId) {
  const day = String(weekdayId || '')
    .trim()
    .toLowerCase();
  return (schedules || [])
    .filter((s) => s && s.is_active !== false)
    .filter((s) => {
      const days = Array.isArray(s.days_of_week) ? s.days_of_week : [];
      return days.map((d) => String(d).toLowerCase()).includes(day);
    })
    .slice()
    .sort((a, b) => String(a.time_start || '').localeCompare(String(b.time_start || '')));
}
