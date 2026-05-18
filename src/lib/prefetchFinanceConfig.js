import { databases, DB_ID, ACADEMIES_COL } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';
import {
  mergeCollectionIntoFinanceConfig,
  readCollectionSettingsFromAcademy,
} from './collectionRules.js';

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
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
    let cfg = null;
    try {
      cfg = doc.financeConfig
        ? typeof doc.financeConfig === 'string'
          ? JSON.parse(doc.financeConfig)
          : doc.financeConfig
        : null;
    } catch {
      cfg = null;
    }
    const coll = readCollectionSettingsFromAcademy(doc);
    const merged = mergeCollectionIntoFinanceConfig(cfg || defaultFinanceConfig(), coll);
    if (useLeadStore.getState().academyId === id) {
      useLeadStore.getState().setFinanceConfig(merged);
    }
  } catch {
    void 0;
  }
}
