import { parseAcademySettings } from './stockSettings.js';

export const DEFAULT_ACADEMY_TURMAS = ['Kids', 'Juniores', 'Adultos'];

export const TURMA_OUTRO_VALUE = '__outro__';

export const SEM_TURMA_GROUP_LABEL = 'Sem turma';

/**
 * Chave estável para deduplicar turmas legadas na collection `classes`.
 * @param {string} label
 */
export function legacyTurmaKeyFromLabel(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/**
 * @param {string} label
 */
export function inferModalityFromTurmaLabel(label) {
  const low = String(label || '').toLowerCase();
  if (low.includes('kid') || low.includes('crian') || low.includes('pequenos campe')) return 'kids';
  if (low.includes('junior')) return 'juniores';
  if (low.includes('fit') || low.includes('func')) return 'fitness';
  if (low.includes('comp')) return 'competicao';
  return 'bjj';
}

/**
 * Turmas explicitamente salvas em settings.turmas (não aplica fallback padrão).
 * @param {unknown} settingsRaw
 * @returns {string[]}
 */
export function readExplicitAcademyTurmas(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  if (!Array.isArray(settings?.turmas)) return [];
  return settings.turmas
    .map((t) => String(t || '').trim())
    .filter(Boolean);
}

/**
 * @param {unknown} settingsRaw
 * @returns {string[]}
 */
export function readAcademyTurmas(settingsRaw) {
  const explicit = readExplicitAcademyTurmas(settingsRaw);
  if (explicit.length > 0) return explicit;
  return [...DEFAULT_ACADEMY_TURMAS];
}

/**
 * Nomes de turma a partir de docs da collection `classes`.
 * @param {object[]} classes
 */
export function classDocsToTurmaLabels(classes) {
  const names = (classes || [])
    .filter((c) => c?.is_active !== false)
    .map((c) => String(c?.name || '').trim())
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Fonte canônica: `classes` ativas → settings.turmas → padrão do sistema.
 * @param {{ settingsRaw?: unknown, classes?: object[] }} [opts]
 */
export function resolveAcademyTurmaLabels({ settingsRaw, classes } = {}) {
  const fromClasses = classDocsToTurmaLabels(classes);
  if (fromClasses.length > 0) return fromClasses;
  return readAcademyTurmas(settingsRaw);
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
/**
 * Fallback legado: infere perfil do lead (Adulto/Criança/Juniores) a partir do nome da turma.
 * @param {string|null|undefined} turma
 */
export function profileTypeFromTurma(turma) {
  const low = String(turma || '').toLowerCase();
  if (low.includes('kid') || low.includes('crian') || low.includes('pequenos campe')) return 'Criança';
  if (low.includes('junior')) return 'Juniores';
  return 'Adulto';
}

function normalizeTurmaCompareKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Unifica rótulos legados de turma (ex.: "GBK Juniores" → "Juniores").
 * @param {string|null|undefined} turma
 * @param {string[]} [configuredTurmas]
 */
export function canonicalTurmaGroupLabel(turma, configuredTurmas = []) {
  const raw = String(turma || '').trim();
  if (!raw) return raw;

  const key = normalizeTurmaCompareKey(raw);
  if (key.includes('junior')) {
    const configured = (configuredTurmas || []).find((x) =>
      normalizeTurmaCompareKey(x).includes('junior')
    );
    return configured || 'Juniores';
  }

  return raw;
}

export function studentTurmaGroupKey(student, configuredTurmas = []) {
  const turma = String(student?.turma || student?.className || student?.class_name || '').trim();
  if (turma) return canonicalTurmaGroupLabel(turma, configuredTurmas);

  const t = String(student?.type || '').trim();
  const low = t.toLowerCase();
  if (low.includes('crian') || low === 'criança') {
    const kids =
      configuredTurmas.find((x) => x.toLowerCase().includes('pequenos campe')) ||
      configuredTurmas.find((x) => x.toLowerCase().includes('kid')) ||
      'Kids';
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
