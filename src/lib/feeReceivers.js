/**
 * Recebedores (maquininhas / gateways) com taxas por bandeira.
 */
import { CARD_BRANDS, normalizeCardBrand } from './cardBrands.js';
import {
  ACQUIRER_INSTALLMENT_COUNTS,
  defaultAcquirerFees,
  normalizeAcquirerFees,
} from './acquirerFees.js';
import {
  canonicalPaymentMethodKey,
  usesInstallmentCardFee,
} from './paymentMethods.js';

export const FEE_RECEIVER_PROVIDERS = [
  'pagbank',
  'asaas',
  'stone',
  'cielo',
  'rede',
  'manual',
];

export const FEE_RECEIVER_PROVIDER_LABELS = {
  pagbank: 'PagBank',
  asaas: 'Asaas',
  stone: 'Stone',
  cielo: 'Cielo',
  rede: 'Rede',
  manual: 'Manual',
};

const ZERO_ROW = { percent: 0, fixed: 0 };

export function newFeeReceiverId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `recv_${crypto.randomUUID()}`;
  }
  return `recv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultFeeRow() {
  return { percent: 0, fixed: 0 };
}

export function emptyFeeByBrand() {
  return { default: defaultFeeRow() };
}

export function emptyFeeReceiverFeeTable() {
  const credito_parcelado = {};
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    credito_parcelado[String(n)] = emptyFeeByBrand();
  }
  return {
    pix: defaultFeeRow(),
    debito: emptyFeeByBrand(),
    credito_avista: emptyFeeByBrand(),
    credito_parcelado,
    antecipacao: defaultFeeRow(),
  };
}

export function defaultFeeReceiver(overrides = {}) {
  return normalizeFeeReceiver({
    id: newFeeReceiverId(),
    name: '',
    provider: 'manual',
    bankAccountLabel: '',
    active: true,
    useDefaultFees: false,
    fees: emptyFeeReceiverFeeTable(),
    ...overrides,
  });
}

export function normalizeFeeRow(raw) {
  if (!raw || typeof raw !== 'object') return { ...ZERO_ROW };
  return {
    percent: Number(raw.percent) || 0,
    fixed: Number(raw.fixed) || 0,
  };
}

export function normalizeFeeByBrand(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { default: normalizeFeeRow(src.default ?? src) };
  for (const brand of CARD_BRANDS) {
    if (brand === 'default') continue;
    const row = src[brand];
    if (!row || typeof row !== 'object') continue;
    const normalized = normalizeFeeRow(row);
    if (normalized.percent > 0 || normalized.fixed > 0) {
      out[brand] = normalized;
    }
  }
  return out;
}

export function normalizeFeeReceiverFeeTable(raw) {
  const base = emptyFeeReceiverFeeTable();
  const src = raw && typeof raw === 'object' ? raw : {};
  const parcelado = { ...base.credito_parcelado };
  const srcParcelado = src.credito_parcelado || {};
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    const key = String(n);
    parcelado[key] = normalizeFeeByBrand(srcParcelado[key] ?? srcParcelado[n]);
  }
  return {
    pix: normalizeFeeRow(src.pix),
    debito: normalizeFeeByBrand(src.debito),
    credito_avista: normalizeFeeByBrand(src.credito_avista),
    credito_parcelado: parcelado,
    antecipacao: normalizeFeeRow(src.antecipacao),
  };
}

export function normalizeFeeReceiver(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const provider = String(raw.provider || 'manual').trim().toLowerCase();
  const useDefaultFees = raw.useDefaultFees === true;
  const fees = useDefaultFees ? undefined : normalizeFeeReceiverFeeTable(raw.fees);
  return {
    id: String(raw.id || newFeeReceiverId()).slice(0, 64),
    name: String(raw.name || '').trim().slice(0, 80),
    provider: FEE_RECEIVER_PROVIDERS.includes(provider) ? provider : 'manual',
    bankAccountLabel: String(raw.bankAccountLabel || '').trim(),
    active: raw.active !== false,
    useDefaultFees,
    ...(useDefaultFees ? {} : { fees }),
  };
}

export function readFeeReceivers(financeConfig) {
  const raw = financeConfig?.feeReceivers;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeFeeReceiver).filter(Boolean);
}

export function findFeeReceiverById(financeConfig, id) {
  const target = String(id || '').trim();
  if (!target) return null;
  return readFeeReceivers(financeConfig).find((r) => r.id === target) || null;
}

export function digestFeeReceivers(financeConfig) {
  return JSON.stringify({
    receivers: readFeeReceivers(financeConfig),
    defaultFeeReceiverId: String(financeConfig?.defaultFeeReceiverId || ''),
  });
}

export function feeRowSignature(row) {
  const r = normalizeFeeRow(row);
  return `${r.percent}:${r.fixed}`;
}

function resolveMethodBrandTable(fees, method, installments = 1) {
  const table = normalizeFeeReceiverFeeTable(fees);
  const key = canonicalPaymentMethodKey(method);
  if (key === 'pix') return { default: table.pix };
  if (key === 'cartao_debito') return table.debito;
  if (key === 'cartao_credito' && !usesInstallmentCardFee(key, installments)) {
    return table.credito_avista;
  }
  if (usesInstallmentCardFee(key, installments)) {
    const n = String(Math.max(2, Math.min(12, Math.trunc(Number(installments) || 2))));
    return table.credito_parcelado[n] || emptyFeeByBrand();
  }
  return emptyFeeByBrand();
}

export function collectBrandRows(receiver, method, installments = 1) {
  if (!receiver || receiver.useDefaultFees) return [];
  const byBrand = resolveMethodBrandTable(receiver.fees, method, installments);
  const rows = [];
  for (const brand of CARD_BRANDS) {
    const row = byBrand[brand];
    if (!row) continue;
    const normalized = normalizeFeeRow(row);
    if (normalized.percent > 0 || normalized.fixed > 0) {
      rows.push({ brand, row: normalized });
    }
  }
  return rows;
}

export function hasBrandFeeDivergence(receiver, method, installments = 1) {
  const rows = collectBrandRows(receiver, method, installments);
  if (rows.length <= 1) return false;
  const sigs = new Set(rows.map(({ row }) => feeRowSignature(row)));
  return sigs.size > 1;
}

export function pickFeeRow(fees, method, installments = 1, cardBrand = '') {
  const byBrand = resolveMethodBrandTable(fees, method, installments);
  const brand = normalizeCardBrand(cardBrand);
  if (byBrand[brand]) return normalizeFeeRow(byBrand[brand]);
  return normalizeFeeRow(byBrand.default);
}

export function hasFeeReceiverFeesConfigured(receiver) {
  if (!receiver || receiver.useDefaultFees || !receiver.fees) return false;
  const table = normalizeFeeReceiverFeeTable(receiver.fees);
  const checks = [
    table.pix?.percent,
    table.pix?.fixed,
    table.debito?.default?.percent,
    table.credito_avista?.default?.percent,
    table.antecipacao?.percent,
  ];
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    checks.push(table.credito_parcelado?.[String(n)]?.default?.percent);
  }
  return checks.some((v) => Number(v) > 0);
}

/** Converte tabela do recebedor para shape legado acquirerFees (usa bandeira informada). */
export function feeReceiverTableToLegacyAcquirerFees(fees, method, installments = 1, cardBrand = '') {
  void installments;
  const table = normalizeFeeReceiverFeeTable(fees);
  const brand = normalizeCardBrand(cardBrand);
  const pick = (byBrand) => normalizeFeeRow(byBrand?.[brand] ?? byBrand?.default);

  const parcelado = {};
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    const key = String(n);
    parcelado[key] = pick(table.credito_parcelado[key]).percent;
  }

  const debitoRow = pick(table.debito);
  const creditoRow = pick(table.credito_avista);
  const pixRow = normalizeFeeRow(table.pix);
  const antRow = normalizeFeeRow(table.antecipacao);

  return normalizeAcquirerFees({
    pix: pixRow,
    debito: debitoRow,
    credito_avista: creditoRow,
    credito_parcelado: parcelado,
    antecipacao: antRow,
  });
}

/** Converte acquirerFees legado para tabela com só coluna default. */
export function legacyAcquirerFeesToFeeTable(acquirerFees) {
  const fees = normalizeAcquirerFees(acquirerFees || defaultAcquirerFees());
  const byBrand = (percent, fixed = 0) => ({
    default: { percent: Number(percent) || 0, fixed: Number(fixed) || 0 },
  });
  const parcelado = {};
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    const key = String(n);
    parcelado[key] = byBrand(fees.credito_parcelado[key]);
  }
  return normalizeFeeReceiverFeeTable({
    pix: fees.pix,
    debito: byBrand(fees.debito.percent, fees.debito.fixed),
    credito_avista: byBrand(fees.credito_avista.percent, fees.credito_avista.fixed),
    credito_parcelado: parcelado,
    antecipacao: fees.antecipacao,
  });
}

export function feeReceiverSummary(receiver) {
  if (!receiver) return 'Nenhuma taxa configurada';
  if (receiver.useDefaultFees) return 'Usa recebedor padrão';
  const fees = normalizeFeeReceiverFeeTable(receiver.fees);
  const parts = [];
  if (fees.pix?.percent > 0) parts.push(`PIX ${fees.pix.percent}%`);
  if (fees.debito?.default?.percent > 0) parts.push(`Déb. ${fees.debito.default.percent}%`);
  if (fees.credito_avista?.default?.percent > 0) {
    parts.push(`Créd. ${fees.credito_avista.default.percent}%`);
  }
  const parcelHits = ACQUIRER_INSTALLMENT_COUNTS.filter(
    (n) => Number(fees.credito_parcelado?.[String(n)]?.default?.percent || 0) > 0
  );
  if (parcelHits.length) parts.push(`Parcelado (${parcelHits.length} faixas)`);
  if (hasBrandFeeDivergence(receiver, 'cartao_debito', 1)) parts.push('Bandeiras');
  return parts.length ? parts.join(' · ') : 'Nenhuma taxa configurada';
}

export function listFeeReceiverOptions(financeConfig) {
  return readFeeReceivers(financeConfig)
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id,
      name: r.name || FEE_RECEIVER_PROVIDER_LABELS[r.provider] || 'Recebedor',
      label: r.name || FEE_RECEIVER_PROVIDER_LABELS[r.provider] || 'Recebedor',
    }));
}

export function feeReceiversAcquirerConfigured(financeConfig) {
  return readFeeReceivers(financeConfig).some((r) => r.active && hasFeeReceiverFeesConfigured(r));
}

export function countFeeReceiverUsages(financeConfig, receiverId) {
  const id = String(receiverId || '').trim();
  if (!id) return { bankAccounts: 0, captureMethods: 0 };
  const bankAccounts = (financeConfig?.bankAccounts || []).filter(
    (a) => String(a?.feeReceiverId || '').trim() === id
  ).length;
  const captureMethods = (financeConfig?.captureMethods || []).filter(
    (c) => String(c?.feeReceiverId || '').trim() === id
  ).length;
  return { bankAccounts, captureMethods };
}

export function canRemoveFeeReceiver(financeConfig, receiverId) {
  const receivers = readFeeReceivers(financeConfig);
  if (receivers.length <= 1) {
    return { ok: false, reason: 'last_receiver' };
  }
  if (!receivers.some((r) => r.id === receiverId)) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true };
}

/** Omite bandeiras e faixas zeradas ao persistir (read-path normaliza de volta). */
export function compactFeeByBrandForStorage(raw) {
  const normalized = normalizeFeeByBrand(raw);
  const out = {};
  const def = normalized.default;
  if (def.percent > 0 || def.fixed > 0) out.default = def;
  for (const brand of CARD_BRANDS) {
    if (brand === 'default') continue;
    if (normalized[brand]) out[brand] = normalized[brand];
  }
  if (!out.default && Object.keys(out).length > 0) out.default = def;
  return Object.keys(out).length ? out : null;
}

export function compactFeeReceiverFeeTableForStorage(raw) {
  const table = normalizeFeeReceiverFeeTable(raw);
  const out = {};
  const pix = normalizeFeeRow(table.pix);
  if (pix.percent > 0 || pix.fixed > 0) out.pix = pix;
  const ant = normalizeFeeRow(table.antecipacao);
  if (ant.percent > 0 || ant.fixed > 0) out.antecipacao = ant;
  const debito = compactFeeByBrandForStorage(table.debito);
  if (debito) out.debito = debito;
  const avista = compactFeeByBrandForStorage(table.credito_avista);
  if (avista) out.credito_avista = avista;
  const parcelado = {};
  for (const n of ACQUIRER_INSTALLMENT_COUNTS) {
    const key = String(n);
    const compact = compactFeeByBrandForStorage(table.credito_parcelado[key]);
    if (compact) parcelado[key] = compact;
  }
  if (Object.keys(parcelado).length) out.credito_parcelado = parcelado;
  return Object.keys(out).length ? out : null;
}

export function compactFeeReceiverForStorage(raw) {
  const receiver = normalizeFeeReceiver(raw);
  if (!receiver) return null;
  const out = {
    id: receiver.id,
    name: receiver.name,
    provider: receiver.provider,
    active: receiver.active,
  };
  if (receiver.bankAccountLabel) out.bankAccountLabel = receiver.bankAccountLabel;
  if (receiver.useDefaultFees) {
    out.useDefaultFees = true;
    return out;
  }
  const fees = compactFeeReceiverFeeTableForStorage(receiver.fees);
  if (fees) out.fees = fees;
  return out;
}

export function feeReceiversSettingsSummary(financeConfig) {
  const receivers = readFeeReceivers(financeConfig).filter((r) => r.active);
  if (!receivers.length) return null;
  const defaultId = String(financeConfig?.defaultFeeReceiverId || '').trim();
  const primary = findFeeReceiverById(financeConfig, defaultId) || receivers[0];
  const parts = [];
  const label = primary?.name || FEE_RECEIVER_PROVIDER_LABELS[primary?.provider] || 'Recebedor';
  const detail = feeReceiverSummary(primary);
  if (
    detail &&
    detail !== 'Nenhuma taxa configurada' &&
    detail !== 'Usa recebedor padrão'
  ) {
    parts.push(`${label} · ${detail}`);
  } else {
    parts.push(label);
  }
  if (receivers.length > 1) {
    parts.push(`${receivers.length} recebedores`);
  }
  return parts.join(' · ');
}
