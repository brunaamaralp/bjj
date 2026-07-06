/**
 * Agendamento público de experimental: cria ou reagenda lead + booking opcional.
 */
import { ID, Query } from 'node-appwrite';
import {
  buildAcademyDocumentPermissions,
  AcademyPermissionError,
} from './academyDocumentPermissions.js';
import { DB_ID } from './academyAccess.js';
import { addLeadEventServer } from './leadEvents.js';
import { buildCanonicalLeadPayload } from '../../src/lib/leadDocumentFields.js';
import { normalizeEnrollmentPhone } from '../../src/lib/publicEnrollmentSettings.js';
import { PUBLIC_EXPERIMENTAL_ORIGIN } from '../../src/lib/publicExperimentalSettings.js';
import {
  filterSlotsForProfileType,
  inferProfileTypeFromBirthDate,
} from '../../src/lib/publicExperimentalAudience.js';
import { buildSchedulePatch } from '../../src/lib/scheduleHelpers.js';
import { LEAD_STATUS } from '../../src/lib/leadStatus.js';
import { normalizeScheduleTime } from '../../src/lib/schedules.js';
import { namesMatchForDedup } from '../../src/lib/studentPhoneDedup.js';
import { normalizeStudentStatus } from '../../src/lib/studentStatus.js';
import {
  BOOKING_SOURCE_PUBLIC,
  BOOKING_STATUS_BOOKED,
  BOOKING_STATUS_CANCELLED,
  countActiveBookings,
  formatSlotCapacityLabel,
  hasCapacityForBooking,
  isActiveBookingStatus,
  isSlotBookable,
  parseBookingSettings,
  resolveMaxCapacity,
} from '../bookingCore.js';
import { generateSlotsForAcademy } from './classSlotGenerator.js';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const CLASS_SLOTS_COL =
  process.env.VITE_APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  process.env.APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  'class_slots';
const BOOKINGS_COL =
  process.env.VITE_APPWRITE_BOOKINGS_COLLECTION_ID ||
  process.env.APPWRITE_BOOKINGS_COLLECTION_ID ||
  'bookings';

const BIRTH_DATE_YMD = /^\d{4}-\d{2}-\d{2}$/;

function phoneQueryVariants(phone) {
  const p = normalizeEnrollmentPhone(phone);
  if (!p) return [];
  const set = new Set([p]);
  if (p.length >= 10) set.add(`55${p}`);
  return [...set];
}

async function findDocByPhone(databases, collectionId, academyId, phone, { name = '' } = {}) {
  if (!collectionId) return null;
  const compareName = String(name || '').trim();
  for (const variant of phoneQueryVariants(phone)) {
    try {
      const res = await databases.listDocuments(DB_ID, collectionId, [
        Query.equal('academyId', [academyId]),
        Query.equal('phone', [variant]),
        Query.limit(8),
      ]);
      for (const doc of res.documents || []) {
        if (normalizeEnrollmentPhone(doc.phone) !== normalizeEnrollmentPhone(phone)) continue;
        if (compareName.length >= 2 && !namesMatchForDedup(doc.name, compareName)) continue;
        return doc;
      }
    } catch {
      void 0;
    }
  }
  return null;
}

function mapSlotForPublic(doc) {
  if (!doc) return null;
  const maxCapacity =
    doc.max_capacity == null || doc.max_capacity === ''
      ? null
      : Math.max(1, Number(doc.max_capacity) || 0) || null;
  const bookedCount = Number(doc.booked_count ?? 0) || 0;
  return {
    id: doc.$id,
    slot_date: doc.slot_date,
    time_start: doc.time_start,
    time_end: doc.time_end,
    name: doc.name,
    modality: doc.modality,
    level: doc.level,
    instructor: doc.instructor,
    max_capacity: maxCapacity,
    booked_count: bookedCount,
    capacity_label: formatSlotCapacityLabel(maxCapacity, bookedCount),
    has_capacity: hasCapacityForBooking(maxCapacity, bookedCount),
    starts_at: doc.starts_at,
  };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {{ profileType?: string, audienceRules?: Record<string, string[]>, academySettings?: unknown }} opts
 */
export async function listPublicExperimentalSlots(databases, academyId, opts = {}) {
  const profileType = String(opts.profileType || 'Adulto').trim() || 'Adulto';
  const audienceRules = opts.audienceRules || {};

  const bookingCfg = parseBookingSettings(opts.academySettings);
  const horizon = bookingCfg.slot_horizon_days || 14;
  const tz = bookingCfg.timezone || 'America/Sao_Paulo';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const end = new Date();
  end.setDate(end.getDate() + horizon);
  const toDate = end.toLocaleDateString('en-CA', { timeZone: tz });

  const slotQuery = () =>
    databases.listDocuments(DB_ID, CLASS_SLOTS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('status', 'scheduled'),
      Query.greaterThanEqual('slot_date', today),
      Query.lessThanEqual('slot_date', toDate),
      Query.orderAsc('starts_at'),
      Query.limit(200),
    ]);

  let docs = [];
  try {
    const list = await slotQuery();
    docs = list.documents || [];
  } catch {
    docs = [];
  }

  if (docs.length === 0) {
    try {
      await generateSlotsForAcademy(databases, DB_ID, academyId, { lookaheadDays: horizon });
      const list = await slotQuery();
      docs = list.documents || [];
    } catch {
      docs = [];
    }
  }

  const mapped = docs.map(mapSlotForPublic).filter(Boolean);
  const filtered = filterSlotsForProfileType(mapped, profileType, audienceRules);
  return filtered.filter((s) => s.has_capacity);
}

export function validatePublicExperimentalForm(form) {
  const name = String(form?.name || '').trim();
  const phone = normalizeEnrollmentPhone(form?.phone);
  const birthDate = String(form?.birthDate || '').trim().slice(0, 10);
  const parentName = String(form?.parentName || '').trim();

  if (!name || name.length < 2) {
    return { ok: false, code: 'name_required' };
  }
  if (!phone || phone.length < 10) {
    return { ok: false, code: 'phone_invalid' };
  }
  if (!BIRTH_DATE_YMD.test(birthDate)) {
    return { ok: false, code: 'birth_date_required', message: 'Informe a data de nascimento.' };
  }

  const profileType = inferProfileTypeFromBirthDate(birthDate);
  if (!profileType) {
    return { ok: false, code: 'birth_date_invalid', message: 'Data de nascimento inválida.' };
  }
  if ((profileType === 'Criança' || profileType === 'Juniores') && parentName.length < 2) {
    return {
      ok: false,
      code: 'parent_required',
      message: 'Informe o nome do responsável.',
    };
  }

  return { ok: true, name, phone, birthDate, parentName, profileType };
}

async function loadSlotForBooking(databases, academyId, slotId) {
  const slot = await databases.getDocument(DB_ID, CLASS_SLOTS_COL, slotId);
  if (String(slot.academy_id) !== academyId) {
    const err = new Error('slot_forbidden');
    err.code = 'slot_forbidden';
    throw err;
  }
  if (!isSlotBookable(slot.status)) {
    const err = new Error('slot_unavailable');
    err.code = 'slot_unavailable';
    throw err;
  }

  const allBookings = await databases.listDocuments(DB_ID, BOOKINGS_COL, [
    Query.equal('slot_id', slotId),
    Query.limit(200),
  ]);
  const activeCount = countActiveBookings(allBookings.documents || []);
  const maxCapacity = resolveMaxCapacity(slot, null) ?? slot.max_capacity ?? null;
  if (!hasCapacityForBooking(maxCapacity, activeCount)) {
    const err = new Error('slot_full');
    err.code = 'slot_full';
    err.capacity = formatSlotCapacityLabel(maxCapacity, activeCount);
    throw err;
  }

  return { slot, activeCount, maxCapacity };
}

async function cancelActiveBookingsForLead(databases, academyId, leadId) {
  if (!BOOKINGS_COL || !leadId) return;
  try {
    const res = await databases.listDocuments(DB_ID, BOOKINGS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('student_id', leadId),
      Query.limit(50),
    ]);
    const now = new Date().toISOString();
    for (const booking of res.documents || []) {
      if (!isActiveBookingStatus(booking.status)) continue;
      await databases.updateDocument(DB_ID, BOOKINGS_COL, booking.$id, {
        status: BOOKING_STATUS_CANCELLED,
        cancelled_at: now,
        cancel_reason: 'Reagendamento via link público',
        cancelled_by: 'public',
      });
      if (booking.status === BOOKING_STATUS_BOOKED && booking.slot_id) {
        try {
          const slot = await databases.getDocument(DB_ID, CLASS_SLOTS_COL, booking.slot_id);
          const newCount = Math.max(0, (Number(slot.booked_count) || 0) - 1);
          await databases.updateDocument(DB_ID, CLASS_SLOTS_COL, booking.slot_id, {
            booked_count: newCount,
          });
        } catch {
          void 0;
        }
      }
    }
  } catch {
    void 0;
  }
}

async function createBookingForLead(databases, academyId, academyDoc, leadId, leadName, slotRow) {
  const { slot } = slotRow;
  const now = new Date().toISOString();
  const perms = buildAcademyDocumentPermissions(academyDoc, { requireTeam: false });
  const bookingDoc = {
    academy_id: academyId,
    slot_id: slot.$id,
    class_id: String(slot.class_id || ''),
    schedule_id: String(slot.schedule_id || ''),
    student_id: leadId,
    student_name: leadName,
    status: BOOKING_STATUS_BOOKED,
    booked_at: now,
    booked_by: 'public',
    booked_by_name: 'Link público',
    source: BOOKING_SOURCE_PUBLIC,
  };

  const created = await databases.createDocument(
    DB_ID,
    BOOKINGS_COL,
    ID.unique(),
    bookingDoc,
    perms.length ? perms : undefined
  );

  const newBookedCount = (Number(slot.booked_count) || 0) + 1;
  await databases.updateDocument(DB_ID, CLASS_SLOTS_COL, slot.$id, {
    booked_count: newBookedCount,
  });

  return {
    booking: created,
    scheduledDate: String(slot.slot_date || '').slice(0, 10),
    scheduledTime: normalizeScheduleTime(slot.time_start),
  };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} academyDoc
 * @param {string} academyId
 * @param {object} form
 * @param {{ audienceRules?: Record<string, string[]> }} formConfig
 */
export async function bookPublicExperimental(databases, academyDoc, academyId, form, formConfig = {}) {
  const validation = validatePublicExperimentalForm(form);
  if (!validation.ok) {
    const err = new Error(validation.code);
    err.code = validation.code;
    err.message = validation.message;
    throw err;
  }

  const { name, phone, birthDate, parentName, profileType } = validation;
  const slotId = String(form?.slot_id || '').trim();

  const existingStudent = await findDocByPhone(databases, STUDENTS_COL, academyId, phone, { name });
  if (existingStudent?.$id) {
    const st = normalizeStudentStatus(existingStudent);
    if (st !== 'inactive') {
      const err = new Error('student_already_exists');
      err.code = 'student_already_exists';
      throw err;
    }
  }

  const lead = await findDocByPhone(databases, LEADS_COL, academyId, phone, { name });

  if (lead?.status === LEAD_STATUS.CONVERTED) {
    const err = new Error('lead_converted');
    err.code = 'lead_converted';
    throw err;
  }

  let slotRow = null;
  if (slotId) {
    slotRow = await loadSlotForBooking(databases, academyId, slotId);
  }

  let perms;
  try {
    perms = buildAcademyDocumentPermissions(academyDoc);
  } catch (e) {
    if (e instanceof AcademyPermissionError) {
      const err = new Error('academy_permissions');
      err.code = 'academy_permissions';
      throw err;
    }
    throw e;
  }

  const scheduledDate = slotRow ? String(slotRow.slot.slot_date || '').slice(0, 10) : '';
  const scheduledTime = slotRow ? normalizeScheduleTime(slotRow.slot.time_start) : '';

  const baseExtra = {
    type: profileType,
    birthDate,
    ...(parentName ? { parentName } : {}),
  };

  let leadId;
  let rescheduled = false;

  if (lead?.$id) {
    rescheduled = true;
    leadId = lead.$id;
    await cancelActiveBookingsForLead(databases, academyId, leadId);

    const schedulePatch = buildSchedulePatch(lead, {
      date: scheduledDate || String(lead.scheduledDate || '').trim(),
      time: scheduledTime || String(lead.scheduledTime || '').trim(),
    });

    await databases.updateDocument(DB_ID, LEADS_COL, leadId, {
      name,
      ...baseExtra,
      ...schedulePatch,
      ...(scheduledDate ? { scheduledDate } : {}),
      ...(scheduledTime ? { scheduledTime } : {}),
    });
  } else {
    const data = buildCanonicalLeadPayload({
      academyId,
      phone,
      name,
      status: scheduledDate ? LEAD_STATUS.SCHEDULED : LEAD_STATUS.NEW,
      origin: PUBLIC_EXPERIMENTAL_ORIGIN,
      pipelineStage: scheduledDate ? 'Aula experimental' : 'Novo',
      extra: {
        ...baseExtra,
        scheduledDate,
        scheduledTime,
        contact_type: 'lead',
        inbound_auto: true,
        created_by: 'public-experimental',
      },
    });
    const created = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), data, perms);
    leadId = created.$id;
  }

  let bookingResult = null;
  if (slotRow) {
    bookingResult = await createBookingForLead(
      databases,
      academyId,
      academyDoc,
      leadId,
      name,
      slotRow
    );
    const patch = buildSchedulePatch(lead || {}, {
      date: bookingResult.scheduledDate,
      time: bookingResult.scheduledTime,
    });
    await databases.updateDocument(DB_ID, LEADS_COL, leadId, patch);
  }

  const finalDate = bookingResult?.scheduledDate || scheduledDate;
  const finalTime = bookingResult?.scheduledTime || scheduledTime;

  const eventText = rescheduled
    ? `Experimental reagendada para ${finalDate || '—'}${finalTime ? ` às ${finalTime}` : ''} (link público).`
    : `Experimental agendada para ${finalDate || '—'}${finalTime ? ` às ${finalTime}` : ''} (link público).`;

  await addLeadEventServer({
    academyId,
    leadId,
    type: 'experimental_agendada_online',
    text: eventText,
    createdBy: 'public',
    payloadJson: {
      slot_id: slotId || null,
      booking_id: bookingResult?.booking?.$id || null,
      rescheduled,
      profile_type: profileType,
    },
  });

  return {
    leadId,
    rescheduled,
    scheduledDate: finalDate,
    scheduledTime: finalTime,
    profileType,
  };
}
