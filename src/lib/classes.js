/** Turmas (collection `classes`). */

/** @param {object | null | undefined} doc */
export function mapClassDoc(doc) {
  if (!doc) return null;
  const id = String(doc.$id || doc.id || '').trim();
  if (!id) return null;
  const maxCapacity = doc.max_capacity;
  return {
    id,
    academy_id: String(doc.academy_id || ''),
    name: String(doc.name || '').trim(),
    modality: String(doc.modality || '').trim(),
    instructor: String(doc.instructor || '').trim(),
    level: String(doc.level || '').trim(),
    description: String(doc.description || '').trim(),
    is_active: doc.is_active !== false,
    max_capacity:
      maxCapacity == null || maxCapacity === '' ? null : Math.max(0, Number(maxCapacity) || 0) || null,
    weeklyCheckinsExpected: (() => {
      const n = Number(doc.weekly_checkins_expected ?? doc.weeklyCheckinsExpected);
      if (!Number.isFinite(n) || n < 1) return null;
      return Math.min(7, Math.max(1, Math.round(n)));
    })(),
    legacy_turma_key: String(doc.legacy_turma_key || '').trim(),
    color: String(doc.color || '').trim(),
    sort_order: Number(doc.sort_order ?? 0) || 0,
    created_at: doc.$createdAt || doc.created_at || '',
    updated_at: doc.$updatedAt || doc.updated_at || '',
  };
}

/**
 * @param {object} data
 * @param {string} academyId
 */
export function buildClassPayload(data, academyId) {
  const maxRaw = data.max_capacity;
  const maxCapacity =
    maxRaw === '' || maxRaw == null || maxRaw === undefined
      ? null
      : Math.max(1, Math.min(200, Number(maxRaw) || 0)) || null;

  const weeklyRaw = data.weeklyCheckinsExpected ?? data.weekly_checkins_expected;
  const weeklyN = Number(weeklyRaw);
  const weeklyCheckins =
    weeklyRaw === '' || weeklyRaw == null || weeklyRaw === undefined || !Number.isFinite(weeklyN) || weeklyN < 1
      ? null
      : Math.min(7, Math.max(1, Math.round(weeklyN)));

  const payload = {
    academy_id: String(academyId || data.academy_id || '').trim(),
    name: String(data.name || '').trim(),
    modality: String(data.modality || '').trim(),
    instructor: String(data.instructor || '').trim(),
    level: String(data.level || '').trim(),
    description: String(data.description || '').trim(),
    is_active: data.is_active !== false,
    max_capacity: maxCapacity,
    legacy_turma_key: String(data.legacy_turma_key || '').trim(),
    color: String(data.color || '').trim(),
    sort_order: Number(data.sort_order ?? 0) || 0,
  };
  if (weeklyCheckins != null) payload.weekly_checkins_expected = weeklyCheckins;
  return payload;
}

/**
 * @param {object} data
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateClassForm(data) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!String(data?.name || '').trim()) errors.name = 'Informe o nome da turma.';
  if (!String(data?.modality || '').trim()) errors.modality = 'Informe a modalidade.';
  const max = data?.max_capacity;
  if (max !== '' && max != null && max !== undefined) {
    const n = Number(max);
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      errors.max_capacity = 'Capacidade deve ser entre 1 e 200.';
    }
  }
  const weekly = data?.weeklyCheckinsExpected ?? data?.weekly_checkins_expected;
  if (weekly !== '' && weekly != null && weekly !== undefined) {
    const w = Number(weekly);
    if (!Number.isFinite(w) || w < 1 || w > 7) {
      errors.weeklyCheckinsExpected = 'Meta semanal deve ser entre 1 e 7 check-ins.';
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function emptyClassForm() {
  return {
    name: '',
    modality: '',
    instructor: '',
    level: '',
    description: '',
    is_active: true,
    max_capacity: '',
    weeklyCheckinsExpected: '',
    legacy_turma_key: '',
    color: '',
  };
}

/** @param {number | string | null | undefined} value */
export function formatCapacityLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 'Ilimitado';
  return `até ${n} alunos`;
}

/**
 * Herda campos da turma no payload do horário quando aplicável.
 * @param {object} data
 * @param {object | null | undefined} classDoc
 */
export function mergeScheduleWithClass(data, classDoc) {
  if (!classDoc) return data;
  return {
    ...data,
    class_id: classDoc.id,
    name: String(data.name || '').trim() || classDoc.name,
    modality: String(data.modality || '').trim() || classDoc.modality,
    instructor: String(data.instructor || '').trim() || classDoc.instructor,
    level: String(data.level || '').trim() || classDoc.level,
    max_capacity:
      data.max_capacity === '' || data.max_capacity == null
        ? classDoc.max_capacity
        : data.max_capacity,
  };
}
