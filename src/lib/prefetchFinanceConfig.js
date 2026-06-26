import { useLeadStore } from '../store/useLeadStore';
import {
  fetchMergedFinanceConfigFromApi,
  getAcademyDocument,
  invalidateAcademyDocumentCache,
} from './getAcademyDocument.js';
import {
  mergeCollectionIntoFinanceConfig,
  readCollectionSettingsFromAcademy,
} from './collectionRules.js';
import { mergeFinanceConfigFromAcademyDoc } from './financeConfigStorage.js';
import { hasConfiguredBankAccounts } from './bankAccounts.js';

function defaultFinanceConfig() {
  return {
    plans: [],
    bankAccounts: [],
    cardFees: { pix: { percent: 0, fixed: 0 }, debito: { percent: 0, fixed: 0 }, credito_avista: { percent: 0, fixed: 0 }, credito_parcelado: {} },
  };
}

async function loadFinanceConfigFromDocument(academyId) {
  const doc = await getAcademyDocument(academyId, {
    force: true,
    allowClientFallback: false,
  });
  const cfg = mergeFinanceConfigFromAcademyDoc(doc) || defaultFinanceConfig();
  const coll = readCollectionSettingsFromAcademy(doc);
  return mergeCollectionIntoFinanceConfig(cfg, coll);
}

/**
 * Carrega financeConfig mesclado (financeConfig + settings + onboarding + rótulos legados).
 * @returns {Promise<object|null>}
 */
export async function loadMergedFinanceConfigForAcademy(academyId, opts = {}) {
  const id = String(academyId || '').trim();
  if (!id) return null;

  const st = useLeadStore.getState();
  const cachedForAcademy = st.financeConfigAcademyId === id && st.financeConfig;

  try {
    let merged = null;
    try {
      merged = await fetchMergedFinanceConfigFromApi(id);
    } catch (apiErr) {
      console.warn('[loadMergedFinanceConfigForAcademy] finance-config API:', apiErr?.message || apiErr);
      merged = await loadFinanceConfigFromDocument(id);
    }

    if (!merged) merged = defaultFinanceConfig();

    if (!hasConfiguredBankAccounts(merged)) {
      const docMerged = await loadFinanceConfigFromDocument(id).catch(() => null);
      if (docMerged && hasConfiguredBankAccounts(docMerged)) {
        merged = docMerged;
      }
    }

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
