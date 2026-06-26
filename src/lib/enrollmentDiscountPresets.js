import { DISCOUNT_TYPES, normalizeDiscountType } from './planBilling.js';

export const PRESET_NONE = '__none__';
export const PRESET_CUSTOM = '__custom__';

export const DEFAULT_ENROLLMENT_DISCOUNT_PRESETS = [
  { id: 'family', label: 'Família', type: DISCOUNT_TYPES.PERCENT, amount: 7 },
  { id: 'public_security', label: 'Segurança pública', type: DISCOUNT_TYPES.PERCENT, amount: 15 },
];

function slugId(label, index) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || `preset_${index}`;
}

/**
 * @param {unknown} raw
 * @returns {Array<{ id: string, label: string, type: string, amount: number }>}
 */
export function normalizeEnrollmentDiscountPresets(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const label = String(item.label || '').trim().slice(0, 64);
    if (!label) continue;
    const type = normalizeDiscountType(item.type, item.amount);
    if (type !== DISCOUNT_TYPES.FIXED && type !== DISCOUNT_TYPES.PERCENT) continue;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (type === DISCOUNT_TYPES.PERCENT && amount > 100) continue;

    let id = String(item.id || '').trim().slice(0, 48) || slugId(label, i);
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);

    out.push({
      id,
      label,
      type,
      amount: Math.round(amount * 100) / 100,
    });
  }

  return out;
}

export function readEnrollmentDiscountPresets(financeConfig) {
  const fromConfig = normalizeEnrollmentDiscountPresets(financeConfig?.enrollmentDiscountPresets);
  return fromConfig.length ? fromConfig : [...DEFAULT_ENROLLMENT_DISCOUNT_PRESETS];
}

export function mergeEnrollmentDiscountPresetsIntoFinanceConfig(financeConfig, presets) {
  const normalized = normalizeEnrollmentDiscountPresets(presets);
  return {
    ...(financeConfig && typeof financeConfig === 'object' ? financeConfig : {}),
    enrollmentDiscountPresets: normalized,
  };
}

export function formatPresetOptionLabel(preset) {
  if (!preset) return '';
  if (preset.type === DISCOUNT_TYPES.PERCENT) {
    const pct = Number.isInteger(preset.amount) ? String(preset.amount) : preset.amount.toLocaleString('pt-BR');
    return `${preset.label} — ${pct}%`;
  }
  const value = Number(preset.amount) || 0;
  return `${preset.label} — ${value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
}

export function findMatchingPreset(presets, discountType, discountAmount) {
  const type = normalizeDiscountType(discountType, discountAmount);
  const amount = Number(discountAmount) || 0;
  if (type === DISCOUNT_TYPES.NONE || amount <= 0) return null;
  return (
    (presets || []).find(
      (p) => p.type === type && Math.abs(Number(p.amount) - amount) < 0.005
    ) || null
  );
}

export function resolvePresetSelectionKey(presets, discountType, discountAmount) {
  const type = normalizeDiscountType(discountType, discountAmount);
  const amount = Number(discountAmount) || 0;
  if (type === DISCOUNT_TYPES.NONE || amount <= 0) return PRESET_NONE;
  const match = findMatchingPreset(presets, type, amount);
  return match ? match.id : PRESET_CUSTOM;
}
