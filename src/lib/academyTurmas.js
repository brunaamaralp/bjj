import { parseAcademySettings } from './stockSettings.js';

export const DEFAULT_ACADEMY_TURMAS = ['Kids', 'Juniores', 'Adultos'];

export const TURMA_OUTRO_VALUE = '__outro__';

export const SEM_TURMA_GROUP_LABEL = 'Sem turma';

/**
 * @param {unknown} settingsRaw
 * @returns {string[]}
 */
export function readAcademyTurmas(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.turmas;
  if (!Array.isArray(raw)) return [...DEFAULT_ACADEMY_TURMAS];
  const list = raw
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  return list.length > 0 ? list : [...DEFAULT_ACADEMY_TURMAS];
}

/**
 * @param {unknown} settingsRaw
 * @param {string[]} turmas
 */
export function mergeTurmasIntoSettings(settingsRaw, turmas) {
  const base = parseAcademySettings(settingsRaw);
  const list = (turmas || [])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  return {
    ...base,
    turmas: list.length > 0 ? list : [...DEFAULT_ACADEMY_TURMAS],
  };
}

/**
 * @param {string|null|undefined} savedTurma
 * @param {string[]} configuredTurmas
 */
export function resolveTurmaFormState(savedTurma, configuredTurmas) {
  const value = String(savedTurma || '').trim();
  if (!value) return { selectValue: '', otherText: '' };
  if (configuredTurmas.includes(value)) return { selectValue: value, otherText: '' };
  return { selectValue: TURMA_OUTRO_VALUE, otherText: value };
}

/**
 * @param {string} selectValue
 * @param {string} otherText
 */
export function turmaValueFromForm(selectValue, otherText) {
  if (!selectValue) return '';
  if (selectValue === TURMA_OUTRO_VALUE) return String(otherText || '').trim().slice(0, 64);
  return String(selectValue).trim().slice(0, 64);
}

/**
 * Chave de agrupamento em Mensalidades: turma do aluno ou fallback legado.
 * @param {object} student
 * @param {string[]} [configuredTurmas]
 */
export function studentTurmaGroupKey(student, configuredTurmas = []) {
  const turma = String(student?.turma || student?.className || student?.class_name || '').trim();
  if (turma) return turma;

  const t = String(student?.type || '').trim();
  const low = t.toLowerCase();
  if (low.includes('crian') || low === 'criança') {
    const kids = configuredTurmas.find((x) => x.toLowerCase().includes('kid')) || 'Kids';
    return kids;
  }
  if (low.includes('junior')) {
    const j = configuredTurmas.find((x) => x.toLowerCase().includes('junior')) || 'Juniores';
    return j;
  }
  if (low.includes('adult')) {
    const a = configuredTurmas.find((x) => x.toLowerCase().includes('adult')) || 'Adultos';
    return a;
  }
  return SEM_TURMA_GROUP_LABEL;
}

/**
 * @param {string[]} keys
 * @param {string[]} configuredTurmas
 */
export function sortTurmaGroupKeys(keys, configuredTurmas = []) {
  const sem = SEM_TURMA_GROUP_LABEL;
  const order = [...configuredTurmas];
  return [...keys].sort((a, b) => {
    if (a === sem && b !== sem) return 1;
    if (b === sem && a !== sem) return -1;
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'pt-BR');
  });
}
