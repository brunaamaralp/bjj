import { parseAcademySettings } from './stockSettings.js';
import { normalizeCustomLeadQuestions } from './customLeadQuestions.js';
import { readAcademyTurmas } from './academyTurmas.js';
import {
  graduationsActive,
  normalizeBeltValue,
  parseBeltGradesFromSettings,
} from './beltGradesConfig.js';
import { TERMS } from './terminology.js';
export const PUBLIC_ENROLLMENT_ORIGIN = 'Cadastro online';

export function normalizeEnrollmentPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
}

/** @param {{ financeConfig?: unknown }} academyDoc */
export function readAcademyPlanNames(academyDoc) {
  try {
    const raw = academyDoc?.financeConfig;
    const fc = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
    const names = (fc?.plans || [])
      .map((p) => String(p?.name || '').trim())
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'pt'));
  } catch {
    return [];
  }
}

/** @typedef {{ enabled?: boolean, salt?: string, askBelt?: boolean }} PublicEnrollmentConfig */

export function graduationLabelForVertical(vertical) {
  return String(vertical || '').trim() === 'physio' ? TERMS.physio.belt : TERMS.fitness.belt;
}

/**
 * @param {unknown} settingsRaw
 * @returns {PublicEnrollmentConfig}
 */
export function readPublicEnrollment(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.publicEnrollment;
  if (!raw || typeof raw !== 'object') return { enabled: false, salt: '', askBelt: false };
  return {
    enabled: raw.enabled === true,
    salt: String(raw.salt || '').trim(),
    askBelt: raw.askBelt === true,
  };
}

/**
 * @param {unknown} settingsRaw
 * @param {PublicEnrollmentConfig} patch
 */
export function mergePublicEnrollmentIntoSettings(settingsRaw, patch) {
  const base = parseAcademySettings(settingsRaw);
  const prev = readPublicEnrollment(settingsRaw);
  return {
    ...base,
    publicEnrollment: {
      enabled: patch.enabled !== undefined ? patch.enabled === true : prev.enabled,
      salt: patch.salt !== undefined ? String(patch.salt ?? '').trim() : prev.salt,
      askBelt: patch.askBelt !== undefined ? patch.askBelt === true : prev.askBelt,
    },
  };
}

/**
 * Sanitiza belt no POST público — ignora se graduações/askBelt inativos.
 * @param {object} form
 * @param {unknown} settingsRaw
 */
export function resolvePublicEnrollmentBelt(form, settingsRaw) {
  const enrollment = readPublicEnrollment(settingsRaw);
  if (!graduationsActive(settingsRaw) || !enrollment.askBelt) return '';
  const raw = String(form?.belt ?? '').trim();
  if (!raw) return '';
  try {
    return normalizeBeltValue(raw, settingsRaw, '');
  } catch {
    return '';
  }
}

export function generateEnrollmentSalt() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    void 0;
  }
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}`;
}

/**
 * @param {string} token
 * @param {string} [baseUrl]
 */
export function buildPublicEnrollmentPath(token) {
  const t = encodeURIComponent(String(token || '').trim());
  return `/inscricao/${t}`;
}

/**
 * @param {string} token
 * @param {string} [baseUrl]
 */
export function buildPublicEnrollmentUrl(token, baseUrl) {
  const path = buildPublicEnrollmentPath(token);
  const base = String(baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).trim();
  if (!base) return path;
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * Dados públicos seguros para o formulário.
 * @param {{ name?: string, settings?: unknown, customLeadQuestions?: unknown }} academyDoc
 */
export function buildPublicEnrollmentFormConfig(academyDoc) {
  const enrollment = readPublicEnrollment(academyDoc?.settings);
  const plans = readAcademyPlanNames(academyDoc);
  const { questions } = normalizeCustomLeadQuestions(academyDoc?.customLeadQuestions);
  const publicQuestions = questions.map((q) => ({
    id: q.id,
    label: q.label,
    type: q.type,
    ...(q.type === 'select' && Array.isArray(q.options) ? { options: q.options } : {}),
  }));

  const vertical = String(academyDoc?.vertical || '').trim() === 'physio' ? 'physio' : 'fitness';
  const gradActive = graduationsActive(academyDoc?.settings);

  return {
    enabled: enrollment.enabled === true && Boolean(enrollment.salt),
    academyName: String(academyDoc?.name || academyDoc?.academyName || 'Academia').trim() || 'Academia',
    turmas: readAcademyTurmas(academyDoc?.settings),
    plans,
    requirePlan: plans.length > 0,
    customQuestions: publicQuestions,
    vertical,
    graduationLabel: graduationLabelForVertical(vertical),
    graduationsActive: gradActive,
    askBelt: enrollment.askBelt === true && gradActive,
    beltOptions: gradActive ? parseBeltGradesFromSettings(academyDoc?.settings) : [],
  };
}
