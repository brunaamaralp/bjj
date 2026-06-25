import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument, invalidateAcademyDocumentCache } from './getAcademyDocument.js';
import {
  mergeCollectionIntoFinanceConfig,
  readCollectionSettingsFromAcademy,
} from './collectionRules.js';
import { mergeFinanceConfigFromAcademyDoc } from './financeConfigStorage.js';

function defaultFinanceConfig() {
  return {
    plans: [],
    bankAccounts: [],
    cardFees: { pix: { percent: 0, fixed: 0 }, debito: { percent: 0, fixed: 0 }, credito_avista: { percent: 0, fixed: 0 }, credito_parcelado: {} },
  };
}

/**
 * Carrega financeConfig mesclado (financeConfig + settings + onboarding).
 * @returns {Promise<object|null>}
 */
export async function loadMergedFinanceConfigForAcademy(academyId, opts = {}) {
  const id = String(academyId || '').trim();
  if (!id) return null;

  const st = useLeadStore.getState();
  const cachedForAcademy = st.financeConfigAcademyId === id && st.financeConfig;

  try {
    const doc = await getAcademyDocument(id, {
      force: opts.force === true || Boolean(cachedForAcademy),
    });
    const cfg = mergeFinanceConfigFromAcademyDoc(doc) || defaultFinanceConfig();
    const coll = readCollectionSettingsFromAcademy(doc);
    const merged = mergeCollectionIntoFinanceConfig(cfg, coll);
    if (opts.updateStore !== false && useLeadStore.getState().academyId === id) {
      useLeadStore.getState().setFinanceConfig(merged, id);
    }
    return merged;
  } catch (err) {
    console.warn('[loadMergedFinanceConfigForAcademy] Falha ao carregar financeConfig:', err?.message || err);
    return cachedForAcademy ? st.financeConfig : null;
  }
}

/**
 * Carrega financeConfig da academia em background (cache no useLeadStore).
 * @param {string} academyId
 * @param {{ force?: boolean }} [opts] — force=true ignora cache do documento da academia.
 */
export async function prefetchFinanceConfig(academyId, opts = {}) {
  await loadMergedFinanceConfigForAcademy(academyId, opts);
}

/** Invalida cache da academia e recarrega financeConfig mesclado na store. */
export async function refreshFinanceConfigForAcademy(academyId) {
  const id = String(academyId || '').trim();
  if (!id) return null;
  invalidateAcademyDocumentCache(id);
  return loadMergedFinanceConfigForAcademy(id, { force: true });
}
