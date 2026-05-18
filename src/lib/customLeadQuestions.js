/**
 * Perguntas customizadas do funil (academy.customLeadQuestions).
 * Tipos: text, number, boolean, checkbox (alias de boolean), select.
 */

export function createQuestionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    void 0;
  }
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

export function normalizeQuestionType(type) {
  const t = String(type || 'text').trim().toLowerCase();
  if (t === 'checkbox') return 'boolean';
  return t || 'text';
}

/**
 * @param {unknown} input
 * @returns {{ questions: Array<{ id: string, label: string, type: string, options?: string[] }>, migrated: boolean }}
 */
export function normalizeCustomLeadQuestions(input) {
  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return { questions: [], migrated: false };
  const cleaned = raw.filter(Boolean);
  if (cleaned.length === 0) return { questions: [], migrated: false };

  let migrated = false;
  if (typeof cleaned[0] === 'string') {
    migrated = true;
    const questions = cleaned
      .map((label) => String(label || '').trim())
      .filter(Boolean)
      .map((label) => ({ id: createQuestionId(), label, type: 'text' }));
    return { questions, migrated };
  }

  const questions = cleaned
    .map((q) => {
      const label = String(q?.label || q?.name || '').trim();
      let id = String(q?.id || '').trim();
      const type = normalizeQuestionType(q?.type);
      const options = Array.isArray(q?.options)
        ? q.options.map((s) => String(s).trim()).filter(Boolean)
        : typeof q?.options === 'string'
          ? q.options
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      if (!label) {
        migrated = true;
        return null;
      }
      if (!id) {
        migrated = true;
        id = createQuestionId();
      }
      const base = { id, label, type };
      if (type === 'select') return { ...base, options: options || [] };
      return base;
    })
    .filter(Boolean);

  return { questions, migrated };
}

/** @param {unknown} value */
export function hasCustomAnswerValue(value) {
  if (value === true || value === false) return true;
  return String(value ?? '').trim() !== '';
}

/** @param {unknown} value @param {string} type */
export function formatCustomAnswerDisplay(value, type) {
  const t = normalizeQuestionType(type);
  if (t === 'boolean') {
    if (value === true || value === 'true' || value === 'Sim') return 'Sim';
    if (value === false || value === 'false' || value === 'Não') return 'Não';
    return String(value ?? '').trim() || '—';
  }
  if (value === true) return 'Sim';
  if (value === false) return 'Não';
  return String(value ?? '').trim();
}

/** Texto padronizado para evento note na timeline: "[label]: [resposta]" */
export function formatEnrollmentAnswerNote(label, value, type) {
  const lbl = String(label || '').trim();
  if (!lbl) return '';
  return `${lbl}: ${formatCustomAnswerDisplay(value, type)}`;
}

/**
 * @param {Array<{ id: string, label: string, type: string }>} questions
 * @param {Record<string, unknown>} answers
 */
export function buildCustomAnswersPatch(questions, answers) {
  const patch = {};
  for (const q of questions || []) {
    const qid = String(q?.id || '').trim();
    if (!qid) continue;
    const raw = answers[qid];
    if (!hasCustomAnswerValue(raw)) continue;
    const t = normalizeQuestionType(q.type);
    if (t === 'boolean') {
      patch[qid] = raw === true || raw === 'true' || raw === 'Sim';
    } else if (t === 'number') {
      const n = Number(raw);
      patch[qid] = Number.isFinite(n) ? n : String(raw).trim();
    } else {
      patch[qid] = String(raw).trim();
    }
  }
  return patch;
}
