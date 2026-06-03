import { databases, DB_ID, ACADEMIES_COL } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { formatBankAccountLabel } from './bankAccounts.js';
import {
  mergeCollectionIntoFinanceConfig,
  readCollectionSettingsFromAcademy,
} from './collectionRules.js';
import { persistAcademyFinanceConfig } from './financeConfigStorage.js';

function defaultFinanceConfig() {
  return {
    plans: [],
    bankAccounts: [],
    cardFees: {
      pix: { percent: 0, fixed: 0 },
      debito: { percent: 0, fixed: 0 },
      credito_avista: { percent: 0, fixed: 0 },
      credito_parcelado: {},
    },
  };
}

/**
 * Adiciona conta bancária ao financeConfig da academia e persiste no Appwrite.
 * @returns {Promise<{ config: object, label: string }>}
 */
export async function appendBankAccountToAcademy(academyId, fields, currentConfig) {
  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('Academia não selecionada.');

  const entry = {
    bankName: String(fields?.bankName || '').trim(),
    branch: String(fields?.branch || '').trim(),
    account: String(fields?.account || '').trim(),
    accountName: String(fields?.accountName || '').trim(),
    pixKey: String(fields?.pixKey || '').trim(),
  };
  if (!entry.bankName) throw new Error('Informe o nome do banco.');

  const base = currentConfig && typeof currentConfig === 'object' ? currentConfig : defaultFinanceConfig();
  const next = {
    ...base,
    bankAccounts: [...(Array.isArray(base.bankAccounts) ? base.bankAccounts : []), entry],
  };

  const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, aid);
  const merged = mergeCollectionIntoFinanceConfig(next, readCollectionSettingsFromAcademy(doc));
  const saved = await persistAcademyFinanceConfig(aid, merged, { databases, DB_ID, ACADEMIES_COL });

  if (useLeadStore.getState().academyId === aid) {
    useLeadStore.getState().setFinanceConfig(saved);
  }

  return { config: saved, label: formatBankAccountLabel(entry) };
}
