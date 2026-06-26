import { coercePlanList, compactPlanForStorage } from './financeConfigStorage.js';

function planNameKey(plan) {
  return String(plan?.name || '').trim().toLowerCase();
}

function parseBoolLoose(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (['false', '0', 'no', 'nao', 'não'].includes(s)) return false;
  if (['true', '1', 'yes', 'sim'].includes(s)) return true;
  return null;
}

function parsePrice(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * @param {string} line
 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * CSV: name,price,applyCardFee,isExempt,description
 * @param {string} content
 */
export function parsePlansCsv(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (!lines.length) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.includes('name');
  const start = hasHeader ? 1 : 0;

  const idx = (key, fallback) => {
    const i = header.indexOf(key);
    return i >= 0 ? i : fallback;
  };

  const nameIdx = hasHeader ? idx('name', 0) : 0;
  const priceIdx = hasHeader ? idx('price', 1) : 1;
  const feeIdx = hasHeader ? idx('applycardfee', 2) : 2;
  const exemptIdx = hasHeader ? idx('isexempt', 3) : 3;
  const descIdx = hasHeader ? idx('description', 4) : 4;

  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const name = String(cols[nameIdx] || '').trim();
    if (!name) continue;
    const price = parsePrice(cols[priceIdx]);
    const feeRaw = hasHeader && feeIdx < cols.length ? parseBoolLoose(cols[feeIdx]) : null;
    const row = {
      name,
      price: price ?? 0,
      applyCardFee: feeRaw === null ? true : feeRaw,
    };
    if (hasHeader && exemptIdx < cols.length) {
      const ex = parseBoolLoose(cols[exemptIdx]);
      if (ex === true) row.isExempt = true;
    }
    const description = hasHeader && descIdx < cols.length ? String(cols[descIdx] || '').trim() : '';
    if (description) row.description = description;
    rows.push(row);
  }
  return rows;
}

/**
 * @param {string} raw JSON array or single object
 */
export function parsePlansJson(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) return parsed.filter((p) => p && typeof p === 'object');
  if (parsed && typeof parsed === 'object') return [parsed];
  return [];
}

export function formatPlanLabel(plan) {
  const name = String(plan?.name || '').trim();
  if (!name) return '';
  if (plan?.isExempt === true) return `${name} (Isento)`;
  const price = Number(plan?.price ?? 0);
  return price > 0 ? `${name} (R$ ${price})` : name;
}

/**
 * Mescla planos do restore com o cadastro existente.
 * Por padrão não sobrescreve planos já cadastrados (mesmo nome).
 */
export function mergeRestoredPlans(existingPlans, incomingPlans, { overwritePrices = false } = {}) {
  const byName = new Map();
  const added = [];
  const skipped = [];
  const updated = [];

  for (const plan of coercePlanList(existingPlans)) {
    const key = planNameKey(plan);
    if (key) byName.set(key, plan);
  }

  for (const raw of incomingPlans || []) {
    const next = compactPlanForStorage(raw);
    if (!next) continue;
    const key = planNameKey(next);
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, next);
      added.push(next);
      continue;
    }
    if (overwritePrices) {
      const merged = compactPlanForStorage({ ...prev, ...next, name: prev.name || next.name });
      byName.set(key, merged);
      updated.push(merged);
    } else {
      skipped.push(prev);
    }
  }

  return {
    plans: [...byName.values()],
    added,
    skipped,
    updated,
  };
}
