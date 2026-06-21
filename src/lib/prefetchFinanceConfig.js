import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument, invalidateAcademyDocumentCache } from './getAcademyDocument.js';
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

function hasNamedPlans(financeConfig) {
  return (financeConfig?.plans || []).some((plan) => String(plan?.name || '').trim());
}

/**
 * Carrega financeConfig mesclado (financeConfig + settings + onboarding).
 * @returns {Promise<object|null>}
 */
export async function loadMergedFinanceConfigForAcademy(academyId, opts = {}) {
  const id = String(academyId || '').trim();
  if (!id) return null;

  const st = useLeadStore.getState();
  const force = opts.force === true;
  const cachedForAcademy = st.financeConfigAcademyId === id && st.financeConfig;
  const cachedHasBanks = cachedForAcademy && hasConfiguredBankAccounts(st.financeConfig);
  const cachedHasPlans = cachedForAcademy && hasNamedPlans(st.financeConfig);

  if (!force && cachedForAcademy && cachedHasPlans) {
    return st.financeConfig;
  }

  try {
    const doc = await getAcademyDocument(id, {
      force: force || (cachedForAcademy && !cachedHasBanks),
    });
    const cfg = mergeFinanceConfigFromAcademyDoc(doc) || defaultFinanceConfig();
    const coll = readCollectionSettingsFromAcademy(doc);
    const merged = mergeCollectionIntoFinanceConfig(cfg, coll);
    if (useLeadStore.getState().academyId === id && opts.updateStore !== false) {
      useLeadStore.getState().setFinanceConfig(merged);
    }
    return merged;
  } catch {
    return cachedForAcademy ? st.financeConfig : null;
  }
}

/**
 * Carrega financeConfig da academia em background (cache no useLeadStore).
 * @param {string} academyId
 * @param {{ force?: boolean }} [opts] — force=true ignora cache; também refetch se contas estiverem vazias (overflow em settings/onboarding).
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
