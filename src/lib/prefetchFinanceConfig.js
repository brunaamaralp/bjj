import { useLeadStore } from '../store/useLeadStore';
import { getAcademyDocument } from './getAcademyDocument.js';
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

/** Carrega financeConfig da academia em background (cache no useLeadStore). */
export async function prefetchFinanceConfig(academyId) {
  const id = String(academyId || '').trim();
  if (!id) return;
  const st = useLeadStore.getState();
  if (st.financeConfigAcademyId === id && st.financeConfig) return;

  try {
    const doc = await getAcademyDocument(id);
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
