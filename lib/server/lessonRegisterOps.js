/**
 * Get-or-create de class_slot + upsert de registro de aula.
 * Usado por bookingsHandler (route=bookings).
 */
import { ID, Query, Permission, Role } from 'node-appwrite';
import { buildClassSlotDocument, DEFAULT_TIMEZONE } from '../bookingCore.js';
import { weekdayCodeInTz } from '../bookingDateTime.js';
import { buildLessonRegisterPatch, hasLessonRegister } from '../../src/lib/lessonRegister.js';
import { mapScheduleDoc } from '../../src/lib/schedules.js';
import { mapClassDoc } from '../../src/lib/classes.js';

function schedulesColId() {
  return String(
    process.env.VITE_APPWRITE_SCHEDULES_COLLECTION_ID ||
      process.env.APPWRITE_SCHEDULES_COLLECTION_ID ||
      'schedules'
  ).trim();
}

function classesColId() {
  return String(
    process.env.VITE_APPWRITE_CLASSES_COLLECTION_ID ||
      process.env.APPWRITE_CLASSES_COLLECTION_ID ||
      'classes'
  ).trim();
}

function defaultSlotPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];
}

/**
 * @param {object} doc
 */
export function mapSlotLessonFields(doc) {
  if (!doc) return {};
  return {
    instructor_id: String(doc.instructor_id || '').trim(),
    lesson_notes: String(doc.lesson_notes || '').trim(),
    lesson_recorded_by: String(doc.lesson_recorded_by || '').trim(),
    lesson_recorded_by_name: String(doc.lesson_recorded_by_name || '').trim(),
    lesson_recorded_at: String(doc.lesson_recorded_at || '').trim(),
    has_lesson_register: hasLessonRegister(doc),
  };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} slotsCol
 * @param {string} academyId
 * @param {string} scheduleId
 * @param {string} slotDate
 * @param {{ timeZone?: string, academyDoc?: object }} [opts]
 */
export async function getOrCreateClassSlot(
  databases,
  dbId,
  slotsCol,
  academyId,
  scheduleId,
  slotDate,
  opts = {}
) {
  const sid = String(scheduleId || '').trim();
  const date = String(slotDate || '').trim();
  const aid = String(academyId || '').trim();
  if (!sid || !date || !aid || !slotsCol) {
    const err = new Error('schedule_id_and_date_required');
    err.code = 'bad_request';
    throw err;
  }

  const existing = await databases.listDocuments(dbId, slotsCol, [
    Query.equal('schedule_id', sid),
    Query.equal('slot_date', date),
    Query.limit(1),
  ]);
  if ((existing.documents || []).length) {
    const doc = existing.documents[0];
    if (String(doc.academy_id) !== aid) {
      const err = new Error('access_denied');
      err.code = 'forbidden';
      throw err;
    }
    return { slot: doc, created: false };
  }

  const schedCol = schedulesColId();
  if (!schedCol) {
    const err = new Error('schedules_not_configured');
    err.code = 'misconfigured';
    throw err;
  }

  let scheduleRaw;
  try {
    scheduleRaw = await databases.getDocument(dbId, schedCol, sid);
  } catch {
    const err = new Error('schedule_not_found');
    err.code = 'not_found';
    throw err;
  }
  const schedule = mapScheduleDoc(scheduleRaw);
  if (!schedule || String(schedule.academy_id) !== aid) {
    const err = new Error('schedule_not_found');
    err.code = 'not_found';
    throw err;
  }

  const timeZone = opts.timeZone || DEFAULT_TIMEZONE;
  const weekday = weekdayCodeInTz(date, timeZone);
  if (!schedule.days_of_week.includes(weekday)) {
    const err = new Error('schedule_not_on_date');
    err.code = 'bad_request';
    throw err;
  }

  let classDoc = null;
  const classCol = classesColId();
  if (classCol && schedule.class_id) {
    try {
      classDoc = mapClassDoc(await databases.getDocument(dbId, classCol, schedule.class_id));
    } catch {
      classDoc = null;
    }
  }

  const payload = buildClassSlotDocument({
    academyId: aid,
    schedule: { ...schedule, weekday },
    classDoc,
    slotDate: date,
    timeZone,
  });

  const created = await databases.createDocument(
    dbId,
    slotsCol,
    ID.unique(),
    payload,
    defaultSlotPerms()
  );
  return { slot: created, created: true };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} slotsCol
 * @param {string} academyId
 * @param {object} body
 * @param {object} me
 * @param {{ timeZone?: string }} [opts]
 */
export async function upsertLessonRegister(databases, dbId, slotsCol, academyId, body, me, opts = {}) {
  const scheduleId = String(body?.schedule_id || '').trim();
  const slotDate = String(body?.slot_date || body?.date || '').trim();
  const instructorId = String(body?.instructor_id || '').trim();
  const instructorName = String(body?.instructor_name || body?.instructor || '').trim();
  const notes = body?.lesson_notes != null ? body.lesson_notes : body?.notes;

  if (!instructorId) {
    const err = new Error('instructor_required');
    err.code = 'bad_request';
    throw err;
  }

  const { slot } = await getOrCreateClassSlot(
    databases,
    dbId,
    slotsCol,
    academyId,
    scheduleId,
    slotDate,
    opts
  );

  const patch = buildLessonRegisterPatch({
    instructorId,
    instructorName,
    notes,
    recordedBy: me?.$id || me?.id || '',
    recordedByName: me?.name || me?.email || 'Recepção',
    recordedAt: new Date().toISOString(),
  });

  const updated = await databases.updateDocument(dbId, slotsCol, slot.$id, patch);
  return { slot: updated, created: false };
}
