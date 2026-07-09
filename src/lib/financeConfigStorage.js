/**
 * Persistência de financeConfig na coleção academies.
 * Limite legado do atributo financeConfig: 2500 chars no Appwrite.
 * Overflow: contas em settings/onboarding; planos e régua em settings (até 16k).
 */
import { parseAcademySettings } from './stockSettings.js';
import {
  bankAccountFromDisplayLabel,
  deriveBankAccountsFromPaymentLabels,
  filterBankAccountsWithBank,
  isUsableBankAccount,
} from './bankAccounts.js';
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
import { normalizeEnrollmentDiscountPresets } from './enrollmentDiscountPresets.js';
import { normalizePaymentMethodSettings } from './paymentMethodSettings.js';
import { readCaptureMethods, compactCaptureMethodForStorage } from './captureMethods.js';
import { readFeeReceivers, compactFeeReceiverForStorage } from './feeReceivers.js';
import { migrateFinanceConfigToFeeReceivers } from './migrateFeeReceivers.js';
import { ensureBuiltinExemptPlan } from './academyPlans.js';

/** Limite legado do atributo financeConfig (string) no Appwrite. */
export const FINANCE_CONFIG_LEGACY_MAX_CHARS = 2500;

/** Tamanho desejado após migração manual no Appwrite (não alterável por script). */
export const FINANCE_CONFIG_TARGET_MAX_CHARS = 16384;

export const ACADEMY_SETTINGS_MAX_CHARS = 16384;

/** Atributo dedicado `financeBankAccounts` na coleção academies (provision:academy-attrs). */
export const FINANCE_BANK_ACCOUNTS_MAX_CHARS = 8192;

const SETTINGS_BANK_ACCOUNTS_KEY = 'financeBankAccounts';
const SETTINGS_BANK_OFFLOAD_FLAG = 'financeBankAccountsOffloaded';
const SETTINGS_PLANS_KEY = 'financePlans';
const SETTINGS_PLANS_OFFLOAD_FLAG = 'financePlansOffloaded';
const SETTINGS_COLLECTION_KEY = 'financeCollection';
const SETTINGS_COLLECTION_OFFLOAD_FLAG = 'financeCollectionOffloaded';
const SETTINGS_WHATSAPP_KEY = 'financeWhatsappReminders';
const SETTINGS_WHATSAPP_OFFLOAD_FLAG = 'financeWhatsappRemindersOffloaded';
const SETTINGS_FEE_RECEIVERS_KEY = 'financeFeeReceivers';
const SETTINGS_FEE_RECEIVERS_OFFLOAD_FLAG = 'financeFeeReceiversOffloaded';
/** Chaves legadas/alternativas em academy.settings. */
const SETTINGS_BANK_ACCOUNTS_ALIASES = ['financeBankAccounts', 'bankAccounts'];
const SETTINGS_PLANS_ALIASES = ['financePlans', 'plans'];

const SAVE_BUFFER_CHARS = 48;

/** Normaliza lista de contas vindas de settings (array ou JSON string). */
export function coerceBankAccountList(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return bankAccountFromDisplayLabel(item);
        return item;
      })
      .filter((item) => item && isUsableBankAccount(item));
  }
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

/** Lê planos de mensalidade de academy.settings (overflow ou legado). */
export function extractPlansFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const lists = [];
  for (const key of SETTINGS_PLANS_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      lists.push(...coercePlanList(settings[key]));
    }
  }
  return lists;
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

function extractFeeReceiversFromSettings(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings[SETTINGS_FEE_RECEIVERS_KEY];
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    const receivers = raw.receivers ?? raw.feeReceivers;
    if (Array.isArray(receivers)) {
      return {
        feeReceivers: receivers,
        defaultFeeReceiverId: String(raw.defaultFeeReceiverId || '').trim(),
      };
    }
  }
  return null;
}

function compactBankAccountForStorage(acc, { stripLegacyFees = false } = {}) {
  if (!acc || typeof acc !== 'object') return null;
  const out = { ...acc };
  if (stripLegacyFees) {
    delete out.acquirerFees;
    delete out.useDefaultAcquirerFees;
  }
  return out;
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

/** Recupera contas a partir de rótulos históricos (lançamentos/pagamentos). */
export function enrichFinanceConfigWithOrphanLabels(financeConfig, orphanLabels) {
  const labels = Array.isArray(orphanLabels) ? orphanLabels : [];
  const synthesized = labels
    .map((label) => bankAccountFromDisplayLabel(label))
    .filter(Boolean);
  if (!synthesized.length) {
    return financeConfig && typeof financeConfig === 'object' ? financeConfig : {};
  }
  const base = financeConfig && typeof financeConfig === 'object' ? financeConfig : {};
  return {
    ...base,
    bankAccounts: mergeBankAccountLists(base.bankAccounts, synthesized),
  };
}

function mergeBankAccountsFromAcademyDoc(academyDoc) {
  const cfg = parseFinanceConfigRaw(academyDoc?.financeConfig) || {};
  const fromCfg = filterBankAccountsWithBank(cfg.bankAccounts);
  const fromSettings = extractBankAccountsFromSettings(academyDoc?.settings);
  const fromRoot = extractBankAccountsFromRootAttribute(academyDoc);
  const fromOnboarding = filterBankAccountsWithBank(
    extractFinanceBankAccountsFromOnboardingRaw(academyDoc?.onboardingChecklist)
  );
  const fromPaymentLabels = deriveBankAccountsFromPaymentLabels(cfg);

  return mergeBankAccountLists(
    mergeBankAccountLists(
      mergeBankAccountLists(mergeBankAccountLists(fromCfg, fromSettings), fromOnboarding),
      fromRoot
    ),
    fromPaymentLabels
  );
}

function planNameKey(plan) {
  return String(plan?.name || '').trim().toLowerCase();
}

/** Une listas de planos; entradas posteriores sobrescrevem o mesmo nome. */
function mergePlanLists(...lists) {
  const byName = new Map();
  for (const list of lists) {
    for (const plan of coercePlanList(list)) {
      const key = planNameKey(plan);
      if (key) byName.set(key, plan);
    }
  }
  return [...byName.values()];
}

function mergePlansFromAcademyDoc(academyDoc) {
  const cfg = parseFinanceConfigRaw(academyDoc?.financeConfig) || {};
  const fromCfgList = coercePlanList(cfg.plans);
  const fromSettings = extractPlansFromSettings(academyDoc?.settings);
  return ensureBuiltinExemptPlan(mergePlanLists(fromCfgList, fromSettings));
}

/**
 * Une config do servidor com alterações do cliente sem apagar planos/contas legados
 * que ainda estejam em outra fonte (financeConfig inline vs settings overflow).
 */
export function unionFinanceConfigForPersist(serverMerged, clientCfg) {
  const server = serverMerged && typeof serverMerged === 'object' ? serverMerged : {};
  const client = clientCfg && typeof clientCfg === 'object' ? clientCfg : {};
  return {
    ...server,
    ...client,
    plans: mergePlanLists(server.plans, client.plans),
    bankAccounts: mergeBankAccountLists(server.bankAccounts, client.bankAccounts),
  };
}

/** Remove campos vazios dos planos para reduzir o JSON salvo. */
export function compactPlanForStorage(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (plan.builtin === true) return null;
  const name = String(plan.name ?? '').trim();
  if (!name) return null;
  const out = {
    name,
    price: Number(plan.price) || 0,
    applyCardFee: plan.applyCardFee !== false,
  };
  if (plan.isExempt === true) out.isExempt = true;
  const weekly = Number(plan.weeklyCheckinsExpected);
  if (Number.isFinite(weekly) && weekly >= 1) {
    out.weeklyCheckinsExpected = Math.min(7, Math.max(1, Math.round(weekly)));
  }
  const description = String(plan.description ?? '').trim();
  if (description) out.description = description;
  const enrollId = String(plan.contractTemplateId ?? '').trim();
  if (enrollId) out.contractTemplateId = enrollId;
  const rescindId = String(plan.rescissionTemplateId ?? '').trim();
  if (rescindId) out.rescissionTemplateId = rescindId;
  return out;
}

/** Compacta financeConfig antes de persistir (planos sem campos vazios, recebedores sparse). */
export function compactFinanceConfigForStorage(mergedCfg) {
  const base = mergedCfg && typeof mergedCfg === 'object' ? { ...mergedCfg } : {};
  const plans = (base.plans || []).map(compactPlanForStorage).filter(Boolean);
  const feeReceivers = readFeeReceivers(base);
  const migrated = feeReceivers.length > 0 || base.feeReceiversMigrated === true;
  const stripLegacyFees = migrated;

  const captureMethods = readCaptureMethods(base)
    .map((cap) => compactCaptureMethodForStorage(cap))
    .filter(Boolean);
  const compactReceivers = feeReceivers
    .map((r) => compactFeeReceiverForStorage(r))
    .filter(Boolean);

  const bankAccounts = filterBankAccountsWithBank(base.bankAccounts).map((acc) =>
    compactBankAccountForStorage(acc, { stripLegacyFees })
  );

  const out = { ...base, plans, bankAccounts };
  if (captureMethods.length) out.captureMethods = captureMethods;
  else delete out.captureMethods;

  if (compactReceivers.length) {
    out.feeReceivers = compactReceivers;
    out.feeReceiversMigrated = true;
    if (base.defaultFeeReceiverId) out.defaultFeeReceiverId = base.defaultFeeReceiverId;
    delete out.acquirerFees;
    delete out.cardFees;
  } else {
    delete out.feeReceivers;
    delete out.defaultFeeReceiverId;
    delete out.feeReceiversMigrated;
  }

  return out;
}

/** Indica se o projeto tem atributo `settings` na coleção (evita update com campo desconhecido). */
export function academyDocSupportsSettings(academyDoc, { hasSettingsAttribute } = {}) {
  if (typeof hasSettingsAttribute === 'boolean') return hasSettingsAttribute;
  if (Object.prototype.hasOwnProperty.call(academyDoc || {}, 'settings')) return true;
  // Provisionado em academies; documentos antigos podem não ter a chave até o primeiro overflow.
  return true;
}

/**
 * Monta o objeto financeConfig completo a partir do documento da academia.
 * @param {object} academyDoc
 */
export function mergeFinanceConfigFromAcademyDoc(academyDoc) {
  const cfg = parseFinanceConfigRaw(academyDoc?.financeConfig) || {};
  const mergedBanks = mergeBankAccountsFromAcademyDoc(academyDoc);

  const plans = mergePlansFromAcademyDoc(academyDoc);
  const settings = parseAcademySettings(academyDoc?.settings);
  const collectionFromSettings = extractCollectionFromSettings(academyDoc?.settings);
  const whatsappFromSettings = extractWhatsappFromSettings(academyDoc?.settings);

  let merged = {
    ...cfg,
    plans,
    bankAccounts: mergedBanks,
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

  const feeReceiversFromSettings = extractFeeReceiversFromSettings(academyDoc?.settings);
  if (settings[SETTINGS_FEE_RECEIVERS_OFFLOAD_FLAG] && feeReceiversFromSettings) {
    if (Array.isArray(feeReceiversFromSettings)) {
      merged = { ...merged, feeReceivers: feeReceiversFromSettings, feeReceiversMigrated: true };
    } else {
      merged = {
        ...merged,
        feeReceivers: feeReceiversFromSettings.feeReceivers,
        defaultFeeReceiverId:
          feeReceiversFromSettings.defaultFeeReceiverId || merged.defaultFeeReceiverId,
        feeReceiversMigrated: true,
      };
    }
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
  merged = {
    ...merged,
    enrollmentDiscountPresets: normalizeEnrollmentDiscountPresets(merged.enrollmentDiscountPresets),
  };

  merged = migrateFinanceConfigToFeeReceivers(merged);

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
  // Limite efetivo no Appwrite costuma ser 2500 até provision:academy-attrs ampliar o atributo.
  return json.length <= FINANCE_CONFIG_LEGACY_MAX_CHARS - SAVE_BUFFER_CHARS;
}

function fitsBankAccountsRootLimit(json) {
  return json.length <= FINANCE_BANK_ACCOUNTS_MAX_CHARS - SAVE_BUFFER_CHARS;
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

function makeFinanceCore(compacted, { stripBanks, stripPlans, stripCollection, stripWhatsapp, stripFeeReceivers }) {
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
  if (stripFeeReceivers) {
    delete core.feeReceivers;
    delete core.defaultFeeReceiverId;
  }
  return core;
}

const OFFLOAD_LEVELS = [
  { stripBanks: false, stripPlans: false, stripCollection: false, stripWhatsapp: false, stripFeeReceivers: false },
  { stripBanks: false, stripPlans: false, stripCollection: false, stripWhatsapp: false, stripFeeReceivers: true },
  { stripBanks: true, stripPlans: false, stripCollection: false, stripWhatsapp: false, stripFeeReceivers: false },
  { stripBanks: true, stripPlans: true, stripCollection: false, stripWhatsapp: false, stripFeeReceivers: false },
  { stripBanks: true, stripPlans: true, stripCollection: true, stripWhatsapp: false, stripFeeReceivers: false },
  { stripBanks: true, stripPlans: true, stripCollection: true, stripWhatsapp: true, stripFeeReceivers: false },
  { stripBanks: true, stripPlans: true, stripCollection: true, stripWhatsapp: true, stripFeeReceivers: true },
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
  delete next[SETTINGS_FEE_RECEIVERS_KEY];
  delete next[SETTINGS_FEE_RECEIVERS_OFFLOAD_FLAG];
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
  const feeReceiversPayload = readFeeReceivers(compacted);
  const defaultFeeReceiverId = String(compacted.defaultFeeReceiverId || '').trim();

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
    level.stripPlans ||
    level.stripCollection ||
    level.stripWhatsapp ||
    level.stripFeeReceivers;

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

  const banksStr = JSON.stringify(banks);

  if (level.stripBanks && !needsSettingsOverflow && fitsBankAccountsRootLimit(banksStr)) {
    const nextSettings = clearFinanceOverflowKeys(settings);
    const onboardingStr = serializeOnboardingChecklistForDb(
      parseOnboardingChecklist(academyDoc?.onboardingChecklist),
      { preserveRaw: academyDoc?.onboardingChecklist, clearFinanceBankAccounts: true }
    );
    return {
      financeConfig: financeStr,
      financeBankAccounts: banksStr,
      settings: supportsSettings ? JSON.stringify(nextSettings) : undefined,
      onboardingChecklist: onboardingStr,
      bankAccountsOffloaded: true,
      bankAccountsOffloadVia: 'root',
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
        financeBankAccounts: '',
        bankAccountsOffloaded: true,
      };
    }
  }

  if (needsSettingsOverflow && supportsSettings) {
    const banksInRoot = level.stripBanks && fitsBankAccountsRootLimit(banksStr);
    const nextSettings = {
      ...clearFinanceOverflowKeys(settings),
      ...(level.stripBanks && !banksInRoot
        ? { [SETTINGS_BANK_ACCOUNTS_KEY]: banks, [SETTINGS_BANK_OFFLOAD_FLAG]: true }
        : {}),
      ...(level.stripPlans ? { [SETTINGS_PLANS_KEY]: plans, [SETTINGS_PLANS_OFFLOAD_FLAG]: true } : {}),
      ...(level.stripCollection
        ? { [SETTINGS_COLLECTION_KEY]: collectionPayload, [SETTINGS_COLLECTION_OFFLOAD_FLAG]: true }
        : {}),
      ...(level.stripWhatsapp
        ? { [SETTINGS_WHATSAPP_KEY]: whatsappPayload, [SETTINGS_WHATSAPP_OFFLOAD_FLAG]: true }
        : {}),
      ...(level.stripFeeReceivers
        ? {
            [SETTINGS_FEE_RECEIVERS_KEY]: {
              receivers: feeReceiversPayload,
              defaultFeeReceiverId,
            },
            [SETTINGS_FEE_RECEIVERS_OFFLOAD_FLAG]: true,
          }
        : {}),
    };
    const settingsStr = JSON.stringify(nextSettings);
    if (fitsSettingsLimit(settingsStr)) {
      return {
        financeConfig: financeStr,
        settings: settingsStr,
        ...(banksInRoot ? { financeBankAccounts: banksStr, bankAccountsOffloadVia: 'root' } : {}),
        bankAccountsOffloaded: level.stripBanks,
        plansOffloaded: level.stripPlans,
        collectionOffloaded: level.stripCollection,
        whatsappOffloaded: level.stripWhatsapp,
        feeReceiversOffloaded: level.stripFeeReceivers,
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

  const { getAcademyDocument } = await import('./getAcademyDocument.js');
  const doc = await getAcademyDocument(aid, { force: true, allowClientFallback: false });
  const serverMerged = mergeFinanceConfigFromAcademyDoc(doc);
  const safeCfg = unionFinanceConfigForPersist(serverMerged, mergedCfg);
  const built = buildAcademyFinanceConfigUpdate(doc, safeCfg, {
    hasSettingsAttribute: academyDocSupportsSettings(doc),
  });
  const payload = { financeConfig: built.financeConfig };
  if (built.settings !== undefined) payload.settings = built.settings;
  if (built.financeBankAccounts !== undefined) {
    payload.financeBankAccounts = built.financeBankAccounts;
  }
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
    financeBankAccounts: built.financeBankAccounts ?? doc.financeBankAccounts,
    onboardingChecklist: built.onboardingChecklist ?? doc.onboardingChecklist,
  });
}
