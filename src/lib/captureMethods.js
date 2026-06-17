/**
 * Meios de captura (maquininhas, links) — Fase 2 formas de recebimento.
 */
import { canonicalPaymentMethodKey } from './paymentMethods.js';
import {
  ACQUIRER_INSTALLMENT_COUNTS,
  defaultAcquirerFees,
  normalizeAcquirerFees,
} from './acquirerFees.js';
import { listBankAccountLabels } from './bankAccounts.js';

const CAPTURE_CHANNELS = new Set(['presencial', 'link', 'integrado']);
const CARD_METHODS = new Set(['cartao_credito', 'cartao_debito']);

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function clampInstallments(n, max = 12) {
  return Math.max(1, Math.min(max, Math.trunc(Number(n) || 1)));
}

export function newCaptureMethodId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cap_${crypto.randomUUID()}`;
  }
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyCaptureMethodFees() {
  const out = {};
  for (let i = 1; i <= 12; i += 1) {
    out[String(i)] = { percent: 0, fixed: 0, creditDays: 0 };
  }
  return out;
}

export function defaultCaptureMethod(paymentMethod = 'cartao_credito') {
  const key = canonicalPaymentMethodKey(paymentMethod) || 'cartao_credito';
  return {
    id: newCaptureMethodId(),
    name: '',
    paymentMethod: CARD_METHODS.has(key) ? key : 'cartao_credito',
    bankAccountLabel: '',
    channel: 'presencial',
    online: false,
    maxInstallments: key === 'cartao_debito' ? 1 : 12,
    active: true,
    useDefaultFees: true,
    fees: emptyCaptureMethodFees(),
  };
}

export function normalizeCaptureMethodFees(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (let i = 1; i <= 12; i += 1) {
    const key = String(i);
    const row = src[key] ?? src[i];
    if (!row || typeof row !== 'object') continue;
    const percent = Number(row.percent) || 0;
    const fixed = Number(row.fixed) || 0;
    const creditDays = Math.max(0, Math.trunc(Number(row.creditDays) || 0));
    if (percent > 0 || fixed > 0 || creditDays > 0) {
      out[key] = { percent, fixed, creditDays };
    }
  }
  return out;
}

export function hasCaptureFeesConfigured(fees) {
  return Object.keys(normalizeCaptureMethodFees(fees)).length > 0;
}

export function normalizeCaptureMethod(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const paymentMethod = canonicalPaymentMethodKey(raw.paymentMethod);
  if (!CARD_METHODS.has(paymentMethod)) return null;

  const maxCap = paymentMethod === 'cartao_debito' ? 1 : 12;
  const maxRaw = Number(raw.maxInstallments);
  const maxInstallments =
    Number.isFinite(maxRaw) && maxRaw > 0
      ? clampInstallments(maxRaw, maxCap)
      : maxCap;
  const channel = CAPTURE_CHANNELS.has(String(raw.channel)) ? String(raw.channel) : 'presencial';
  const fees = normalizeCaptureMethodFees(raw.fees);
  const integration =
    raw.integration && typeof raw.integration === 'object'
      ? {
          provider: String(raw.integration.provider || 'manual').slice(0, 32),
          externalId: String(raw.integration.externalId || '').trim(),
          connected: raw.integration.connected === true,
        }
      : undefined;

  return {
    id: String(raw.id || newCaptureMethodId()).slice(0, 64),
    name: String(raw.name || '').trim().slice(0, 80),
    paymentMethod,
    bankAccountLabel: String(raw.bankAccountLabel || '').trim(),
    channel,
    online: raw.online === true,
    maxInstallments,
    active: raw.active !== false,
    useDefaultFees: raw.useDefaultFees !== false,
    fees,
    ...(integration ? { integration } : {}),
  };
}

export function readCaptureMethods(financeConfig) {
  const raw = financeConfig?.captureMethods;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCaptureMethod).filter(Boolean);
}

export function digestCaptureMethods(financeConfig) {
  return JSON.stringify(readCaptureMethods(financeConfig));
}

export function findCaptureMethodById(financeConfig, id) {
  const target = String(id || '').trim();
  if (!target) return null;
  return readCaptureMethods(financeConfig).find((c) => c.id === target) || null;
}

export function listActiveCaptureMethods(financeConfig, paymentMethod) {
  const key = canonicalPaymentMethodKey(paymentMethod);
  if (!key) return [];
  return readCaptureMethods(financeConfig).filter((c) => c.active && c.paymentMethod === key);
}

export function countActiveCaptureMethods(financeConfig, paymentMethod) {
  return listActiveCaptureMethods(financeConfig, paymentMethod).length;
}

export function resolveCaptureInstallmentFee(captureMethod, installments) {
  if (!captureMethod) {
    return { percent: 0, fixed: 0, creditDays: 0 };
  }
  const maxN = clampInstallments(captureMethod.maxInstallments || 12, 12);
  const n = String(clampInstallments(installments, maxN));
  const row = captureMethod.fees?.[n] || captureMethod.fees?.['1'] || {};
  return {
    percent: Number(row.percent) || 0,
    fixed: Number(row.fixed) || 0,
    creditDays: Math.max(0, Math.trunc(Number(row.creditDays) || 0)),
  };
}

export function resolveCreditDaysForInstallment(captureMethod, installments) {
  if (!captureMethod || captureMethod.useDefaultFees !== false) return 0;
  return resolveCaptureInstallmentFee(captureMethod, installments).creditDays;
}

export function captureMethodFeesToAcquirerFees(captureMethod, fees) {
  const src = normalizeCaptureMethodFees(fees);
  const base = defaultAcquirerFees();

  if (captureMethod?.paymentMethod === 'cartao_debito') {
    const r1 = src['1'] || { percent: 0, fixed: 0 };
    return normalizeAcquirerFees({
      ...base,
      debito: { percent: r1.percent, fixed: r1.fixed },
    });
  }

  const r1 = src['1'] || { percent: 0, fixed: 0 };
  const parcelado = { ...base.credito_parcelado };
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    const key = String(n);
    parcelado[key] = Number(src[key]?.percent ?? 0) || 0;
  }
  return normalizeAcquirerFees({
    ...base,
    credito_avista: { percent: r1.percent, fixed: r1.fixed },
    credito_parcelado: parcelado,
  });
}

export function hasConfiguredCaptureForMethod(financeConfig, method) {
  const active = listActiveCaptureMethods(financeConfig, method);
  if (!active.length) return true;
  return active.some((c) => c.useDefaultFees || hasCaptureFeesConfigured(c.fees));
}

export function resolveBankAccountForCaptureMethod(financeConfig, captureMethodId) {
  const cap = findCaptureMethodById(financeConfig, captureMethodId);
  const label = String(cap?.bankAccountLabel || '').trim();
  if (!label) return '';
  const labels = listBankAccountLabels(financeConfig);
  return labels.includes(label) ? label : '';
}

export function patchCaptureMethodsList(financeConfig, list) {
  const normalized = (Array.isArray(list) ? list : [])
    .map(normalizeCaptureMethod)
    .filter(Boolean);
  return {
    ...(financeConfig && typeof financeConfig === 'object' ? financeConfig : {}),
    captureMethods: normalized.length ? normalized : undefined,
  };
}

export function computeAcquirerFeeFromCaptureRow({ gross, planBase, policy, row }) {
  const g = roundMoney(gross);
  if (g < 0.01) return { gross: 0, fee: 0, net: 0 };
  const pct = Number(row?.percent) || 0;
  const fixed = Number(row?.fixed) || 0;
  if (!(pct > 0) && !(fixed > 0)) return { gross: g, fee: 0, net: g };

  let mdrGross = g;
  if (String(policy || '').toLowerCase() === 'pass_through') {
    const base = roundMoney(planBase);
    if (base > 0) mdrGross = base;
  }
  const fee = roundMoney(mdrGross * (pct / 100) + fixed);
  const net = roundMoney(Math.max(0, g - fee));
  return { gross: g, fee, net };
}

export const CAPTURE_CHANNEL_LABELS = {
  presencial: 'Presencial (maquininha)',
  link: 'Link de pagamento',
  integrado: 'Integrado',
};

/** Rótulo amigável para dropdowns (nome ou canal quando ainda sem nome). */
export function formatCaptureMethodOptionLabel(cap) {
  if (!cap) return 'Meio de captura';
  const name = String(cap.name || '').trim();
  if (name) return name;
  const channel = CAPTURE_CHANNEL_LABELS[cap.channel] || 'Meio de captura';
  return `${channel} (defina um nome)`;
}

export function countCaptureInstallmentFeeBands(fees, maxInstallments = 12) {
  const normalized = normalizeCaptureMethodFees(fees);
  const maxN = Math.min(12, Math.max(1, Number(maxInstallments) || 12));
  return ACQUIRER_INSTALLMENT_COUNTS.filter((n) => {
    if (n > maxN || n < 2) return false;
    const row = normalized[String(n)];
    return row && (row.percent > 0 || row.creditDays > 0);
  }).length;
}
