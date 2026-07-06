/**
 * Domínio puro — agendamento de aulas (slots + bookings).
 */

import { localDateTimeToUtcIso } from './bookingDateTime.js';

export const SLOT_STATUS_SCHEDULED = 'scheduled';
export const SLOT_STATUS_CANCELLED = 'cancelled';
export const SLOT_STATUS_COMPLETED = 'completed';

export const BOOKING_STATUS_BOOKED = 'booked';
export const BOOKING_STATUS_CANCELLED = 'cancelled';
export const BOOKING_STATUS_CHECKED_IN = 'checked_in';
export const BOOKING_STATUS_NO_SHOW = 'no_show';

export const BOOKING_SOURCE_RECEPTION = 'reception';
export const BOOKING_SOURCE_STAFF = 'staff';
export const BOOKING_SOURCE_SYSTEM = 'system';
export const BOOKING_SOURCE_PUBLIC = 'public';

export const MATCH_TYPE_CATRACA = 'catraca';
export const MATCH_TYPE_MANUAL = 'manual';
export const MATCH_TYPE_AUTO = 'auto';

export const DEFAULT_SLOT_HORIZON_DAYS = 14;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
export const DEFAULT_CHECKIN_WINDOW_BEFORE_MIN = 30;
export const DEFAULT_CHECKIN_WINDOW_AFTER_MIN = 15;

const ACTIVE_BOOKING_STATUSES = new Set([BOOKING_STATUS_BOOKED]);

/**
 * @param {unknown} raw
 */
export function parseBookingSettings(raw) {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? (() => {
            try {
              const p = JSON.parse(raw);
              return p && typeof p === 'object' ? p : {};
            } catch {
              return {};
            }
          })()
        : {};

  const booking = base.booking && typeof base.booking === 'object' ? base.booking : {};
  const before = Number(booking.checkin_window_before_min ?? booking.checkinWindowBeforeMin);
  const after = Number(booking.checkin_window_after_min ?? booking.checkinWindowAfterMin);
  const horizon = Number(booking.slot_horizon_days ?? booking.slotHorizonDays);
  const tz = String(booking.timezone || booking.timeZone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;

  return {
    enabled: booking.enabled !== false,
    timezone: tz,
    slot_horizon_days:
      Number.isFinite(horizon) && horizon >= 1 && horizon <= 60
        ? Math.floor(horizon)
        : DEFAULT_SLOT_HORIZON_DAYS,
    checkin_window_before_min:
      Number.isFinite(before) && before >= 0 && before <= 180
        ? Math.floor(before)
        : DEFAULT_CHECKIN_WINDOW_BEFORE_MIN,
    checkin_window_after_min:
      Number.isFinite(after) && after >= 0 && after <= 180
        ? Math.floor(after)
        : DEFAULT_CHECKIN_WINDOW_AFTER_MIN,
  };
}

/**
 * Capacidade em cascata: schedule → class → null (ilimitado).
 * @param {{ max_capacity?: unknown }} [schedule]
 * @param {{ max_capacity?: unknown }} [classDoc]
 */
export function resolveMaxCapacity(schedule, classDoc) {
  const schedCap = schedule?.max_capacity;
  if (schedCap != null && schedCap !== '') {
    const n = Number(schedCap);
    if (Number.isFinite(n) && n >= 1) return Math.min(200, Math.floor(n));
  }
  const classCap = classDoc?.max_capacity;
  if (classCap != null && classCap !== '') {
    const n = Number(classCap);
    if (Number.isFinite(n) && n >= 1) return Math.min(200, Math.floor(n));
  }
  return null;
}

/** @param {string} status */
export function isSlotBookable(status) {
  return String(status || '') === SLOT_STATUS_SCHEDULED;
}

/** @param {string} status */
export function isActiveBookingStatus(status) {
  return ACTIVE_BOOKING_STATUSES.has(String(status || ''));
}

/**
 * @param {Array<{ status?: string }>} bookings
 */
export function countActiveBookings(bookings) {
  return (bookings || []).filter((b) => isActiveBookingStatus(b?.status)).length;
}

/**
 * @param {number | null} maxCapacity
 * @param {number} activeCount
 */
export function hasCapacityForBooking(maxCapacity, activeCount) {
  if (maxCapacity == null) return true;
  return activeCount < maxCapacity;
}

/**
 * Janela de check-in: starts_at - before .. starts_at + after.
 * @param {string | Date} checkedInAt
 * @param {string | Date} slotStartsAt
 * @param {{ checkin_window_before_min?: number, checkin_window_after_min?: number }} [config]
 */
export function isWithinCheckinWindow(checkedInAt, slotStartsAt, config = {}) {
  const checkMs = new Date(checkedInAt).getTime();
  const startMs = new Date(slotStartsAt).getTime();
  if (!Number.isFinite(checkMs) || !Number.isFinite(startMs)) return false;
  const beforeMs = (config.checkin_window_before_min ?? DEFAULT_CHECKIN_WINDOW_BEFORE_MIN) * 60_000;
  const afterMs = (config.checkin_window_after_min ?? DEFAULT_CHECKIN_WINDOW_AFTER_MIN) * 60_000;
  return checkMs >= startMs - beforeMs && checkMs <= startMs + afterMs;
}

/**
 * Intervalo ISO para buscar slots candidatos ao check-in.
 * @param {string | Date} checkedInAt
 * @param {{ checkin_window_before_min?: number, checkin_window_after_min?: number }} [config]
 */
export function slotStartsAtSearchRange(checkedInAt, config = {}) {
  const checkMs = new Date(checkedInAt).getTime();
  const beforeMs = (config.checkin_window_before_min ?? DEFAULT_CHECKIN_WINDOW_BEFORE_MIN) * 60_000;
  const afterMs = (config.checkin_window_after_min ?? DEFAULT_CHECKIN_WINDOW_AFTER_MIN) * 60_000;
  const minStart = new Date(checkMs - afterMs).toISOString();
  const maxStart = new Date(checkMs + beforeMs).toISOString();
  return { minStart, maxStart };
}

/**
 * Monta documento de slot a partir de schedule + class.
 * @param {object} params
 */
export function buildClassSlotDocument({
  academyId,
  schedule,
  classDoc,
  slotDate,
  timeZone,
  generatedAt = new Date().toISOString(),
}) {
  const timeStart = String(schedule.time_start || '').slice(0, 5);
  const timeEnd = String(schedule.time_end || '').slice(0, 5);
  const weekday = String(schedule.weekday || '').trim();
  const maxCapacity = resolveMaxCapacity(schedule, classDoc);

  return {
    academy_id: String(academyId || '').trim(),
    class_id: String(schedule.class_id || classDoc?.id || '').trim(),
    schedule_id: String(schedule.id || schedule.$id || '').trim(),
    slot_date: slotDate,
    weekday,
    time_start: timeStart,
    time_end: timeEnd,
    starts_at: localDateTimeToUtcIso(slotDate, timeStart, timeZone),
    ends_at: localDateTimeToUtcIso(slotDate, timeEnd, timeZone),
    name: String(schedule.name || classDoc?.name || '').trim(),
    modality: String(schedule.modality || classDoc?.modality || '').trim(),
    instructor: String(schedule.instructor || classDoc?.instructor || '').trim(),
    level: String(schedule.level || classDoc?.level || '').trim(),
    max_capacity: maxCapacity,
    booked_count: 0,
    checked_in_count: 0,
    status: SLOT_STATUS_SCHEDULED,
    generated_at: generatedAt,
  };
}

/**
 * @param {number | null | undefined} maxCapacity
 * @param {number} bookedCount
 */
export function formatSlotCapacityLabel(maxCapacity, bookedCount) {
  const booked = Math.max(0, Number(bookedCount) || 0);
  if (maxCapacity == null) return `${booked} / Ilimitado`;
  return `${booked} / ${maxCapacity}`;
}
