export const PAYER_ALIAS_MAX = 10;
export const PAYER_ALIAS_DISPLAY_MAX = 128;

const SOURCE_RANK = { manual: 3, from_responsavel: 2, learned: 1 };

export function normalizePayerName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleCasePayerName(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function parsePayerAliasesJson(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const display = String(entry?.display || '').trim().slice(0, PAYER_ALIAS_DISPLAY_MAX);
        const normalized = String(entry?.normalized || '').trim() || normalizePayerName(display);
        const source = String(entry?.source || 'manual');
        if (!display || !normalized) return null;
        const out = {
          display,
          normalized: normalized.slice(0, PAYER_ALIAS_DISPLAY_MAX),
          source: SOURCE_RANK[source] ? source : 'manual',
        };
        if (entry?.learned_at) out.learned_at = String(entry.learned_at).slice(0, 64);
        if (entry?.auto_suggest === true) out.auto_suggest = true;
        return out;
      })
      .filter(Boolean)
      .slice(0, PAYER_ALIAS_MAX);
  } catch {
    return [];
  }
}

export function serializePayerAliases(aliases) {
  const safe = (Array.isArray(aliases) ? aliases : []).slice(0, PAYER_ALIAS_MAX);
  return JSON.stringify(safe).slice(0, 4096);
}

export function aliasExists(aliases, normalized) {
  const key = normalizePayerName(normalized);
  if (!key) return false;
  return (aliases || []).some((a) => a.normalized === key);
}

export function appendPayerAlias(existing, { display, source = 'manual', learnedAt = null, auto_suggest = false } = {}) {
  const disp = String(display || '').trim().slice(0, PAYER_ALIAS_DISPLAY_MAX);
  const normalized = normalizePayerName(disp);
  if (!disp || !normalized) {
    return { aliases: existing || [], added: false, error: 'invalid_name' };
  }

  const list = [...(existing || [])];
  const idx = list.findIndex((a) => a.normalized === normalized);
  const src = SOURCE_RANK[source] ? source : 'manual';

  if (idx >= 0) {
    const current = list[idx];
    const currentRank = SOURCE_RANK[current.source] || 0;
    const nextRank = SOURCE_RANK[src] || 0;
    if (nextRank > currentRank || auto_suggest) {
      list[idx] = {
        ...current,
        display: disp,
        source: nextRank > currentRank ? src : current.source,
        ...(src === 'learned' && learnedAt ? { learned_at: learnedAt } : {}),
        ...(auto_suggest ? { auto_suggest: true } : current.auto_suggest ? { auto_suggest: true } : {}),
      };
    }
    return { aliases: list, added: false, updated: nextRank > currentRank || auto_suggest };
  }

  if (list.length >= PAYER_ALIAS_MAX) {
    return { aliases: list, added: false, error: 'limit_reached' };
  }

  list.push({
    display: disp,
    normalized,
    source: src,
    ...(src === 'learned' && learnedAt ? { learned_at: learnedAt } : {}),
    ...(auto_suggest ? { auto_suggest: true } : {}),
  });

  return { aliases: list, added: true };
}
