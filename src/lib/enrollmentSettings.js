import { parseAcademySettings } from './stockSettings.js';

export const DEFAULT_ENROLLMENT_FOLLOW_UP = {
  title: 'Check-in de acompanhamento',
  days: 30,
};

/**
 * @param {unknown} settingsRaw — academy.settings (string ou objeto)
 * @returns {{ title: string, days: number } | null}
 */
export function readEnrollmentFollowUpTask(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.enrollmentFollowUpTask;
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const title = String(raw.title || '').trim();
  const days = Number(raw.days);
  if (!title || !Number.isFinite(days) || days < 0) return null;
  return { title, days: Math.trunc(days) };
}

export function mergeEnrollmentFollowUpIntoSettings(settingsRaw, followUp) {
  const base = parseAcademySettings(settingsRaw);
  if (!followUp || !String(followUp.title || '').trim()) {
    const { enrollmentFollowUpTask: _removed, ...rest } = base;
    return rest;
  }
  const days = Number(followUp.days);
  if (!Number.isFinite(days) || days < 0) {
    const { enrollmentFollowUpTask: _removed, ...rest } = base;
    return rest;
  }
  return {
    ...base,
    enrollmentFollowUpTask: {
      title: String(followUp.title).trim(),
      days: Math.trunc(days),
    },
  };
}

export function addDaysToYmd(days, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + Math.trunc(Number(days) || 0));
  return d.toISOString().slice(0, 10);
}
