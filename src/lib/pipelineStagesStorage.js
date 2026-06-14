import { parseAcademySettings } from './stockSettings.js';
import { cleanStagesForSave } from './pipelineStagesConfig.js';

const SETTINGS_KEY = 'stagesConfig';
const CACHE_KEY_PREFIX = 'navi:pipeline:stages:';

/**
 * Etapas do funil em cache (sessionStorage) para evitar flash do kanban padrão ao reabrir.
 * @param {string | null | undefined} academyId
 * @returns {Array<{ id: string, label?: string, slaDays?: number }> | null}
 */
export function readCachedPipelineStages(academyId) {
  const id = String(academyId || '').trim();
  if (!id || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} academyId
 * @param {Array<{ id: string, label?: string, slaDays?: number }>} stages
 */
export function writeCachedPipelineStages(academyId, stages) {
  const id = String(academyId || '').trim();
  if (!id || typeof sessionStorage === 'undefined') return;
  try {
    const cleaned = cleanStagesForSave(stages);
    const key = `${CACHE_KEY_PREFIX}${id}`;
    if (!cleaned.length) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(cleaned));
  } catch {
    void 0;
  }
}

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
