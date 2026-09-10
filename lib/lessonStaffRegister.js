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

/** Separador de ids em `instructor_user_id` (refs usam `:` / não usam `|`). */
export const LESSON_INSTRUCTOR_ID_SEP = '|';

export const LESSON_INSTRUCTORS_MAX = 12;

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
 * @param {{ id?: string, name?: string, nome?: string }[]} list
 * @returns {{ id: string, name: string }[]}
 */
export function normalizeInstructorEntries(list = []) {
  /** @type {Map<string, { id: string, name: string }>} */
  const byId = new Map();
  for (const raw of list || []) {
    const id = String(raw?.id || '').trim();
    if (!id) continue;
    const name = String(raw?.name || raw?.nome || '').trim();
    const prev = byId.get(id);
    byId.set(id, { id, name: name || prev?.name || '' });
  }
  return [...byId.values()].slice(0, LESSON_INSTRUCTORS_MAX);
}

/**
 * Lê instrutores de um slot ou payload (array, JSON, ou campos legados `|`).
 * @param {object | null | undefined} source
 * @returns {{ id: string, name: string }[]}
 */
export function parseLessonInstructors(source = {}) {
  if (Array.isArray(source?.instructors)) {
    return normalizeInstructorEntries(source.instructors);
  }

  const jsonRaw = String(source?.instructors_json || '').trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (Array.isArray(parsed)) return normalizeInstructorEntries(parsed);
    } catch {
      /* ignore */
    }
  }

  if (Array.isArray(source?.instructor_user_ids)) {
    const ids = source.instructor_user_ids;
    const names = Array.isArray(source?.instructor_names) ? source.instructor_names : [];
    return normalizeInstructorEntries(
      ids.map((id, i) => ({ id, name: names[i] || '' }))
    );
  }

  const idBlob = String(source?.instructor_user_id || '').trim();
  const nameBlob = String(source?.instructor_name || '').trim();
  if (!idBlob && !nameBlob) return [];

  const ids = idBlob.includes(LESSON_INSTRUCTOR_ID_SEP)
    ? idBlob.split(LESSON_INSTRUCTOR_ID_SEP).map((s) => s.trim()).filter(Boolean)
    : idBlob
      ? [idBlob]
      : [];
  const names = nameBlob
    ? nameBlob.split(' · ').map((s) => s.trim()).filter(Boolean)
    : [];

  return normalizeInstructorEntries(ids.map((id, i) => ({ id, name: names[i] || '' })));
}

/**
 * @param {{ id: string, name: string }[]} entries
 */
export function serializeLessonInstructors(entries = []) {
  const list = normalizeInstructorEntries(entries);
  return {
    instructor_user_id: list.map((e) => e.id).join(LESSON_INSTRUCTOR_ID_SEP),
    instructor_name: list.map((e) => e.name).filter(Boolean).join(' · '),
  };
}

/**
 * @param {object | null | undefined} slot
 */
export function formatLessonTeamNames(slot) {
  const professor = String(slot?.professor_name || '').trim();
  const fromParsed = parseLessonInstructors(slot)
    .map((e) => e.name)
    .filter(Boolean);
  if (fromParsed.length) {
    return [professor, ...fromParsed].filter(Boolean).join(' · ');
  }
  const legacyInstr = String(slot?.instructor_name || '').trim();
  return [professor, legacyInstr].filter(Boolean).join(' · ');
}

/**
 * Badge compacto para card da grade / lista.
 * @param {object | null | undefined} slot
 * @returns {{ tone: 'ok' | 'warn' | 'pending', label: string, shortLabel: string }}
 */
export function buildLessonStaffCardBadge(slot) {
  const status = normalizeLessonStatus(slot?.lesson_status);
  if (status === LESSON_STATUS_CONFIRMED) {
    const names = formatLessonTeamNames(slot);
    return {
      tone: 'ok',
      label: names || LESSON_STATUS_LABELS[LESSON_STATUS_CONFIRMED],
      shortLabel: LESSON_STATUS_LABELS[LESSON_STATUS_CONFIRMED],
    };
  }
  if (status === LESSON_STATUS_CANCELLED) {
    const reason = String(slot?.lesson_cancel_reason || '').trim();
    return {
      tone: 'warn',
      label: reason || LESSON_STATUS_LABELS[LESSON_STATUS_CANCELLED],
      shortLabel: LESSON_STATUS_LABELS[LESSON_STATUS_CANCELLED],
    };
  }
  return {
    tone: 'pending',
    label: 'Confirmar equipe',
    shortLabel: LESSON_STATUS_LABELS[LESSON_STATUS_PENDING],
  };
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
  const instructors = parseLessonInstructors(input);
  if (!professorId && instructors.length === 0) {
    return {
      ok: false,
      error: 'Informe o professor ou pelo menos um instrutor, ou marque que não houve aula.',
    };
  }
  if (instructors.length > LESSON_INSTRUCTORS_MAX) {
    return {
      ok: false,
      error: `Selecione no máximo ${LESSON_INSTRUCTORS_MAX} instrutores.`,
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

  const instructors = parseLessonInstructors(input);
  const serialized = serializeLessonInstructors(instructors);

  return {
    lesson_status: LESSON_STATUS_CONFIRMED,
    professor_user_id: String(input.professor_user_id || '').trim(),
    professor_name: String(input.professor_name || '').trim(),
    instructor_user_id: serialized.instructor_user_id,
    instructor_name: serialized.instructor_name,
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
      continue;
    }
    if (status !== LESSON_STATUS_CONFIRMED) continue;

    confirmedCount += 1;
    const professorId = String(slot.professor_user_id || '').trim();
    const instructors = parseLessonInstructors(slot);
    const instructorIds = instructors.map((e) => e.id).filter(Boolean);

    if (
      userFilter &&
      professorId !== userFilter &&
      !instructorIds.includes(userFilter)
    ) {
      continue;
    }

    detail.push(slot);
    bump(professorId, slot.professor_name, 'professor');
    for (const entry of instructors) {
      bump(entry.id, entry.name, 'instructor');
    }
  }

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
    const instructors = parseLessonInstructors(slot)
      .map((e) => e.name)
      .filter(Boolean)
      .join(' · ');
    return {
      Data: String(slot.slot_date || '').trim(),
      Início: String(slot.time_start || '').trim(),
      Fim: String(slot.time_end || '').trim(),
      Aula: String(slot.name || '').trim(),
      Modalidade: String(slot.modality || '').trim(),
      Status: LESSON_STATUS_LABELS[status] || LESSON_STATUS_LABELS[LESSON_STATUS_PENDING],
      Professor: String(slot.professor_name || '').trim(),
      Instrutores: instructors || String(slot.instructor_name || '').trim(),
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
