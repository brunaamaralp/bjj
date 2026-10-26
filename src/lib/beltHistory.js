/** Histórico de graduação do aluno — parse, seed, derivação de belt/belt_since. */

export const BELT_HISTORY_MAX = 50;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function newEntryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDate(raw) {
  const s = String(raw || '').trim().slice(0, 10);
  return YMD_RE.test(s) ? s : '';
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim().slice(0, 64);
  const belt = String(raw.belt || '').trim().slice(0, 256);
  if (!id || !belt) return null;
  return { id, belt, date: normalizeDate(raw.date) };
}

export function parseBeltHistoryJson(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter(Boolean).slice(0, BELT_HISTORY_MAX);
  } catch {
    return [];
  }
}

export function serializeBeltHistory(entries) {
  const safe = sortBeltHistory(Array.isArray(entries) ? entries : [])
    .map(normalizeEntry)
    .filter(Boolean)
    .slice(0, BELT_HISTORY_MAX);
  return JSON.stringify(safe);
}

export function sortBeltHistory(entries) {
  const list = (Array.isArray(entries) ? entries : []).map(normalizeEntry).filter(Boolean);
  list.sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (!da && db) return -1;
    if (da && !db) return 1;
    if (da !== db) return da.localeCompare(db);
    return String(a.id).localeCompare(String(b.id));
  });
  return list;
}

export function deriveBeltFields(entries) {
  const sorted = sortBeltHistory(entries);
  if (sorted.length === 0) return { belt: '', beltSince: '' };
  const last = sorted[sorted.length - 1];
  return { belt: last.belt, beltSince: last.date || '' };
}

export function seedBeltHistoryFromLegacy({ belt, enrollmentDate } = {}) {
  const b = String(belt || '').trim().slice(0, 256);
  if (!b) return [];
  return [
    {
      id: newEntryId(),
      belt: b,
      date: normalizeDate(enrollmentDate),
    },
  ];
}

/**
 * @param {object} student
 * @returns {{ entries: object[], belt: string, beltSince: string, didSeed: boolean }}
 */
export function ensureBeltHistorySeeded(student) {
  const existing = sortBeltHistory(
    parseBeltHistoryJson(student?.beltHistory ?? student?.belt_history_json ?? student?.beltHistoryJson)
  );
  if (existing.length > 0) {
    const derived = deriveBeltFields(existing);
    return { entries: existing, belt: derived.belt, beltSince: derived.beltSince, didSeed: false };
  }
  const legacyBelt = String(student?.belt || '').trim();
  if (!legacyBelt) {
    return { entries: [], belt: '', beltSince: '', didSeed: false };
  }
  const seeded = seedBeltHistoryFromLegacy({
    belt: legacyBelt,
    enrollmentDate: student?.enrollmentDate || student?.enrollment_date || '',
  });
  const derived = deriveBeltFields(seeded);
  return { entries: seeded, belt: derived.belt, beltSince: derived.beltSince, didSeed: true };
}

/**
 * @param {object[]} entries
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function buildBeltHistoryPatch(entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length > BELT_HISTORY_MAX) {
    return { ok: false, error: `Máximo de ${BELT_HISTORY_MAX} promoções no histórico.` };
  }
  const normalized = sortBeltHistory(list);
  if (normalized.length > BELT_HISTORY_MAX) {
    return { ok: false, error: `Máximo de ${BELT_HISTORY_MAX} promoções no histórico.` };
  }
  const { belt, beltSince } = deriveBeltFields(normalized);
  const json = serializeBeltHistory(normalized);
  return {
    ok: true,
    patch: {
      beltHistory: normalized,
      belt,
      beltSince,
      belt_history_json: json,
      belt_since: beltSince,
    },
  };
}

function addMonthsYmd(ymd, months) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * @param {object} student
 * @param {number|null|undefined} minMonths
 * @param {string} todayYmd YYYY-MM-DD
 */
export function studentMatchesBeltSinceMonths(student, minMonths, todayYmd) {
  const n = Number(minMonths);
  if (!Number.isFinite(n) || n <= 0) return true;
  const since = normalizeDate(student?.beltSince ?? student?.belt_since);
  if (!since) return false;
  const today = normalizeDate(todayYmd);
  if (!today) return false;
  const threshold = addMonthsYmd(today, -Math.trunc(n));
  if (!threshold) return false;
  return since <= threshold;
}

export function createBeltHistoryEntry({ belt, date } = {}) {
  const b = String(belt || '').trim().slice(0, 256);
  if (!b) return null;
  return { id: newEntryId(), belt: b, date: normalizeDate(date) };
}
