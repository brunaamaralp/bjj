const STORAGE_PREFIX = 'finance:recentCategories:';
const MAX_RECENT = 5;

export function loadRecentCategories(academyId) {
  if (!academyId || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${academyId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
}

export function recordRecentCategory(academyId, value) {
  const v = String(value || '').trim();
  if (!academyId || !v || typeof localStorage === 'undefined') return;
  try {
    const prev = loadRecentCategories(academyId).filter((item) => item !== v);
    const next = [v, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(`${STORAGE_PREFIX}${academyId}`, JSON.stringify(next));
  } catch {
    void 0;
  }
}

export function mergeRecentWithFrequent(recent, frequentLabels, resolveLabel) {
  const seen = new Set();
  const chips = [];
  for (const value of recent) {
    const label = resolveLabel(value);
    if (!label || seen.has(value)) continue;
    seen.add(value);
    chips.push({ value, label });
  }
  for (const label of frequentLabels) {
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push({ value: label, label });
    if (chips.length >= 5) break;
  }
  return chips.slice(0, 5);
}
