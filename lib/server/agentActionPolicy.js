import {
  getAiActionsPolicyFromModules,
  normalizeAiActionsConfig,
  parseAcademyModules,
} from '../agentActionConfig.js';

export { V1_AI_ACTIONS } from '../agentActionConfig.js';

/**
 * @param {object|null|undefined} academyDoc
 * @returns {{ enabled: boolean, actions: Set<string> }}
 */
export function getAiActionsPolicy(academyDoc) {
  return getAiActionsPolicyFromModules(academyDoc?.modules);
}

/**
 * @param {object|null|undefined} academyDoc
 * @param {string} action
 */
export function isAiActionAllowed(academyDoc, action) {
  const { enabled, actions } = getAiActionsPolicy(academyDoc);
  if (!enabled) return false;
  return actions.has(String(action || '').trim());
}

/**
 * Mescla ai_actions em modules preservando outras chaves.
 * @param {unknown} modules
 * @param {{ enabled?: boolean, actions?: string[] }} patch
 * @returns {string}
 */
export function mergeAiActionsIntoModulesString(modules, patch) {
  const mods = parseAcademyModules(modules);
  mods.ai_actions = normalizeAiActionsConfig(patch);
  return JSON.stringify(mods);
}
