export const CONTROLID_ENTRY_COOLDOWN_MAX = 240;

/** 0 = desligado; caso contrário 1–240 minutos. */
export function clampEntryCooldownMinutes(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(CONTROLID_ENTRY_COOLDOWN_MAX, Math.trunc(n));
}

/** ISO mínimo de `checked_in_at` para considerar presença recente no anti-passback. */
export function entryCooldownSinceIso(cooldownMinutes, nowMs = Date.now()) {
  const min = clampEntryCooldownMinutes(cooldownMinutes);
  if (min <= 0) return null;
  return new Date(nowMs - min * 60_000).toISOString();
}

export function shouldBlockEntryForCooldown(cooldownMinutes, hasRecentAttendance) {
  if (clampEntryCooldownMinutes(cooldownMinutes) <= 0) return false;
  return hasRecentAttendance === true;
}
