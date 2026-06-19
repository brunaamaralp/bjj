/**
 * Gera instâncias de aula (`class_slots`) a partir de horários ativos (`schedules`).
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { mapScheduleDoc } from '../../src/lib/schedules.js';
import { mapClassDoc } from '../../src/lib/classes.js';
import {
  buildClassSlotDocument,
  DEFAULT_SLOT_HORIZON_DAYS,
  DEFAULT_TIMEZONE,
  parseBookingSettings,
} from '../bookingCore.js';
import { dateRangeYmd, todayYmdInTz, weekdayCodeInTz } from '../bookingDateTime.js';
import { parseAcademySettings } from '../controlidSettings.js';

function schedulesColId() {
  return String(
    process.env.VITE_APPWRITE_SCHEDULES_COLLECTION_ID ||
      process.env.APPWRITE_SCHEDULES_COLLECTION_ID ||
      'schedules'
  ).trim();
}

function classSlotsColId() {
  return String(
    process.env.VITE_APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
      process.env.APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
      'class_slots'
  ).trim();
}

function classesColId() {
  return String(
    process.env.VITE_APPWRITE_CLASSES_COLLECTION_ID ||
      process.env.APPWRITE_CLASSES_COLLECTION_ID ||
      'classes'
  ).trim();
}

function defaultPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 */
async function listActiveSchedules(databases, dbId, academyId) {
  const col = schedulesColId();
  if (!col) return [];
  const res = await databases.listDocuments(dbId, col, [
    Query.equal('academy_id', academyId),
    Query.equal('is_active', true),
    Query.limit(500),
  ]);
  return (res.documents || []).map(mapScheduleDoc).filter(Boolean);
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 */
async function loadClassesMap(databases, dbId, academyId) {
  const col = classesColId();
  /** @type {Map<string, object>} */
  const map = new Map();
  if (!col) return map;
  const res = await databases.listDocuments(dbId, col, [
    Query.equal('academy_id', academyId),
    Query.limit(500),
  ]);
  for (const doc of res.documents || []) {
    const mapped = mapClassDoc(doc);
    if (mapped?.id) map.set(mapped.id, mapped);
  }
  return map;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} scheduleId
 * @param {string} slotDate
 */
async function slotExists(databases, dbId, scheduleId, slotDate) {
  const col = classSlotsColId();
  if (!col) return false;
  const res = await databases.listDocuments(dbId, col, [
    Query.equal('schedule_id', scheduleId),
    Query.equal('slot_date', slotDate),
    Query.limit(1),
  ]);
  return (res.total ?? 0) > 0;
}

/**
 * Gera slots para uma academia.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {{ horizonDays?: number, timezone?: string, todayYmd?: string, dryRun?: boolean }} [opts]
 */
export async function generateSlotsForAcademy(databases, dbId, academyId, opts = {}) {
  const slotsCol = classSlotsColId();
  const aid = String(academyId || '').trim();
  if (!slotsCol || !aid) {
    return { academyId: aid, created: 0, skipped: 0, errors: 0, reason: 'misconfigured' };
  }

  const settings = parseBookingSettings(parseAcademySettings(opts.academySettings));
  if (settings.enabled === false) {
    return { academyId: aid, created: 0, skipped: 0, errors: 0, reason: 'booking_disabled' };
  }

  const timeZone = opts.timezone || settings.timezone || DEFAULT_TIMEZONE;
  const horizonDays = opts.horizonDays ?? settings.slot_horizon_days ?? DEFAULT_SLOT_HORIZON_DAYS;
  const today = opts.todayYmd || todayYmdInTz(timeZone);
  const dates = dateRangeYmd(today, horizonDays, timeZone);

  const [schedules, classesMap] = await Promise.all([
    listActiveSchedules(databases, dbId, aid),
    loadClassesMap(databases, dbId, aid),
  ]);

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const generatedAt = new Date().toISOString();

  for (const schedule of schedules) {
    const classDoc = classesMap.get(schedule.class_id) || null;
    if (classDoc && classDoc.is_active === false) {
      skipped += dates.length;
      continue;
    }

    for (const slotDate of dates) {
      const weekday = weekdayCodeInTz(slotDate, timeZone);
      if (!schedule.days_of_week.includes(weekday)) {
        skipped += 1;
        continue;
      }

      try {
        const exists = await slotExists(databases, dbId, schedule.id, slotDate);
        if (exists) {
          skipped += 1;
          continue;
        }

        const payload = buildClassSlotDocument({
          academyId: aid,
          schedule: { ...schedule, weekday },
          classDoc,
          slotDate,
          timeZone,
          generatedAt,
        });

        if (opts.dryRun) {
          created += 1;
          continue;
        }

        await databases.createDocument(dbId, slotsCol, ID.unique(), payload, defaultPerms());
        created += 1;
      } catch (e) {
        errors += 1;
        console.warn('[classSlotGenerator]', aid, schedule.id, slotDate, e?.message || e);
      }
    }
  }

  return { academyId: aid, created, skipped, errors, horizonDays, timezone: timeZone };
}

/**
 * Planeja slots sem gravar (para testes).
 * @param {object[]} schedules
 * @param {Map<string, object>} classesMap
 * @param {string[]} dates
 * @param {string} academyId
 * @param {string} timeZone
 */
export function planSlotsForSchedules(schedules, classesMap, dates, academyId, timeZone) {
  /** @type {object[]} */
  const planned = [];
  for (const schedule of schedules) {
    if (!schedule.is_active) continue;
    const classDoc = classesMap.get(schedule.class_id) || null;
    if (classDoc && classDoc.is_active === false) continue;
    for (const slotDate of dates) {
      const weekday = weekdayCodeInTz(slotDate, timeZone);
      if (!schedule.days_of_week.includes(weekday)) continue;
      planned.push(
        buildClassSlotDocument({
          academyId,
          schedule: { ...schedule, weekday },
          classDoc,
          slotDate,
          timeZone,
        })
      );
    }
  }
  return planned;
}
