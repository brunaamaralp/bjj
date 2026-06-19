import { enrollmentDateYmd, enrollmentIngressYmd, formatLocalYmd } from './studentEnrollmentDate.js';
import { parseFinanceConfigRaw } from './financeConfigStorage.js';
import { resolveAcademyTurmaLabels } from './academyTurmas.js';
import { parseAutomationsConfig, serializeAutomationsConfig } from './useAutomations.js';
import { databases, DB_ID, ACADEMIES_COL } from './appwrite.js';
import { getAcademyDocument, invalidateAcademyDocumentCache } from './getAcademyDocument.js';
import { logAudienceResult } from './automationAudienceLog.js';

const TENURE_NOVATO_MAX_DAYS = 60;

/** Gatilhos de cron por aluno que exibem filtro de audiência na UI. */
export const CRON_TRIGGERS_WITH_AUDIENCE = ['birthday', 'absent_student', 'newcomer_at_risk'];

/** triggerKey usado em preview — não grava em automation_logs. */
export const AUDIENCE_ESTIMATE_TRIGGER_KEY = '__estimate__';

const PLAN_GROUP_PREFIXES = ['Anual', 'Recorrente', 'Mensal'];

/**
 * @typedef {Object} AutomationAudience
 * @property {string[]} [types]
 * @property {string[]} [plans]
 * @property {string[]} [turmas]
 * @property {null | 'novato' | 'veterano'} [tenure]
 */

/**
 * @param {import('./automationAudience.js').AutomationAudience | null | undefined} cfg
 */
export function isAudienceEmpty(cfg) {
  if (!cfg) return true;
  return (
    (!cfg.types || cfg.types.length === 0) &&
    (!cfg.plans || cfg.plans.length === 0) &&
    (!cfg.turmas || cfg.turmas.length === 0) &&
    !cfg.tenure
  );
}

/**
 * @param {import('./automationAudience.js').AutomationAudience | null | undefined} raw
 */
export function sanitizeAudience(raw) {
  if (!raw || typeof raw !== 'object') {
    return { types: [], plans: [], turmas: [], tenure: null };
  }
  return {
    types: Array.isArray(raw.types) ? raw.types.filter(Boolean) : [],
    plans: Array.isArray(raw.plans) ? raw.plans.filter(Boolean) : [],
    turmas: Array.isArray(raw.turmas) ? raw.turmas.filter(Boolean) : [],
    tenure: raw.tenure === 'novato' || raw.tenure === 'veterano' ? raw.tenure : null,
  };
}

/**
 * Agrupa nomes de plano por prefixo para o multi-select (GBLP: 13+ planos).
 * @param {string[]} planNames
 */
export function groupPlans(planNames) {
  const groups = {};
  const ungrouped = [];

  for (const name of planNames || []) {
    const trimmed = String(name || '').trim();
    if (!trimmed) continue;
    const prefix = PLAN_GROUP_PREFIXES.find((p) => trimmed.startsWith(p));
    if (prefix) {
      groups[prefix] = groups[prefix] ?? [];
      groups[prefix].push(trimmed);
    } else {
      ungrouped.push(trimmed);
    }
  }

  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  ungrouped.sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return { groups, ungrouped };
}

/**
 * @param {import('./automationAudience.js').AutomationAudience | null | undefined} audience
 * @param {object} [academy]
 * @param {object[]} [classes]
 */
export function buildAudienceLabel(audience, academy = {}, classes = []) {
  const cfg = sanitizeAudience(audience);
  const parts = [];

  if (cfg.types.length > 0) parts.push(cfg.types.join(', '));

  const financeCfg = parseFinanceConfigRaw(academy?.financeConfig);
  const knownPlans = new Set((financeCfg?.plans || []).map((p) => String(p?.name || '').trim()).filter(Boolean));
  if (cfg.plans.length > 0) {
    const labels = cfg.plans.map((name) =>
      knownPlans.has(name) ? name : `${name} (removido)`
    );
    parts.push(labels.join(', '));
  }

  const knownTurmas = new Set(
    resolveAcademyTurmaLabels({ settingsRaw: academy?.settings, classes })
  );
  if (cfg.turmas.length > 0) {
    const labels = cfg.turmas.map((name) =>
      knownTurmas.has(name) ? name : `${name} (removido)`
    );
    parts.push(labels.join(', '));
  }

  if (cfg.tenure === 'novato') parts.push('Novatos');
  if (cfg.tenure === 'veterano') parts.push('Veteranos');

  return parts.length > 0 ? parts.join(' · ') : 'Todos os alunos';
}

function daysSinceYmd(ymd) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const start = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  const todayYmd = formatLocalYmd(today);
  const tm = todayYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!tm) return null;
  const end = new Date(Number(tm[1]), Number(tm[2]) - 1, Number(tm[3]));
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / 86400000);
}

function studentTurma(student) {
  const t = student?.turma ?? student?.className ?? student?.class_name;
  if (t == null) return null;
  const s = String(t).trim();
  return s || null;
}

function normalizeFilterCtx(ctx) {
  if (typeof ctx === 'string') {
    return { triggerKey: ctx };
  }
  return ctx && typeof ctx === 'object' ? ctx : {};
}

/**
 * @param {Record<string, unknown>} student
 * @param {import('./automationAudience.js').AutomationAudience | null | undefined} audienceConfig
 * @param {string | { triggerKey?: string; academyId?: string }} [ctx]
 */
export function passesAudienceFilter(student, audienceConfig, ctx = {}) {
  const { triggerKey, academyId } = normalizeFilterCtx(ctx);
  const audience = audienceConfig ? sanitizeAudience(audienceConfig) : null;

  if (!audience || isAudienceEmpty(audience)) {
    return true;
  }

  const log = {
    academy_id: academyId ?? student.academy_id ?? student.academyId,
    trigger: triggerKey,
    student_id: student.$id ?? student.id,
    passed: true,
    reasons: [],
  };

  if (audience.types.length > 0) {
    if (student.type == null) {
      log.reasons.push('type_null_included');
    } else if (!audience.types.includes(student.type)) {
      log.passed = false;
      log.reasons.push(`type_mismatch:${student.type}`);
    }
  }

  if (audience.plans.length > 0) {
    if (student.plan == null) {
      log.reasons.push('plan_null_included');
    } else if (!audience.plans.includes(student.plan)) {
      log.passed = false;
      log.reasons.push(`plan_mismatch:${student.plan}`);
    }
  }

  if (audience.turmas.length > 0) {
    const turma = studentTurma(student);
    if (turma == null) {
      log.reasons.push('turma_null_included');
    } else if (!audience.turmas.includes(turma)) {
      log.passed = false;
      log.reasons.push(`turma_mismatch:${turma}`);
    }
  }

  if (audience.tenure) {
    const ymd = enrollmentDateYmd(student);

    if (!ymd) {
      log.reasons.push('enrollmentDate_null_included');
    } else {
      const days = daysSinceYmd(ymd);
      if (days != null) {
        if (audience.tenure === 'novato' && days >= TENURE_NOVATO_MAX_DAYS) {
          log.passed = false;
          log.reasons.push(`tenure_mismatch:${days}d`);
        }
        if (audience.tenure === 'veterano' && days < TENURE_NOVATO_MAX_DAYS) {
          log.passed = false;
          log.reasons.push(`tenure_mismatch:${days}d`);
        }
      }
      void enrollmentIngressYmd(student);
    }
  }

  const shouldLog =
    triggerKey &&
    triggerKey !== AUDIENCE_ESTIMATE_TRIGGER_KEY &&
    (!log.passed || log.reasons.length > 0);

  if (shouldLog) {
    logAudienceResult({
      ...log,
      sent: false,
      evaluated_at: new Date().toISOString(),
    });
  }

  return log.passed;
}

/**
 * @param {import('./automationAudience.js').AutomationAudience | null | undefined} audience
 * @param {Record<string, unknown>[]} students
 */
export function estimateAudienceCount(audience, students) {
  const list = Array.isArray(students) ? students : [];
  if (isAudienceEmpty(audience)) return list.length;
  return list.filter((s) => passesAudienceFilter(s, audience, AUDIENCE_ESTIMATE_TRIGGER_KEY)).length;
}

/**
 * @param {string} academyId
 * @param {string} triggerKey
 * @param {Record<string, unknown>} patch
 */
export async function mergeAutomationsTriggerPatch(academyId, triggerKey, patch) {
  if (!academyId || !triggerKey) {
    throw new Error('academyId e triggerKey são obrigatórios');
  }
  const doc = await getAcademyDocument(academyId);
  const parsed = parseAutomationsConfig(doc.automations_config || '');
  const current = parsed[triggerKey] || {};
  const nextConfig = {
    ...parsed,
    [triggerKey]: { ...current, ...patch },
  };
  const raw = serializeAutomationsConfig(nextConfig);
  await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
    automations_config: raw,
  });
  invalidateAcademyDocumentCache(academyId);
  return nextConfig;
}

/**
 * @param {string} academyId
 * @param {string} triggerKey
 * @param {import('./automationAudience.js').AutomationAudience | null | undefined} audience
 */
export async function updateTriggerAudience(academyId, triggerKey, audience) {
  return mergeAutomationsTriggerPatch(academyId, triggerKey, {
    audience: sanitizeAudience(audience),
  });
}

/**
 * @param {string} academyId
 * @param {string} triggerKey
 * @param {boolean} active
 */
export async function updateTriggerActive(academyId, triggerKey, active) {
  return mergeAutomationsTriggerPatch(academyId, triggerKey, {
    active: active === true,
  });
}
