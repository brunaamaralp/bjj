import { formatLocalYmd } from './studentEnrollmentDate.js';

const STORAGE_PREFIX = 'dashboard:followupStreak:v1:';

function storageKey(academyId) {
  return `${STORAGE_PREFIX}${String(academyId || '').trim()}`;
}

function yesterdayYmd(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - 1);
  return formatLocalYmd(d);
}

function load(academyId) {
  if (typeof localStorage === 'undefined') {
    return { streak: 0, lastClearYmd: null, days: {} };
  }
  try {
    const raw = localStorage.getItem(storageKey(academyId));
    if (!raw) return { streak: 0, lastClearYmd: null, days: {} };
    const parsed = JSON.parse(raw);
    return {
      streak: Number(parsed?.streak) || 0,
      lastClearYmd: parsed?.lastClearYmd || null,
      days: parsed?.days && typeof parsed.days === 'object' ? parsed.days : {},
    };
  } catch {
    return { streak: 0, lastClearYmd: null, days: {} };
  }
}

function save(academyId, data) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(academyId), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Atualiza e retorna streak de dias consecutivos com retornos em dia.
 * @param {string} academyId
 * @param {number} followUpsCount
 * @param {Date} [now]
 */
export function touchFollowupStreak(academyId, followUpsCount, now = new Date()) {
  const id = String(academyId || '').trim();
  if (!id) return 0;

  const today = formatLocalYmd(now);
  const yesterday = yesterdayYmd(now);
  const data = load(id);
  const pending = followUpsCount > 0;

  if (pending) {
    data.days[today] = { pending: true };
    save(id, data);
    return data.streak;
  }

  const yesterdayHadPending = data.days[yesterday]?.pending === true;

  if (yesterdayHadPending) {
    data.streak = 1;
  } else if (data.lastClearYmd === yesterday) {
    data.streak = (data.streak || 0) + 1;
  } else if (data.lastClearYmd !== today) {
    data.streak = 1;
  }

  data.lastClearYmd = today;
  data.days[today] = { pending: false };

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffYmd = formatLocalYmd(cutoff);
  for (const key of Object.keys(data.days)) {
    if (key < cutoffYmd) delete data.days[key];
  }

  save(id, data);
  return data.streak;
}

/** Lê streak sem atualizar (útil em testes). */
export function readFollowupStreak(academyId) {
  return load(academyId).streak;
}
