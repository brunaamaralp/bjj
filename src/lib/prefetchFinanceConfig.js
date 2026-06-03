import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument } from './getAcademyDocument.js';
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

/**
 * Carrega financeConfig da academia em background (cache no useLeadStore).
 * @param {string} academyId
 * @param {{ force?: boolean }} [opts] — force=true ignora cache; também refetch se contas estiverem vazias (overflow em settings/onboarding).
 */
export async function prefetchFinanceConfig(academyId, opts = {}) {
  const id = String(academyId || '').trim();
  if (!id) return;
  const st = useLeadStore.getState();
  const force = opts.force === true;
  const cachedForAcademy = st.financeConfigAcademyId === id && st.financeConfig;
  const cachedHasBanks = cachedForAcademy && hasConfiguredBankAccounts(st.financeConfig);
  if (!force && cachedForAcademy && cachedHasBanks) return;

  try {
    const doc = await getAcademyDocument(id, {
      force: force || (cachedForAcademy && !cachedHasBanks),
    });
    const cfg = mergeFinanceConfigFromAcademyDoc(doc) || defaultFinanceConfig();
    const coll = readCollectionSettingsFromAcademy(doc);
    const merged = mergeCollectionIntoFinanceConfig(cfg, coll);
    if (useLeadStore.getState().academyId === id) {
      useLeadStore.getState().setFinanceConfig(merged);
    }
  } catch {
    void 0;
  }
}
