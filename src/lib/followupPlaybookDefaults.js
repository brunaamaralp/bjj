import { parseAcademySettings } from './stockSettings.js';
import { WHATSAPP_TEMPLATE_KEYS } from '../../lib/whatsappTemplateDefaults.js';

/** @typedef {'whatsapp_template' | 'task' | 'manual' | 'pipeline_move'} FollowupActionType */

/**
 * @typedef {object} FollowupPlaybookStep
 * @property {number} offset_days
 * @property {FollowupActionType} action_type
 * @property {string} [template_key]
 * @property {string} [task_title]
 * @property {string} [task_notes]
 * @property {boolean} [skip_if_contacted]
 */

/**
 * @typedef {object} FollowupPlaybook
 * @property {number} version
 * @property {boolean} enabled
 * @property {FollowupPlaybookStep[]} attended
 * @property {FollowupPlaybookStep[]} missed
 */

export const DEFAULT_FOLLOWUP_PLAYBOOK = {
  version: 1,
  enabled: true,
  attended: [
    { offset_days: 0, action_type: 'whatsapp_template', template_key: 'post_class', skip_if_contacted: false },
    { offset_days: 1, action_type: 'whatsapp_template', template_key: 'dashboard_contact', skip_if_contacted: true },
    {
      offset_days: 3,
      action_type: 'task',
      task_title: 'Ligar — retorno pós-aula',
      task_notes: 'Lead sem resposta após mensagens.',
      skip_if_contacted: true,
    },
    { offset_days: 7, action_type: 'whatsapp_template', template_key: 'recovery', skip_if_contacted: true },
  ],
  missed: [
    { offset_days: 0, action_type: 'whatsapp_template', template_key: 'missed', skip_if_contacted: false },
    { offset_days: 1, action_type: 'whatsapp_template', template_key: 'missed', skip_if_contacted: true },
    {
      offset_days: 3,
      action_type: 'task',
      task_title: 'Ligar — remarcar experimental',
      task_notes: 'Tentar remarcar a aula experimental.',
      skip_if_contacted: true,
    },
  ],
};

const TEMPLATE_KEY_SET = new Set(WHATSAPP_TEMPLATE_KEYS);

function sanitizeStep(raw, fallback) {
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const offset = Number(raw?.offset_days);
  const action_type = String(raw?.action_type || base.action_type || 'manual').trim();
  const step = {
    offset_days: Number.isFinite(offset) && offset >= 0 ? Math.trunc(offset) : base.offset_days ?? 0,
    action_type,
    skip_if_contacted: raw?.skip_if_contacted !== undefined ? Boolean(raw.skip_if_contacted) : base.skip_if_contacted !== false,
  };
  if (action_type === 'whatsapp_template') {
    const key = String(raw?.template_key || base.template_key || '').trim();
    step.template_key = TEMPLATE_KEY_SET.has(key) ? key : base.template_key || 'post_class';
  }
  if (action_type === 'task') {
    step.task_title = String(raw?.task_title || base.task_title || 'Tarefa de retorno').trim();
    step.task_notes = String(raw?.task_notes || base.task_notes || '').trim();
  }
  return step;
}

function sanitizeTrack(rawSteps, defaults) {
  const defaultsArr = Array.isArray(defaults) ? defaults : [];
  const rawArr = Array.isArray(rawSteps) ? rawSteps : [];
  if (rawArr.length === 0) return defaultsArr.map((s) => ({ ...s }));
  return rawArr.map((s, i) => sanitizeStep(s, defaultsArr[i] || defaultsArr[defaultsArr.length - 1]));
}

/**
 * @param {unknown} settingsRaw
 * @returns {FollowupPlaybook}
 */
export function readFollowupPlaybook(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.followupPlaybook;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_FOLLOWUP_PLAYBOOK, attended: [...DEFAULT_FOLLOWUP_PLAYBOOK.attended], missed: [...DEFAULT_FOLLOWUP_PLAYBOOK.missed] };
  }
  return {
    version: 1,
    enabled: raw.enabled !== false,
    attended: sanitizeTrack(raw.attended, DEFAULT_FOLLOWUP_PLAYBOOK.attended),
    missed: sanitizeTrack(raw.missed, DEFAULT_FOLLOWUP_PLAYBOOK.missed),
  };
}

/**
 * @param {unknown} settingsRaw
 * @param {FollowupPlaybook} playbook
 */
/**
 * @param {FollowupPlaybook} playbook
 * @returns {string[]} validation errors (empty = ok)
 */
export function validateFollowupPlaybook(playbook) {
  const errors = [];
  for (const track of ['attended', 'missed']) {
    const steps = Array.isArray(playbook?.[track]) ? playbook[track] : [];
    const offsets = steps.map((s) => Number(s?.offset_days));
    const seen = new Set();
    for (const o of offsets) {
      if (!Number.isFinite(o) || o < 0) {
        errors.push(`Trilha "${track}": offset_days inválido`);
        break;
      }
      if (seen.has(o)) {
        errors.push(`Trilha "${track}": cada D+N deve ser único`);
        break;
      }
      seen.add(o);
    }
    for (const step of steps) {
      if (step.action_type === 'whatsapp_template') {
        const key = String(step.template_key || '').trim();
        if (!TEMPLATE_KEY_SET.has(key)) {
          errors.push(`Template inválido: ${key || '(vazio)'}`);
        }
      }
    }
  }
  return errors;
}

export function mergeFollowupPlaybookIntoSettings(settingsRaw, playbook) {
  const base = parseAcademySettings(settingsRaw);
  if (!playbook) {
    const { followupPlaybook: _removed, ...rest } = base;
    return rest;
  }
  return {
    ...base,
    followupPlaybook: {
      version: 1,
      enabled: playbook.enabled !== false,
      attended: Array.isArray(playbook.attended) ? playbook.attended : DEFAULT_FOLLOWUP_PLAYBOOK.attended,
      missed: Array.isArray(playbook.missed) ? playbook.missed : DEFAULT_FOLLOWUP_PLAYBOOK.missed,
    },
  };
}
