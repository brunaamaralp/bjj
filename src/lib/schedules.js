/** Grade de horários (collection `schedules`). */

export const SCHEDULE_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const SCHEDULE_WEEKDAY_LABELS = {
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sáb',
  sun: 'Dom',
};

export const SCHEDULE_LEVEL_SUGGESTIONS = [
  'Iniciante',
  'Intermediário',
  'Avançado',
  'Todos os níveis',
];

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** @param {string} raw */
export function normalizeScheduleTime(raw) {
  return String(raw || '').trim().slice(0, 5);
}

/** @param {string} a @param {string} b */
export function compareTimeHHMM(a, b) {
  const ta = normalizeScheduleTime(a);
  const tb = normalizeScheduleTime(b);
  return ta.localeCompare(tb);
}

/** @param {string} start @param {string} end */
export function isTimeEndAfterStart(start, end) {
  const s = normalizeScheduleTime(start);
  const e = normalizeScheduleTime(end);
  if (!HHMM_RE.test(s) || !HHMM_RE.test(e)) return false;
  return compareTimeHHMM(s, e) < 0;
}

/** @param {unknown} raw */
export function normalizeDaysOfWeek(raw) {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(SCHEDULE_WEEKDAYS);
  return raw
    .map((d) => String(d || '').trim().toLowerCase())
    .filter((d) => valid.has(d));
}

/** @param {object | null | undefined} doc */
export function mapScheduleDoc(doc) {
  if (!doc) return null;
  const id = String(doc.$id || doc.id || '').trim();
  if (!id) return null;
  return {
    id,
    academy_id: String(doc.academy_id || ''),
    class_id: String(doc.class_id || '').trim(),
    name: String(doc.name || '').trim(),
    modality: String(doc.modality || '').trim(),
    instructor: String(doc.instructor || '').trim(),
    days_of_week: normalizeDaysOfWeek(doc.days_of_week),
    time_start: normalizeScheduleTime(doc.time_start),
    time_end: normalizeScheduleTime(doc.time_end),
    level: String(doc.level || '').trim(),
    is_active: doc.is_active !== false,
    max_capacity:
      doc.max_capacity == null || doc.max_capacity === ''
        ? null
        : Math.max(1, Number(doc.max_capacity) || 0) || null,
    created_at: doc.$createdAt || doc.created_at || '',
    updated_at: doc.$updatedAt || doc.updated_at || '',
  };
}

/**
 * @param {object} data
 * @param {string} academyId
 */
export function buildSchedulePayload(data, academyId) {
  const maxRaw = data.max_capacity;
  const maxCapacity =
    maxRaw === '' || maxRaw == null || maxRaw === undefined
      ? null
      : Math.max(1, Math.min(200, Number(maxRaw) || 0)) || null;

  return {
    academy_id: String(academyId || data.academy_id || '').trim(),
    class_id: String(data.class_id || '').trim(),
    name: String(data.name || '').trim(),
    modality: String(data.modality || '').trim(),
    instructor: String(data.instructor || '').trim(),
    days_of_week: normalizeDaysOfWeek(data.days_of_week),
    time_start: normalizeScheduleTime(data.time_start),
    time_end: normalizeScheduleTime(data.time_end),
    level: String(data.level || '').trim(),
    is_active: data.is_active !== false,
    max_capacity: maxCapacity,
  };
}

/**
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateScheduleForm(data) {
  /** @type {Record<string, string>} */
  const errors = {};
  const name = String(data?.name || '').trim();
  const modality = String(data?.modality || '').trim();
  const days = normalizeDaysOfWeek(data?.days_of_week);
  const timeStart = normalizeScheduleTime(data?.time_start);
  const timeEnd = normalizeScheduleTime(data?.time_end);

  if (!name) errors.name = 'Informe o nome da aula.';
  if (!String(data?.class_id || '').trim()) errors.class_id = 'Selecione a turma.';
  if (!modality) errors.modality = 'Informe a modalidade.';
  if (!days.length) errors.days_of_week = 'Selecione ao menos um dia da semana.';
  if (!HHMM_RE.test(timeStart)) errors.time_start = 'Horário de início inválido (HH:MM).';
  if (!HHMM_RE.test(timeEnd)) errors.time_end = 'Horário de fim inválido (HH:MM).';
  if (
    HHMM_RE.test(timeStart) &&
    HHMM_RE.test(timeEnd) &&
    !isTimeEndAfterStart(timeStart, timeEnd)
  ) {
    errors.time_end = 'O horário de fim deve ser posterior ao início.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** @param {string[]} days */
export function formatScheduleDays(days) {
  const list = normalizeDaysOfWeek(days);
  return list.map((d) => SCHEDULE_WEEKDAY_LABELS[d] || d).join(', ');
}

/** @param {object[]} schedules */
export function collectScheduleModalities(schedules) {
  const set = new Set();
  for (const s of schedules || []) {
    const m = String(s?.modality || '').trim();
    if (m) set.add(m);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** @param {object[]} schedules */
export function groupSchedulesByModality(schedules) {
  /** @type {Map<string, object[]>} */
  const groups = new Map();
  for (const s of schedules || []) {
    const key = String(s?.modality || 'Outros').trim() || 'Outros';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([modality, items]) => ({
      modality,
      items: items.sort(
        (x, y) =>
          compareTimeHHMM(x.time_start, y.time_start) ||
          String(x.name || '').localeCompare(String(y.name || ''), 'pt-BR')
      ),
    }));
}

/**
 * Grade semanal: colunas = dias, linhas = horários de início.
 * @param {object[]} schedules
 * @param {{ columns?: { id: string, label: string }[] }} [options]
 */
export function buildWeeklyScheduleGrid(schedules, options = {}) {
  const active = (schedules || []).filter((s) => s?.is_active !== false);
  const timeSet = new Set();
  for (const s of active) {
    const t = normalizeScheduleTime(s.time_start);
    if (t) timeSet.add(t);
  }
  const times = [...timeSet].sort(compareTimeHHMM);
  const columns =
    options.columns?.length
      ? options.columns
      : SCHEDULE_WEEKDAYS.map((id) => ({
          id,
          label: SCHEDULE_WEEKDAY_LABELS[id],
        }));
  const columnIds = columns.map((c) => c.id);
  const rows = times.map((timeStart) => {
    /** @type {Record<string, object[]>} */
    const cells = {};
    for (const day of columnIds) {
      cells[day] = active.filter(
        (s) =>
          normalizeScheduleTime(s.time_start) === timeStart &&
          normalizeDaysOfWeek(s.days_of_week).includes(day)
      );
    }
    return { timeStart, cells };
  });
  return { columns, rows, hasAny: active.length > 0 };
}

/** @param {object[]} schedules @param {string | null | undefined} modality */
export function filterSchedulesByModality(schedules, modality) {
  const m = String(modality || '').trim();
  if (!m) return schedules || [];
  return (schedules || []).filter((s) => String(s.modality || '').trim() === m);
}

export function emptyScheduleForm() {
  return {
    class_id: '',
    name: '',
    modality: '',
    instructor: '',
    level: '',
    days_of_week: [],
    time_start: '',
    time_end: '',
    is_active: true,
    max_capacity: '',
  };
}
