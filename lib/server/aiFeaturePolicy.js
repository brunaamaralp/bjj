import {
  getAiModulePolicyFromModules,
  normalizeAiModule,
  parseAcademyModules,
} from '../agentActionConfig.js';

export { normalizeAiModule, mergeAiModuleIntoModulesString } from '../agentActionConfig.js';

export class AiFeatureDisabledError extends Error {
  constructor(message = 'Recursos de IA desativados para esta academia.') {
    super(message);
    this.name = 'AiFeatureDisabledError';
    this.statusCode = 403;
    this.code = 'ai_disabled';
  }
}

/**
 * @param {object|null|undefined} academyDoc
 * @returns {boolean}
 */
export function isAiModuleEnabled(academyDoc) {
  return getAiModulePolicyFromModules(academyDoc?.modules).enabled;
}

/**
 * @param {object|null|undefined} academyDoc
 */
export function assertAiModuleEnabled(academyDoc) {
  if (!isAiModuleEnabled(academyDoc)) {
    throw new AiFeatureDisabledError();
  }
}

/**
 * @param {import('http').ServerResponse} res
 * @param {unknown} err
 * @returns {boolean} true if handled
 */
export function sendAiFeatureDisabledError(res, err) {
  if (!(err instanceof AiFeatureDisabledError)) return false;
  res.status(403).json({
    error: err.code,
    sucesso: false,
    erro: err.message,
  });
  return true;
}

/**
 * Loads academy doc and asserts AI module enabled.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academiesCol
 * @param {string} academyId
 */
export async function assertAiModuleEnabledForAcademy(databases, dbId, academiesCol, academyId) {
  const doc = await databases.getDocument(dbId, academiesCol, academyId);
  assertAiModuleEnabled(doc);
  return doc;
}
