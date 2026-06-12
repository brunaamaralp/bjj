import {
  getAiActionsPolicyFromModules,
  normalizeAiActionsConfig,
  parseAcademyModules,
} from '../agentActionConfig.js';

export { normalizeAiActionsConfig };

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
 * @param {object|null|undefined} academyDoc
 */
export function isConversationTimelineEnabled(academyDoc) {
  const cfg = normalizeAiActionsConfig(parseAcademyModules(academyDoc?.modules).ai_actions);
  return cfg.conversation_timeline?.enabled !== false;
}

/**
 * Mescla ai_actions em modules preservando outras chaves.
 * @param {unknown} modules
 * @param {{ enabled?: boolean, actions?: string[] }} patch
 * @returns {string}
 */
export function mergeAiActionsIntoModulesString(modules, patch) {
  const mods = parseAcademyModules(modules);
  const prev = normalizeAiActionsConfig(mods.ai_actions);
  const p = patch && typeof patch === 'object' ? patch : {};
  mods.ai_actions = normalizeAiActionsConfig({
    enabled: p.enabled !== undefined ? p.enabled : prev.enabled,
    actions: p.actions !== undefined ? p.actions : prev.actions,
    conversation_timeline:
      p.conversation_timeline !== undefined ? p.conversation_timeline : prev.conversation_timeline,
  });
  return JSON.stringify(mods);
}
