/**
 * Server — garantir class_slot + gravar confirmação de staff.
 */
import { ID, Permission, Query, Role } from 'node-appwrite';
import { mapScheduleDoc } from '../../src/lib/schedules.js';
import { mapClassDoc } from '../../src/lib/classes.js';
import {
  buildClassSlotDocument,
  DEFAULT_TIMEZONE,
  parseBookingSettings,
} from '../bookingCore.js';
import { weekdayCodeInTz } from '../bookingDateTime.js';
import { parseAcademySettings } from '../controlidSettings.js';
import {
  buildLessonStaffPatch,
  validateLessonStaffConfirmInput,
  aggregateLessonStaffTotals,
  normalizeLessonStatus,
  LESSON_STATUS_CANCELLED,
  LESSON_STATUS_CONFIRMED,
} from '../lessonStaffRegister.js';

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
 * @param {string} scheduleId
 * @param {string} slotDate YMD
 * @param {object} [academyDoc]
 */
export async function ensureClassSlotForDate(
  databases,
  dbId,
  academyId,
  scheduleId,
  slotDate,
  academyDoc = null
) {
  const slotsCol = classSlotsColId();
  const aid = String(academyId || '').trim();
  const sid = String(scheduleId || '').trim();
  const date = String(slotDate || '').trim();
  if (!slotsCol || !aid || !sid || !date) {
    const err = new Error('slot_params_required');
    err.code = 'slot_params_required';
    throw err;
  }

  const existing = await databases.listDocuments(dbId, slotsCol, [
    Query.equal('academy_id', aid),
    Query.equal('schedule_id', sid),
    Query.equal('slot_date', date),
    Query.limit(1),
  ]);
  if (existing.documents?.[0]) return existing.documents[0];

  const scheduleDoc = await databases.getDocument(dbId, schedulesColId(), sid);
  const scheduleAcademy = String(scheduleDoc.academy_id || '').trim();
  if (scheduleAcademy && scheduleAcademy !== aid) {
    const err = new Error('schedule_wrong_academy');
    err.code = 'schedule_wrong_academy';
    throw err;
  }
  const schedule = mapScheduleDoc(scheduleDoc);
  if (!schedule?.is_active) {
    const err = new Error('schedule_inactive');
    err.code = 'schedule_inactive';
    throw err;
  }

  let classDoc = null;
  if (schedule.class_id && classesColId()) {
    try {
      classDoc = mapClassDoc(await databases.getDocument(dbId, classesColId(), schedule.class_id));
    } catch {
      classDoc = null;
    }
  }

  const settings = parseBookingSettings(parseAcademySettings(academyDoc?.settings));
  const timeZone = settings.timezone || DEFAULT_TIMEZONE;
  const weekday = weekdayCodeInTz(date, timeZone);
  if (!schedule.days_of_week.includes(weekday)) {
    const err = new Error('schedule_not_on_date');
    err.code = 'schedule_not_on_date';
    throw err;
  }

  const payload = buildClassSlotDocument({
    academyId: aid,
    schedule: { ...schedule, weekday },
    classDoc,
    slotDate: date,
    timeZone,
  });

  return databases.createDocument(dbId, slotsCol, ID.unique(), payload, defaultPerms());
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {object} params
 */
export async function confirmLessonStaff(databases, dbId, params) {
  const {
    academyId,
    academyDoc,
    slotId,
    scheduleId,
    date,
    body,
    me,
  } = params;

  const validation = validateLessonStaffConfirmInput(body || {});
  if (!validation.ok) {
    const err = new Error(validation.error);
    err.code = 'validation';
    throw err;
  }

  let slotDoc = null;
  const existingSlotId = String(slotId || '').trim();
  if (existingSlotId) {
    slotDoc = await databases.getDocument(dbId, classSlotsColId(), existingSlotId);
    if (String(slotDoc.academy_id || '').trim() !== String(academyId || '').trim()) {
      const err = new Error('slot_wrong_academy');
      err.code = 'slot_wrong_academy';
      throw err;
    }
  } else {
    slotDoc = await ensureClassSlotForDate(
      databases,
      dbId,
      academyId,
      scheduleId,
      date,
      academyDoc
    );
  }

  const patch = buildLessonStaffPatch({
    ...(body || {}),
    recorded_by: String(me?.$id || me?.id || '').trim(),
    recorded_by_name: String(me?.name || me?.email || '').trim(),
    recorded_at: new Date().toISOString(),
  });

  const updated = await databases.updateDocument(dbId, classSlotsColId(), slotDoc.$id, patch);
  return updated;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {{ from: string, to: string, userId?: string }} range
 */
export async function fetchLessonStaffReportSlots(databases, dbId, academyId, range) {
  const slotsCol = classSlotsColId();
  const from = String(range.from || '').trim();
  const to = String(range.to || '').trim();
  const aid = String(academyId || '').trim();
  if (!slotsCol || !aid || !from || !to) return [];

  /** @type {object[]} */
  const all = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const res = await databases.listDocuments(dbId, slotsCol, [
      Query.equal('academy_id', aid),
      Query.greaterThanEqual('slot_date', from),
      Query.lessThanEqual('slot_date', to),
      Query.limit(limit),
      Query.offset(offset),
      Query.orderAsc('slot_date'),
    ]);
    const docs = res.documents || [];
    all.push(...docs);
    if (docs.length < limit) break;
    offset += limit;
    if (offset > 5000) break;
  }

  const withStatus = all.filter((d) => {
    const st = normalizeLessonStatus(d.lesson_status);
    return st === LESSON_STATUS_CONFIRMED || st === LESSON_STATUS_CANCELLED;
  });

  return withStatus;
}

export function buildLessonStaffReportPayload(slotDocs, { userId } = {}) {
  const slots = (slotDocs || []).map((doc) => ({
    id: doc.$id || doc.id,
    slot_date: doc.slot_date,
    time_start: doc.time_start,
    time_end: doc.time_end,
    name: doc.name,
    modality: doc.modality,
    lesson_status: doc.lesson_status,
    professor_user_id: doc.professor_user_id || '',
    professor_name: doc.professor_name || '',
    instructor_user_id: doc.instructor_user_id || '',
    instructor_name: doc.instructor_name || '',
    lesson_cancel_reason: doc.lesson_cancel_reason || '',
  }));

  const agg = aggregateLessonStaffTotals(slots, { userId });
  const totals = [...agg.byUser.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'pt-BR')
  );

  const filter = String(userId || '').trim();
  const cancelledRows = slots.filter((s) => {
    if (normalizeLessonStatus(s.lesson_status) !== LESSON_STATUS_CANCELLED) return false;
    if (!filter) return true;
    return (
      String(s.professor_user_id) === filter || String(s.instructor_user_id) === filter
    );
  });

  const exportRows = [...agg.detail, ...cancelledRows].sort((a, b) =>
    String(a.slot_date).localeCompare(String(b.slot_date)) ||
    String(a.time_start || '').localeCompare(String(b.time_start || ''))
  );

  return {
    confirmed_count: agg.confirmedCount,
    cancelled_count: filter ? cancelledRows.length : agg.cancelledCount,
    totals,
    detail: exportRows,
  };
}
