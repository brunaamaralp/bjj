import { parseAcademySettings } from './stockSettings.js';

export const DEFAULT_BELT_GRADES = [
  'Branca',
  'Azul',
  'Roxa',
  'Marrom',
  'Preta',
];

export function parseBeltGradesFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.beltGrades;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean);
}

export function serializeBeltGrades(list) {
  return JSON.stringify(parseBeltGradesList(list));
}

export function parseBeltGradesList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const label = String(item || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function mergeBeltGradesIntoSettings(settingsRaw, list) {
  const base = parseAcademySettings(settingsRaw);
  const grades = parseBeltGradesList(list);
  if (grades.length === 0) {
    const { beltGrades: _removed, ...rest } = base;
    return rest;
  }
  return { ...base, beltGrades: grades };
}

/** Academia salvou ao menos uma graduação em settings.beltGrades. */
export function graduationsActive(settingsRaw) {
  return parseBeltGradesFromSettings(settingsRaw).length > 0;
}

/**
 * Opções para select de graduação.
 * @param {unknown} settingsRaw
 * @param {string} [currentBelt]
 */
export function resolveBeltOptions(settingsRaw, currentBelt = '') {
  const configured = parseBeltGradesFromSettings(settingsRaw);
  const cur = String(currentBelt || '').trim();
  if (configured.length === 0) {
    return cur ? [cur] : [];
  }
  if (cur && !configured.some((g) => g.toLowerCase() === cur.toLowerCase())) {
    return [...configured, cur];
  }
  return configured;
}

/** Exibir campo graduação no cadastro/perfil. */
export function shouldShowStudentGraduation(settingsRaw, currentBelt = '') {
  return graduationsActive(settingsRaw) || Boolean(String(currentBelt || '').trim());
}

/** Modo somente leitura quando há valor legado e graduações desativadas. */
export function isGraduationReadOnly(settingsRaw, currentBelt = '') {
  return !graduationsActive(settingsRaw) && Boolean(String(currentBelt || '').trim());
}

/**
 * Sanitiza valor antes de persistir.
 * @param {unknown} raw
 * @param {unknown} settingsRaw
 * @param {string} [previousBelt]
 * @param {{ invalidMessage?: string }} [opts]
 */
export function normalizeBeltValue(raw, settingsRaw, previousBelt = '', opts = {}) {
  const val = String(raw ?? '').trim().slice(0, 256);
  const prev = String(previousBelt || '').trim().slice(0, 256);
  const invalidMessage = String(opts.invalidMessage || 'Selecione uma graduação válida.').trim();

  if (!val) return '';

  if (!graduationsActive(settingsRaw)) {
    return prev;
  }

  const options = resolveBeltOptions(settingsRaw, prev);
  const lower = val.toLowerCase();
  const allowed = options.some((o) => o.toLowerCase() === lower);
  if (!allowed) {
    throw new Error(invalidMessage);
  }
  return val;
}
