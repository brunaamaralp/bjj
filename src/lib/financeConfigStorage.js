/**
 * Persistência de financeConfig na coleção academies.
 * Limite legado do atributo financeConfig: 2500 chars no Appwrite.
 * Overflow: contas em settings/onboarding; planos e régua em settings (até 16k).
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
import { parseCollectionRules, parseOverdueLabel } from './collectionRules.js';
import { normalizeWhatsappRemindersConfig } from './financeWhatsappReminders.js';
import { normalizeFinanceVendors } from './financeVendors.js';
import { normalizeAcquirerFees, normalizeAcquirerFeePolicy } from './acquirerFees.js';
import { normalizePaymentMethodSettings } from './paymentMethodSettings.js';
import { readCaptureMethods } from './captureMethods.js';

/** Limite legado do atributo financeConfig (string) no Appwrite. */
export const FINANCE_CONFIG_LEGACY_MAX_CHARS = 2500;

/** Tamanho desejado após migração manual no Appwrite (não alterável por script). */
export const FINANCE_CONFIG_TARGET_MAX_CHARS = 16384;

export const ACADEMY_SETTINGS_MAX_CHARS = 16384;

const SETTINGS_BANK_ACCOUNTS_KEY = 'financeBankAccounts';
const SETTINGS_BANK_OFFLOAD_FLAG = 'financeBankAccountsOffloaded';
const SETTINGS_PLANS_KEY = 'financePlans';
const SETTINGS_PLANS_OFFLOAD_FLAG = 'financePlansOffloaded';
const SETTINGS_COLLECTION_KEY = 'financeCollection';
const SETTINGS_COLLECTION_OFFLOAD_FLAG = 'financeCollectionOffloaded';
const SETTINGS_WHATSAPP_KEY = 'financeWhatsappReminders';
const SETTINGS_WHATSAPP_OFFLOAD_FLAG = 'financeWhatsappRemindersOffloaded';
/** Chaves legadas/alternativas em academy.settings. */
const SETTINGS_BANK_ACCOUNTS_ALIASES = ['financeBankAccounts', 'bankAccounts'];

const SAVE_BUFFER_CHARS = 48;

/** Normaliza lista de contas vindas de settings (array ou JSON string). */
export function coerceBankAccountList(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function coercePlanList(raw) {
  if (Array.isArray(raw)) return raw.filter((p) => p && typeof p === 'object');
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p === 'object') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Lê contas bancárias de academy.settings (overflow ou legado). */
export function extractBankAccountsFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const lists = [];
  for (const key of SETTINGS_BANK_ACCOUNTS_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      lists.push(...coerceBankAccountList(settings[key]));
    }
  }
  return filterBankAccountsWithBank(lists);
}

/** Lê planos de mensalidade de academy.settings (overflow). */
export function extractPlansFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  return coercePlanList(settings[SETTINGS_PLANS_KEY]);
}

function extractCollectionFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings[SETTINGS_COLLECTION_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return {
    collectionRules: parseCollectionRules(raw.collectionRules ?? raw.rules),
    overdueLabel: parseOverdueLabel(raw.overdueLabel ?? raw.overdue_label),
  };
}

function extractWhatsappFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  if (!Object.prototype.hasOwnProperty.call(settings, SETTINGS_WHATSAPP_KEY)) return null;
  return normalizeWhatsappRemindersConfig(settings[SETTINGS_WHATSAPP_KEY]);
}

/** Lê contas do atributo raiz academy.financeBankAccounts (legado Appwrite). */
export function extractBankAccountsFromRootAttribute(academyDoc) {
  return filterBankAccountsWithBank(coerceBankAccountList(academyDoc?.financeBankAccounts));
}

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

function mergePlansLists(fromCfg = [], settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const fromSettings = extractPlansFromSettings(settingsRaw);
  if (settings[SETTINGS_PLANS_OFFLOAD_FLAG] && fromSettings.length > 0) {
    return fromSettings;
  }
  const fromCfgList = coercePlanList(fromCfg);
  if (fromCfgList.length > 0) return fromCfgList;
  return fromSettings;
}

/** Remove campos vazios dos planos para reduzir o JSON salvo. */
export function compactPlanForStorage(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const name = String(plan.name ?? '').trim();
  if (!name) return null;
  const out = {
    name,
    price: Number(plan.price) || 0,
    applyCardFee: plan.applyCardFee !== false,
  };
  if (plan.isExempt === true) out.isExempt = true;
  const description = String(plan.description ?? '').trim();
  if (description) out.description = description;
  const enrollId = String(plan.contractTemplateId ?? '').trim();
  if (enrollId) out.contractTemplateId = enrollId;
  const rescindId = String(plan.rescissionTemplateId ?? '').trim();
  if (rescindId) out.rescissionTemplateId = rescindId;
  return out;
}

/** Compacta financeConfig antes de persistir (planos sem campos vazios). */
export function compactFinanceConfigForStorage(mergedCfg) {
  const base = mergedCfg && typeof mergedCfg === 'object' ? { ...mergedCfg } : {};
  const plans = (base.plans || []).map(compactPlanForStorage).filter(Boolean);
  const captureMethods = readCaptureMethods(base);
  const out = { ...base, plans };
  if (captureMethods.length) out.captureMethods = captureMethods;
  else delete out.captureMethods;
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
  const fromCfg = filterBankAccountsWithBank(cfg.bankAccounts);
  const fromSettings = extractBankAccountsFromSettings(academyDoc?.settings);
  const fromRoot = extractBankAccountsFromRootAttribute(academyDoc);
  const fromOnboarding = filterBankAccountsWithBank(
    extractFinanceBankAccountsFromOnboardingRaw(academyDoc?.onboardingChecklist)
  );

  const mergedBanks = mergeBankAccountLists(
    mergeBankAccountLists(mergeBankAccountLists(fromCfg, fromSettings), fromOnboarding),
    fromRoot
  );

  const plans = mergePlansLists(cfg.plans, academyDoc?.settings);
  const settings = parseAcademySettings(academyDoc?.settings);
  const collectionFromSettings = extractCollectionFromSettings(academyDoc?.settings);
  const whatsappFromSettings = extractWhatsappFromSettings(academyDoc?.settings);

  let merged = {
    ...cfg,
    plans,
    bankAccounts: mergedBanks.length > 0 ? mergedBanks : fromCfg,
  };

  if (settings[SETTINGS_COLLECTION_OFFLOAD_FLAG] && collectionFromSettings) {
    merged = {
      ...merged,
      collectionRules: collectionFromSettings.collectionRules,
      overdueLabel: collectionFromSettings.overdueLabel,
    };
  }

  if (settings[SETTINGS_WHATSAPP_OFFLOAD_FLAG] && whatsappFromSettings) {
    merged = { ...merged, whatsappReminders: whatsappFromSettings };
  }

  merged = { ...merged, vendors: normalizeFinanceVendors(merged.vendors) };
  merged = { ...merged, acquirerFees: normalizeAcquirerFees(merged.acquirerFees) };
  merged = { ...merged, acquirerFeePolicy: normalizeAcquirerFeePolicy(merged.acquirerFeePolicy) };
  merged = {
    ...merged,
    paymentMethodSettings: normalizePaymentMethodSettings(merged),
  };
  merged = {
    ...merged,
    captureMethods: readCaptureMethods(merged),
  };

  return merged;
}

/**
 * Auditoria: de onde vêm as contas bancárias no documento da academia.
 * @returns {{ sources: object, merged: object[], needsRecovery: boolean }}
 */
export function auditBankAccountsFromAcademyDoc(academyDoc) {
  const cfg = parseFinanceConfigRaw(academyDoc?.financeConfig) || {};
  const fromCfg = filterBankAccountsWithBank(cfg.bankAccounts);
  const fromSettings = extractBankAccountsFromSettings(academyDoc?.settings);
  const fromRoot = extractBankAccountsFromRootAttribute(academyDoc);
  const fromOnboarding = filterBankAccountsWithBank(
    extractFinanceBankAccountsFromOnboardingRaw(academyDoc?.onboardingChecklist)
  );
  const merged = mergeFinanceConfigFromAcademyDoc(academyDoc).bankAccounts || [];

  const overflowCount = fromSettings.length + fromOnboarding.length + fromRoot.length;
  const needsRecovery =
    merged.length > fromCfg.length ||
    (fromCfg.length === 0 && overflowCount > 0);

  return {
    sources: {
      financeConfig: fromCfg,
      settings: fromSettings,
      onboarding: fromOnboarding,
      rootAttribute: fromRoot,
    },
    merged: filterBankAccountsWithBank(merged),
    needsRecovery,
  };
}

function fitsFinanceConfigLimit(json) {
  return json.length <= FINANCE_CONFIG_LEGACY_MAX_CHARS - SAVE_BUFFER_CHARS;
}

function fitsSettingsLimit(json) {
  return json.length <= ACADEMY_SETTINGS_MAX_CHARS - SAVE_BUFFER_CHARS;
}

function buildOnboardingOverflowPayload(academyDoc, banks) {
  const steps = parseOnboardingChecklist(academyDoc?.onboardingChecklist);
  return serializeOnboardingChecklistForDb(steps, {
    preserveRaw: academyDoc?.onboardingChecklist,
    financeBankAccounts: banks,
  });
}

function makeFinanceCore(compacted, { stripBanks, stripPlans, stripCollection, stripWhatsapp }) {
  const core = { ...compacted };
  if (stripBanks) core.bankAccounts = [];
  if (stripPlans) core.plans = [];
  if (stripCollection) {
    delete core.collectionRules;
    delete core.collection_rules;
    delete core.overdueLabel;
    delete core.overdue_label;
  }
  if (stripWhatsapp) delete core.whatsappReminders;
  return core;
}

const OFFLOAD_LEVELS = [
  { stripBanks: false, stripPlans: false, stripCollection: false, stripWhatsapp: false },
  { stripBanks: true, stripPlans: false, stripCollection: false, stripWhatsapp: false },
  { stripBanks: true, stripPlans: true, stripCollection: false, stripWhatsapp: false },
  { stripBanks: true, stripPlans: true, stripCollection: true, stripWhatsapp: false },
  { stripBanks: true, stripPlans: true, stripCollection: true, stripWhatsapp: true },
];

function pickOffloadLevel(compacted) {
  for (const level of OFFLOAD_LEVELS) {
    const json = JSON.stringify(makeFinanceCore(compacted, level));
    if (fitsFinanceConfigLimit(json)) return level;
  }
  return null;
}

function clearFinanceOverflowKeys(settings) {
  const next = { ...settings };
  delete next[SETTINGS_BANK_ACCOUNTS_KEY];
  delete next[SETTINGS_BANK_OFFLOAD_FLAG];
  delete next[SETTINGS_PLANS_KEY];
  delete next[SETTINGS_PLANS_OFFLOAD_FLAG];
  delete next[SETTINGS_COLLECTION_KEY];
  delete next[SETTINGS_COLLECTION_OFFLOAD_FLAG];
  delete next[SETTINGS_WHATSAPP_KEY];
  delete next[SETTINGS_WHATSAPP_OFFLOAD_FLAG];
  return next;
}

/**
 * @param {object} academyDoc — documento atual da academia
 * @param {object} mergedCfg — financeConfig já mesclado
 * @param {{ hasSettingsAttribute?: boolean }} opts
 */
export function buildAcademyFinanceConfigUpdate(academyDoc, mergedCfg, opts = {}) {
  const settings = parseAcademySettings(academyDoc?.settings);
  const supportsSettings = academyDocSupportsSettings(academyDoc, opts);
  const compacted = compactFinanceConfigForStorage(mergedCfg);

  const banks = filterBankAccountsWithBank(compacted.bankAccounts);
  const plans = coercePlanList(compacted.plans);
  const collectionPayload = {
    collectionRules: parseCollectionRules(compacted.collectionRules ?? compacted.collection_rules),
    overdueLabel: parseOverdueLabel(compacted.overdueLabel ?? compacted.overdue_label),
  };
  const whatsappPayload = normalizeWhatsappRemindersConfig(compacted.whatsappReminders);

  const level = pickOffloadLevel(compacted);
  if (!level) {
    throw new FinanceConfigTooLargeError({
      financeChars: JSON.stringify(
        makeFinanceCore(compacted, OFFLOAD_LEVELS[OFFLOAD_LEVELS.length - 1])
      ).length,
    });
  }

  const financeStr = JSON.stringify(makeFinanceCore(compacted, level));
  const needsSettingsOverflow =
    level.stripPlans || level.stripCollection || level.stripWhatsapp;

  if (!level.stripBanks && !needsSettingsOverflow) {
    const nextSettings = clearFinanceOverflowKeys(settings);
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

  if (level.stripBanks && supportsSettings && !needsSettingsOverflow) {
    const nextSettings = {
      ...clearFinanceOverflowKeys(settings),
      [SETTINGS_BANK_ACCOUNTS_KEY]: banks,
      [SETTINGS_BANK_OFFLOAD_FLAG]: true,
    };
    const settingsStr = JSON.stringify(nextSettings);
    if (fitsSettingsLimit(settingsStr)) {
      return {
        financeConfig: financeStr,
        settings: settingsStr,
        bankAccountsOffloaded: true,
      };
    }
  }

  if (needsSettingsOverflow && supportsSettings) {
    const nextSettings = {
      ...clearFinanceOverflowKeys(settings),
      ...(level.stripBanks
        ? { [SETTINGS_BANK_ACCOUNTS_KEY]: banks, [SETTINGS_BANK_OFFLOAD_FLAG]: true }
        : {}),
      ...(level.stripPlans ? { [SETTINGS_PLANS_KEY]: plans, [SETTINGS_PLANS_OFFLOAD_FLAG]: true } : {}),
      ...(level.stripCollection
        ? { [SETTINGS_COLLECTION_KEY]: collectionPayload, [SETTINGS_COLLECTION_OFFLOAD_FLAG]: true }
        : {}),
      ...(level.stripWhatsapp
        ? { [SETTINGS_WHATSAPP_KEY]: whatsappPayload, [SETTINGS_WHATSAPP_OFFLOAD_FLAG]: true }
        : {}),
    };
    const settingsStr = JSON.stringify(nextSettings);
    if (fitsSettingsLimit(settingsStr)) {
      return {
        financeConfig: financeStr,
        settings: settingsStr,
        bankAccountsOffloaded: level.stripBanks,
        plansOffloaded: level.stripPlans,
        collectionOffloaded: level.stripCollection,
        whatsappOffloaded: level.stripWhatsapp,
      };
    }
    throw new FinanceConfigTooLargeError({
      financeChars: financeStr.length,
      settingsChars: settingsStr.length,
    });
  }

  if (level.stripBanks) {
    const onboardingStr = buildOnboardingOverflowPayload(academyDoc, banks);
    if (onboardingStr.length > ONBOARDING_CHECKLIST_MAX_CHARS - SAVE_BUFFER_CHARS) {
      throw new FinanceConfigTooLargeError({
        financeChars: financeStr.length,
        onboardingChars: onboardingStr.length,
      });
    }
    if (needsSettingsOverflow) {
      throw new FinanceConfigTooLargeError({
        financeChars: financeStr.length,
        settingsChars: 0,
      });
    }
    return {
      financeConfig: financeStr,
      onboardingChecklist: onboardingStr,
      bankAccountsOffloaded: true,
      offloadVia: ONBOARDING_FINANCE_BANKS_KEY,
    };
  }

  throw new FinanceConfigTooLargeError({ financeChars: financeStr.length });
}

/**
 * @returns {Promise<object>} financeConfig mesclado após gravação
 */
export async function persistAcademyFinanceConfig(academyId, mergedCfg, { databases, DB_ID, ACADEMIES_COL }) {
  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('Academia não selecionada.');

  const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, aid);
  const built = buildAcademyFinanceConfigUpdate(doc, mergedCfg, {
    hasSettingsAttribute: academyDocSupportsSettings(doc),
  });
  const payload = { financeConfig: built.financeConfig };
  if (built.settings !== undefined) payload.settings = built.settings;
  if (built.onboardingChecklist !== undefined) {
    payload.onboardingChecklist = built.onboardingChecklist;
  }

  await databases.updateDocument(DB_ID, ACADEMIES_COL, aid, payload);

  try {
    const { invalidateAcademyDocumentCache } = await import('./getAcademyDocument.js');
    invalidateAcademyDocumentCache(aid);
  } catch {
    void 0;
  }

  return mergeFinanceConfigFromAcademyDoc({
    ...doc,
    financeConfig: built.financeConfig,
    settings: built.settings ?? doc.settings,
    onboardingChecklist: built.onboardingChecklist ?? doc.onboardingChecklist,
  });
}
