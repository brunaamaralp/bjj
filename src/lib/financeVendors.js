/**
 * Fornecedores recorrentes em academy.financeConfig.vendors (Fase 2 A pagar).
 */
import { getUtilityExpenseCategories } from './financeCategories.js';

function newVendorId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeFinanceVendor(raw = {}) {
  const name = String(raw?.name || '').trim();
  if (!name) return null;
  const id = String(raw?.id || '').trim() || newVendorId();
  const defaultCategory = String(raw?.defaultCategory || raw?.default_category || '').trim();
  const dayRaw = Number(raw?.defaultDueDay ?? raw?.default_due_day);
  const defaultDueDay =
    Number.isFinite(dayRaw) && dayRaw >= 1 && dayRaw <= 28 ? Math.floor(dayRaw) : undefined;
  const active = raw?.active !== false;
  return {
    id,
    name,
    ...(defaultCategory ? { defaultCategory } : {}),
    ...(defaultDueDay ? { defaultDueDay } : {}),
    active,
  };
}

export function normalizeFinanceVendors(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const row = normalizeFinanceVendor(entry);
    if (!row) continue;
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function readFinanceVendors(financeConfig) {
  return normalizeFinanceVendors(financeConfig?.vendors);
}

export function activeFinanceVendors(financeConfig) {
  return readFinanceVendors(financeConfig).filter((v) => v.active !== false);
}

export function findFinanceVendorByName(financeConfig, name) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  return (
    readFinanceVendors(financeConfig).find((v) => v.name.toLowerCase() === q) || null
  );
}

export function vendorCategoryOptions() {
  const utils = getUtilityExpenseCategories();
  const extraLabels = ['Aluguel', 'Salários', 'Sistemas', 'Outras despesas'];
  const seen = new Set();
  const out = [];
  for (const c of [...utils, ...extraLabels.map((label) => ({ label }))]) {
    const label = String(c?.label || c || '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function createEmptyFinanceVendor() {
  return normalizeFinanceVendor({ name: '', active: true }) || {
    id: newVendorId(),
    name: '',
    active: true,
  };
}
