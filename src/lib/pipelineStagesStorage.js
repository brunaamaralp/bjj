import { parseAcademySettings } from './stockSettings.js';
import { cleanStagesForSave } from './pipelineStagesConfig.js';

const SETTINGS_KEY = 'stagesConfig';

/**
 * Lê configuração bruta de etapas do documento da academia.
 * Suporta atributo legado de topo (`stagesConfig`) e JSON em `settings`.
 * @param {object | null | undefined} doc
 * @returns {string | object | null}
 */
export function readStagesConfigRawFromAcademyDoc(doc) {
  if (!doc || typeof doc !== 'object') return null;

  const top = doc.stagesConfig;
  if (top != null && top !== '') return top;

  const embedded = parseAcademySettings(doc.settings)[SETTINGS_KEY];
  if (embedded != null && embedded !== '') return embedded;

  return null;
}

/**
 * Mescla etapas do funil no objeto settings da academia.
 * @param {unknown} settingsRaw
 * @param {Array<{ id: string, label?: string, slaDays?: number }>} stages
 */
export function mergeStagesConfigIntoSettings(settingsRaw, stages) {
  const base = parseAcademySettings(settingsRaw);
  return {
    ...base,
    [SETTINGS_KEY]: cleanStagesForSave(stages),
  };
}

/**
 * Payload seguro para `updateDocument` (sem atributo desconhecido no schema).
 * @param {object | null | undefined} doc
 * @param {Array<{ id: string, label?: string, slaDays?: number }>} stages
 */
export function buildAcademyStagesConfigSavePayload(doc, stages) {
  const merged = mergeStagesConfigIntoSettings(doc?.settings, stages);
  return { settings: JSON.stringify(merged) };
}
