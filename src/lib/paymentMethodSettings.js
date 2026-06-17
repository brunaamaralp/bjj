import {
  PAYMENT_METHODS,
  canonicalPaymentMethodKey,
  orderedStorageDialectMethodsForModal,
  storageDialectPaymentMethodOptions,
} from './paymentMethods.js';
import { listBankAccountLabels } from './bankAccounts.js';

/** @typedef {{ active?: boolean, defaultBankAccountLabel?: string, autoSettle?: boolean, autoMarkReceived?: boolean, feesAcknowledged?: boolean, creditDays?: number }} PaymentMethodSettingRow */

function readLegacyDefaultAccountByMethod(financeConfig) {
  const raw =
    financeConfig?.defaultAccountByMethod ||
    financeConfig?.methodBankDefaults ||
    {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...raw };
}

function defaultAutoSettle(method) {
  if (method === 'cartao_credito') return false;
  return true;
}

function defaultAutoMarkReceived() {
  return true;
}

function defaultCreditDays() {
  return 0;
}

/** Defaults implícitos por forma (retrocompat: active true). */
export function defaultPaymentMethodSettingsRow(method) {
  return {
    active: true,
    defaultBankAccountLabel: '',
    autoSettle: defaultAutoSettle(method),
    autoMarkReceived: defaultAutoMarkReceived(method),
    feesAcknowledged: false,
    creditDays: defaultCreditDays(method),
  };
}

/**
 * Configuração efetiva por forma canônica.
 * @param {object|null|undefined} financeConfig
 * @returns {Record<string, Required<PaymentMethodSettingRow>>}
 */
export function readPaymentMethodSettings(financeConfig) {
  const raw = financeConfig?.paymentMethodSettings || {};
  const legacy = readLegacyDefaultAccountByMethod(financeConfig);
  const out = {};

  for (const { value } of PAYMENT_METHODS) {
    const row = raw[value] && typeof raw[value] === 'object' ? raw[value] : {};
    const defaults = defaultPaymentMethodSettingsRow(value);
    out[value] = {
      active: row.active !== false,
      defaultBankAccountLabel: String(
        row.defaultBankAccountLabel || legacy[value] || ''
      ).trim(),
      autoSettle:
        typeof row.autoSettle === 'boolean' ? row.autoSettle : defaults.autoSettle,
      autoMarkReceived:
        typeof row.autoMarkReceived === 'boolean'
          ? row.autoMarkReceived
          : defaults.autoMarkReceived,
      feesAcknowledged: row.feesAcknowledged === true,
      creditDays: Math.max(
        0,
        Math.trunc(
          Number.isFinite(Number(row.creditDays))
            ? Number(row.creditDays)
            : defaults.creditDays
        )
      ),
    };
  }

  return out;
}

/**
 * Normaliza antes de persistir (remove contas inválidas).
 * @param {object|null|undefined} financeConfig
 */
export function normalizePaymentMethodSettings(financeConfig) {
  const labels = new Set(listBankAccountLabels(financeConfig));
  const merged = readPaymentMethodSettings(financeConfig);
  const out = {};

  for (const { value } of PAYMENT_METHODS) {
    const row = merged[value] || defaultPaymentMethodSettingsRow(value);
    const account = String(row.defaultBankAccountLabel || '').trim();
    const entry = {
      active: row.active !== false,
      autoSettle: Boolean(row.autoSettle),
      autoMarkReceived: Boolean(row.autoMarkReceived),
    };
    if (account && labels.has(account)) {
      entry.defaultBankAccountLabel = account;
    }
    if (row.feesAcknowledged) entry.feesAcknowledged = true;
    if (Number(row.creditDays) > 0) entry.creditDays = Math.trunc(Number(row.creditDays));
    out[value] = entry;
  }

  return out;
}

export function digestPaymentMethodSettings(financeConfig) {
  return JSON.stringify(normalizePaymentMethodSettings(financeConfig));
}

/** Formas ativas para selects e modais. */
export function listActivePaymentMethods(financeConfig) {
  const settings = readPaymentMethodSettings(financeConfig);
  return PAYMENT_METHODS.filter((m) => settings[m.value]?.active !== false);
}

/**
 * Forma ativa nas configurações (aceita dialect ou canônico).
 * @param {object|null|undefined} financeConfig
 * @param {string|null|undefined} method
 */
export function isPaymentMethodActive(financeConfig, method) {
  const key = canonicalPaymentMethodKey(method);
  if (!key) return false;
  return readPaymentMethodSettings(financeConfig)[key]?.active !== false;
}

/**
 * Opções de select no dialect de storage, filtradas por formas ativas.
 * @param {object|null|undefined} financeConfig
 * @param {{ labelStyle?: 'short' | 'full' }} [opts]
 */
export function storageDialectPaymentMethodOptionsForFinance(financeConfig, opts = {}) {
  const active = new Set(listActivePaymentMethods(financeConfig).map((m) => m.value));
  return storageDialectPaymentMethodOptions(opts).filter((o) => active.has(o.canonical));
}

/** Opções no dialect de storage (Mensalidades), filtradas por ativas. */
export function orderedActiveStorageDialectMethodsForModal(financeConfig) {
  const active = new Set(listActivePaymentMethods(financeConfig).map((m) => m.value));
  return orderedStorageDialectMethodsForModal().filter((o) => active.has(o.canonical));
}

/**
 * Forma pronta para operação: ativa + conta resolvível.
 * @param {object|null|undefined} financeConfig
 * @param {string} method
 */
export function isPaymentMethodConfigured(financeConfig, method) {
  const key = canonicalPaymentMethodKey(method);
  if (!key) return false;

  const settings = readPaymentMethodSettings(financeConfig)[key];
  if (!settings?.active) return false;

  const labels = listBankAccountLabels(financeConfig);
  if (!labels.length) return false;

  const mapped = String(settings.defaultBankAccountLabel || '').trim();
  if (mapped && labels.includes(mapped)) return true;

  return labels.length === 1;
}

/** @returns {{ configured: number, active: number }} */
export function paymentMethodsConfiguredSummary(financeConfig) {
  const activeMethods = listActivePaymentMethods(financeConfig);
  const configured = activeMethods.filter((m) =>
    isPaymentMethodConfigured(financeConfig, m.value)
  );
  return { configured: configured.length, active: activeMethods.length };
}
