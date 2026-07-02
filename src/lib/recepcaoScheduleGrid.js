import {
  SCHEDULE_WEEKDAY_LABELS,
  SCHEDULE_WEEKDAYS,
  compareTimeHHMM,
  normalizeDaysOfWeek,
} from './schedules.js';

const JS_DAY_TO_ID = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;

export const MODALITY_FILTER_STORAGE_KEY = 'recepcao:schedule-modality:v1';

/** @param {string} [timeZone] */
export function todayYmd(timeZone = 'America/Sao_Paulo') {
  return new Date().toLocaleDateString('en-CA', { timeZone });
}

/** @param {Date} [refDate] */
export function getTodayWeekdayId(refDate = new Date()) {
  return JS_DAY_TO_ID[refDate.getDay()];
}

/** @param {object[]} schedules */
export function resolveScheduleGridColumns(schedules) {
  const active = (schedules || []).filter((s) => s?.is_active !== false);
  const usedDays = new Set();
  for (const s of active) {
    for (const d of normalizeDaysOfWeek(s.days_of_week)) {
      usedDays.add(d);
    }
  }
  return SCHEDULE_WEEKDAYS.filter((id) => id !== 'sun' || usedDays.has('sun')).map((id) => ({
    id,
    label: SCHEDULE_WEEKDAY_LABELS[id],
  }));
}

/**
 * @param {{ rows: { cells: Record<string, object[]> }[] }} grid
 * @param {string} todayId
 */
export function flattenTodaySchedules(grid, todayId) {
  const items = [];
  const seen = new Set();
  for (const row of grid.rows || []) {
    for (const item of row.cells[todayId] || []) {
      const id = String(item?.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }
  }
  return items.sort((a, b) => compareTimeHHMM(a.time_start, b.time_start));
}

/** @param {object | null | undefined} classDoc */
export function resolveScheduleCardStyle(classDoc) {
  const raw = String(classDoc?.color || '').trim();
  if (HEX_COLOR_RE.test(raw)) {
    return {
      borderColor: raw,
      surfaceColor: `color-mix(in srgb, ${raw} 12%, var(--color-primary-surface, #ede9fb))`,
    };
  }
  return {
    borderColor: 'var(--color-primary)',
    surfaceColor: 'var(--color-primary-surface, #ede9fb)',
  };
}

/** @param {string} hhmm */
function parseLocalHm(hhmm) {
  const parts = String(hhmm || '').trim().slice(0, 5).split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

/**
 * @param {string} timeStart
 * @param {string} timeEnd
 * @param {Date} nowDate
 * @param {{ soonMinutes?: number }} [opts]
 */
export function classifyScheduleTimeStatus(timeStart, timeEnd, nowDate, opts = {}) {
  const soonMinutes = opts.soonMinutes ?? 60;
  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();
  const startMins = parseLocalHm(timeStart);
  const endMins = parseLocalHm(timeEnd);
  if (nowMins >= startMins && nowMins < endMins) return 'ongoing';
  if (nowMins >= endMins) return 'past';
  if (nowMins < startMins && startMins - nowMins <= soonMinutes) return 'soon';
  return 'upcoming';
}

/**
 * @param {object[]} slots
 * @param {string} dateYmd
 */
export function slotByScheduleIdForDate(slots, dateYmd) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const slot of slots || []) {
    if (String(slot?.slot_date || '').trim() !== String(dateYmd || '').trim()) continue;
    const sid = String(slot?.schedule_id || '').trim();
    if (sid) map.set(sid, slot);
  }
  return map;
}

/** @param {number} booked @param {number | null | undefined} max */
export function capacityTone(booked, max) {
  if (max == null || max < 1) return null;
  const n = Number(booked) || 0;
  if (n >= max) return 'full';
  if (n / max >= 0.8) return 'warn';
  return 'ok';
}

export function readModalityFilter() {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return String(sessionStorage.getItem(MODALITY_FILTER_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

/** @param {string} value */
export function writeModalityFilter(value) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const v = String(value || '').trim();
    if (v) sessionStorage.setItem(MODALITY_FILTER_STORAGE_KEY, v);
    else sessionStorage.removeItem(MODALITY_FILTER_STORAGE_KEY);
  } catch {
    /* private browsing */
  }
}

/** @param {'ongoing' | 'soon' | 'past' | 'upcoming' | null | undefined} status */
export function scheduleTimeStatusLabel(status) {
  if (status === 'ongoing') return 'Em andamento';
  if (status === 'soon') return 'Em breve';
  return null;
}

/**
 * @param {object} item
 * @param {{ isToday?: boolean, slotByScheduleId?: Map<string, object>, nowDate?: Date }} ctx
 */
export function resolveScheduleCardContext(item, ctx = {}) {
  const isToday = Boolean(ctx.isToday);
  const nowDate = ctx.nowDate instanceof Date ? ctx.nowDate : new Date();
  const timeStatus = isToday
    ? classifyScheduleTimeStatus(item?.time_start, item?.time_end, nowDate)
    : null;
  const slot = isToday && ctx.slotByScheduleId ? ctx.slotByScheduleId.get(String(item?.id || '')) : null;
  const occupancy = slot
    ? {
        booked: Number(slot.booked_count) || 0,
        max: slot.max_capacity == null ? null : Number(slot.max_capacity) || null,
      }
    : null;
  return { timeStatus, occupancy };
}

/** @param {{ booked: number, max: number | null }} occupancy */
export function formatOccupancyLabel(occupancy) {
  if (!occupancy) return '';
  if (occupancy.max == null || occupancy.max < 1) {
    return `${occupancy.booked} inscrito${occupancy.booked === 1 ? '' : 's'}`;
  }
  return `${occupancy.booked} / ${occupancy.max}`;
}
