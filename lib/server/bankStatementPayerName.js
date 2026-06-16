import {
  normalizePayerName,
  titleCasePayerName,
} from '../../src/lib/studentPayerAliases.js';

const PREFIXES = [
  'PIX RECEBIDO',
  'PIX ENVIADO',
  'PIX',
  'TRANSFERENCIA',
  'TRANSFERÊNCIA',
  'TRANSF',
  'TED',
  'DOC',
  'RECEBIMENTO',
  'CREDITO',
  'CRÉDITO',
  'DEPOSITO',
  'DEPÓSITO',
  'PAGAMENTO',
  'SISPAG',
  'TARIFA',
  'TAXA',
];

function stripNoise(text) {
  let out = String(text || '').trim();
  let changed = true;
  while (changed && out) {
    changed = false;
    for (const prefix of PREFIXES) {
      const re = new RegExp(`^${prefix}\\s*[-–—:]?\\s*`, 'i');
      if (re.test(out)) {
        out = out.replace(re, '').trim();
        changed = true;
      }
    }
  }
  out = out.replace(/\d{2}\.\d{3}\.\d{3}[./-]?\d{2,}/g, ' ');
  out = out.replace(/\b\d{6,}\b/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

export function extractPayerNameFromDescription(description) {
  const cleaned = stripNoise(description);
  if (!cleaned || cleaned.length < 3) return null;
  if (/^\d+$/.test(cleaned)) return null;
  const normalized = normalizePayerName(cleaned);
  if (!normalized || normalized.length < 3) return null;
  return {
    display: titleCasePayerName(cleaned).slice(0, 128),
    normalized,
  };
}

function significantTokens(value) {
  return normalizePayerName(value)
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function tokenOverlapScore(a, b) {
  const ta = new Set(significantTokens(a));
  const tb = significantTokens(b);
  let hits = 0;
  for (const t of tb) {
    if (ta.has(t)) hits += 1;
  }
  return hits;
}

/**
 * @param {string} description
 * @param {{ lead_name?: string, responsavel?: string, payer_aliases?: Array }} context
 * @returns {0|15|20|25|30|35}
 */
export function scorePayerNameMatch(description, context) {
  if (!context) return 0;
  const extracted = extractPayerNameFromDescription(description);
  if (!extracted) return 0;

  const { normalized } = extracted;
  let bonus = 0;

  const leadNorm = normalizePayerName(context.lead_name);
  if (leadNorm && normalized === leadNorm) bonus = Math.max(bonus, 25);

  const respNorm = normalizePayerName(context.responsavel);
  if (respNorm && normalized === respNorm) bonus = Math.max(bonus, 15);

  for (const alias of context.payer_aliases || []) {
    const aliasNorm = String(alias?.normalized || '').trim();
    if (!aliasNorm) continue;
    if (normalized === aliasNorm) {
      const srcBonus = alias.source === 'learned' || alias.source === 'manual' ? 35 : 30;
      bonus = Math.max(bonus, srcBonus);
      continue;
    }
    if (aliasNorm.length >= 8 && (normalized.includes(aliasNorm) || aliasNorm.includes(normalized))) {
      bonus = Math.max(bonus, 30);
    }
  }

  const overlapLead = tokenOverlapScore(context.lead_name, normalized);
  if (overlapLead >= 2) bonus = Math.max(bonus, 20);

  for (const alias of context.payer_aliases || []) {
    if (tokenOverlapScore(alias.display, normalized) >= 2) {
      bonus = Math.max(bonus, 20);
    }
  }

  return bonus;
}
