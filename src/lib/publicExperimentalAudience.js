/** Faixa etária e filtro de slots para agendamento público de experimental. */

export const PROFILE_TYPES = ['Criança', 'Juniores', 'Adulto'];

/** Keywords padrão (GB-friendly); academias podem sobrescrever em settings. */
export const DEFAULT_EXPERIMENTAL_AUDIENCE_KEYWORDS = {
  'Criança': ['gbk', 'kids', 'kid', 'infantil', 'criança', 'crianca', 'children', 'baby'],
  Juniores: ['gbk', 'junior', 'juniores', 'teen', 'adolescente', 'jovem'],
  Adulto: ['gb1', 'gb2', 'gb3', 'adulto', 'adult', 'iniciante', 'fundamentals', 'all levels'],
};

const BIRTH_DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} birthYmd
 * @param {Date} [today]
 * @returns {'Criança' | 'Juniores' | 'Adulto' | null}
 */
export function inferProfileTypeFromBirthDate(birthYmd, today = new Date()) {
  const ymd = String(birthYmd || '').trim().slice(0, 10);
  if (!BIRTH_DATE_YMD.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const birth = new Date(y, m - 1, d);
  if (Number.isNaN(birth.getTime())) return null;

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  if (age < 12) return 'Criança';
  if (age < 18) return 'Juniores';
  return 'Adulto';
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string[]>}
 */
export function normalizeExperimentalAudienceRules(raw) {
  const base = { ...DEFAULT_EXPERIMENTAL_AUDIENCE_KEYWORDS };
  if (!raw || typeof raw !== 'object') return base;

  for (const type of PROFILE_TYPES) {
    const list = raw[type];
    if (!Array.isArray(list)) continue;
    const cleaned = list
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 32);
    if (cleaned.length > 0) base[type] = cleaned;
  }
  return base;
}

/**
 * @param {{ name?: string, level?: string, modality?: string }} slot
 */
export function slotSearchHaystack(slot) {
  return `${slot?.name || ''} ${slot?.level || ''} ${slot?.modality || ''}`.toLowerCase();
}

/**
 * @param {string} haystack
 * @param {string[]} keywords
 */
function haystackMatchesKeywords(haystack, keywords) {
  return (keywords || []).some((k) => haystack.includes(String(k).toLowerCase()));
}

/**
 * Slot visível se combina com o tipo OU não combina com nenhum tipo (genérico).
 * @param {object} slot
 * @param {string} profileType
 * @param {Record<string, string[]>} [rules]
 */
export function isSlotVisibleForProfileType(slot, profileType, rules) {
  const type = PROFILE_TYPES.includes(profileType) ? profileType : 'Adulto';
  const normalized = normalizeExperimentalAudienceRules(rules);
  const hay = slotSearchHaystack(slot);

  if (haystackMatchesKeywords(hay, normalized[type])) return true;

  const anyTyped = PROFILE_TYPES.some((t) => haystackMatchesKeywords(hay, normalized[t]));
  return !anyTyped;
}

/**
 * @param {object[]} slots
 * @param {string} profileType
 * @param {Record<string, string[]>} [rules]
 */
export function filterSlotsForProfileType(slots, profileType, rules) {
  return (slots || []).filter((s) => isSlotVisibleForProfileType(s, profileType, rules));
}
