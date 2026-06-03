/**
 * Persistência de financeConfig na coleção academies.
 * Limite legado do atributo financeConfig: 2500 chars no Appwrite.
 * Overflow de contas bancárias: settings (16k) se existir; senão envelope em onboardingChecklist.fba (2048).
 */
import { parseAcademySettings } from './stockSettings.js';
import { filterBankAccountsWithBank } from './bankAccounts.js';
import {
  extractFinanceBankAccountsFromOnboardingRaw,
  ONBOARDING_CHECKLIST_MAX_CHARS,
  ONBOARDING_FINANCE_BANKS_KEY,
  parseOnboardingChecklist,
  serializeOnboardingChecklistForDb,
} from './onboardingChecklist.js';

/** Limite legado do atributo financeConfig (string) no Appwrite. */
export const FINANCE_CONFIG_LEGACY_MAX_CHARS = 2500;

/** Tamanho desejado após migração manual no Appwrite (não alterável por script). */
export const FINANCE_CONFIG_TARGET_MAX_CHARS = 16384;

export const ACADEMY_SETTINGS_MAX_CHARS = 16384;

const SETTINGS_BANK_ACCOUNTS_KEY = 'financeBankAccounts';
const SETTINGS_BANK_OFFLOAD_FLAG = 'financeBankAccountsOffloaded';

const SAVE_BUFFER_CHARS = 48;

export class FinanceConfigTooLargeError extends Error {
  constructor({ financeChars, settingsChars, onboardingChars } = {}) {
    super('finance_config_too_large');
    this.name = 'FinanceConfigTooLargeError';
    this.financeChars = financeChars;
    this.settingsChars = settingsChars;
    this.onboardingChars = onboardingChars;
  }
}

export function parseFinanceConfigRaw(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function bankAccountKey(acc) {
  const n = normalizeBankListEntry(acc);
  return [n.bankName, n.branch, n.account, n.pixKey].join('\0').toLowerCase();
}

function normalizeBankListEntry(acc) {
  return acc && typeof acc === 'object' ? acc : {};
}

function mergeBankAccountLists(primary = [], secondary = []) {
  const out = [];
  const seen = new Set();
  for (const raw of [...primary, ...secondary]) {
    const [n] = filterBankAccountsWithBank([raw]);
    if (!n) continue;
    const key = bankAccountKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Indica se o projeto tem atributo `settings` na coleção (evita update com campo desconhecido). */
export function academyDocSupportsSettings(academyDoc, { hasSettingsAttribute } = {}) {
  if (typeof hasSettingsAttribute === 'boolean') return hasSettingsAttribute;
  return Object.prototype.hasOwnProperty.call(academyDoc || {}, 'settings');
}

/**
 * Monta o objeto financeConfig completo a partir do documento da academia.
 * @param {object} academyDoc
 */
export function mergeFinanceConfigFromAcademyDoc(academyDoc) {
  const cfg = parseFinanceConfigRaw(academyDoc?.financeConfig) || {};
  const settings = parseAcademySettings(academyDoc?.settings);
  const fromCfg = filterBankAccountsWithBank(cfg.bankAccounts);
  const fromSettings = filterBankAccountsWithBank(settings[SETTINGS_BANK_ACCOUNTS_KEY]);
  const fromOnboarding = filterBankAccountsWithBank(
    extractFinanceBankAccountsFromOnboardingRaw(academyDoc?.onboardingChecklist)
  );

  if (settings[SETTINGS_BANK_OFFLOAD_FLAG] === true && fromSettings.length > 0) {
    return { ...cfg, bankAccounts: fromSettings };
  }
  if (fromOnboarding.length > 0 && fromCfg.length === 0) {
    return { ...cfg, bankAccounts: fromOnboarding };
  }
  if (fromSettings.length > 0 || fromOnboarding.length > 0) {
    return {
      ...cfg,
      bankAccounts: mergeBankAccountLists(mergeBankAccountLists(fromCfg, fromSettings), fromOnboarding),
    };
  }
  return { ...cfg, bankAccounts: fromCfg };
}

function fitsFinanceConfigLimit(json) {
  return json.length <= FINANCE_CONFIG_LEGACY_MAX_CHARS - SAVE_BUFFER_CHARS;
}

function buildOnboardingOverflowPayload(academyDoc, banks) {
  const steps = parseOnboardingChecklist(academyDoc?.onboardingChecklist);
  return serializeOnboardingChecklistForDb(steps, {
    preserveRaw: academyDoc?.onboardingChecklist,
    financeBankAccounts: banks,
  });
}

/**
 * @param {object} academyDoc — documento atual da academia
 * @param {object} mergedCfg — financeConfig já mesclado
 * @param {{ hasSettingsAttribute?: boolean }} opts
 */
export function buildAcademyFinanceConfigUpdate(academyDoc, mergedCfg, opts = {}) {
  const settings = parseAcademySettings(academyDoc?.settings);
  const banks = filterBankAccountsWithBank(mergedCfg?.bankAccounts);
  const cfgBase = mergedCfg && typeof mergedCfg === 'object' ? { ...mergedCfg } : {};
  const supportsSettings = academyDocSupportsSettings(academyDoc, opts);

  const tryFull = { ...cfgBase, bankAccounts: banks };
  let financeStr = JSON.stringify(tryFull);
  if (fitsFinanceConfigLimit(financeStr)) {
    const nextSettings = { ...settings };
    delete nextSettings[SETTINGS_BANK_ACCOUNTS_KEY];
    delete nextSettings[SETTINGS_BANK_OFFLOAD_FLAG];
    const onboardingStr = serializeOnboardingChecklistForDb(
      parseOnboardingChecklist(academyDoc?.onboardingChecklist),
      { preserveRaw: academyDoc?.onboardingChecklist, clearFinanceBankAccounts: true }
    );
    return {
      financeConfig: financeStr,
      settings: supportsSettings ? JSON.stringify(nextSettings) : undefined,
      onboardingChecklist: onboardingStr,
      bankAccountsOffloaded: false,
    };
  }

  const cfgLean = { ...cfgBase, bankAccounts: [] };
  financeStr = JSON.stringify(cfgLean);
  if (!fitsFinanceConfigLimit(financeStr)) {
    throw new FinanceConfigTooLargeError({ financeChars: financeStr.length });
  }

  if (supportsSettings) {
    const nextSettings = {
      ...settings,
      [SETTINGS_BANK_ACCOUNTS_KEY]: banks,
      [SETTINGS_BANK_OFFLOAD_FLAG]: true,
    };
    const settingsStr = JSON.stringify(nextSettings);
    if (settingsStr.length <= ACADEMY_SETTINGS_MAX_CHARS - SAVE_BUFFER_CHARS) {
      return {
        financeConfig: financeStr,
        settings: settingsStr,
        bankAccountsOffloaded: true,
      };
    }
  }

  const onboardingStr = buildOnboardingOverflowPayload(academyDoc, banks);
  if (onboardingStr.length > ONBOARDING_CHECKLIST_MAX_CHARS - SAVE_BUFFER_CHARS) {
    throw new FinanceConfigTooLargeError({
      financeChars: financeStr.length,
      onboardingChars: onboardingStr.length,
    });
  }

  return {
    financeConfig: financeStr,
    onboardingChecklist: onboardingStr,
    bankAccountsOffloaded: true,
    offloadVia: ONBOARDING_FINANCE_BANKS_KEY,
  };
}

/**
 * @returns {Promise<object>} financeConfig mesclado após gravação
 */
export async function persistAcademyFinanceConfig(academyId, mergedCfg, { databases, DB_ID, ACADEMIES_COL }) {
  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('Academia não selecionada.');

  const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, aid);
  const built = buildAcademyFinanceConfigUpdate(doc, mergedCfg, { hasSettingsAttribute: false });
  const payload = { financeConfig: built.financeConfig };
  if (built.settings !== undefined) payload.settings = built.settings;
  if (built.onboardingChecklist !== undefined) {
    payload.onboardingChecklist = built.onboardingChecklist;
  }

  await databases.updateDocument(DB_ID, ACADEMIES_COL, aid, payload);

  return mergeFinanceConfigFromAcademyDoc({
    ...doc,
    financeConfig: built.financeConfig,
    settings: built.settings ?? doc.settings,
    onboardingChecklist: built.onboardingChecklist ?? doc.onboardingChecklist,
  });
}
