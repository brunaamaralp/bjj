import { resolveFinanceCategory } from './financeCategories.js';

export function formatPayableCategoryLabel(raw, accounts = null) {
  const value = String(raw || '').trim();
  if (!value) return '—';
  const resolved = resolveFinanceCategory(value, accounts, { direction: 'out' });
  return resolved?.label || value;
}

/** Flatten SearchableGroupedSelect groups → opções de <select> filtro. */
export function payableCategoryFilterOptions(groups) {
  const out = [];
  const seen = new Set();
  const map = groups instanceof Map ? groups : new Map();
  for (const items of map.values()) {
    for (const c of items || []) {
      const value = c.value || c.label;
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push({ value, label: c.label });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
