/**
 * Match de check-in (catraca/manual) com booking/slot ativo.
 */
import { Query } from 'node-appwrite';
import {
  BOOKING_STATUS_BOOKED,
  BOOKING_STATUS_CHECKED_IN,
  isWithinCheckinWindow,
  parseBookingSettings,
  slotStartsAtSearchRange,
} from '../bookingCore.js';
import { parseAcademySettings } from '../controlidSettings.js';

const CLASS_SLOTS_COL =
  process.env.VITE_APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  process.env.APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  'class_slots';
const BOOKINGS_COL =
  process.env.VITE_APPWRITE_BOOKINGS_COLLECTION_ID ||
  process.env.APPWRITE_BOOKINGS_COLLECTION_ID ||
  'bookings';

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {{ academyId: string, studentId: string, checkedInAtIso: string, academySettings?: unknown, matchType?: string }} params
 */
export async function matchBookingForCheckin(databases, dbId, params) {
  if (!CLASS_SLOTS_COL || !BOOKINGS_COL) return null;

  const academyId = String(params.academyId || '').trim();
  const studentId = String(params.studentId || '').trim();
  const checkedInAtIso = String(params.checkedInAtIso || '').trim();
  if (!academyId || !studentId || !checkedInAtIso) return null;

  const bookingConfig = parseBookingSettings(parseAcademySettings(params.academySettings));
  const { minStart, maxStart } = slotStartsAtSearchRange(checkedInAtIso, bookingConfig);

  const slotsRes = await databases.listDocuments(dbId, CLASS_SLOTS_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('status', 'scheduled'),
    Query.greaterThanEqual('starts_at', minStart),
    Query.lessThanEqual('starts_at', maxStart),
    Query.orderAsc('starts_at'),
    Query.limit(10),
  ]);

  for (const slot of slotsRes.documents || []) {
    if (!isWithinCheckinWindow(checkedInAtIso, slot.starts_at, bookingConfig)) continue;

    const bookingRes = await databases.listDocuments(dbId, BOOKINGS_COL, [
      Query.equal('slot_id', slot.$id),
      Query.equal('student_id', studentId),
      Query.equal('status', BOOKING_STATUS_BOOKED),
      Query.limit(1),
    ]);
    const booking = bookingRes.documents?.[0];
    if (!booking) continue;

    return { slot, booking };
  }

  return null;
}

/**
 * Atualiza booking, slot e attendance após match.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {{ attendanceId: string, academyId: string, slot: object, booking: object, checkedInAtIso: string, matchType?: string, deviceLogId?: string }} params
 */
export async function applyBookingCheckinMatch(databases, dbId, params) {
  const ATTENDANCE_COL =
    process.env.APPWRITE_ATTENDANCE_COLLECTION_ID ||
    process.env.VITE_APPWRITE_ATTENDANCE_COL_ID ||
    process.env.VITE_APPWRITE_ATTENDANCE_COLLECTION_ID ||
    '';

  const { slot, booking } = params;
  const checkedInAtIso = params.checkedInAtIso || new Date().toISOString();
  const matchType = String(params.matchType || 'catraca').slice(0, 20);

  const bookingPatch = {
    status: BOOKING_STATUS_CHECKED_IN,
    checked_in_at: checkedInAtIso,
    checked_in_source: matchType,
    attendance_id: params.attendanceId || booking.attendance_id || '',
    device_log_id: params.deviceLogId || booking.device_log_id || '',
  };

  await databases.updateDocument(dbId, BOOKINGS_COL, booking.$id, bookingPatch);

  const bookedCount = Math.max(0, (Number(slot.booked_count) || 0) - 1);
  const checkedInCount = (Number(slot.checked_in_count) || 0) + 1;
  await databases.updateDocument(dbId, CLASS_SLOTS_COL, slot.$id, {
    booked_count: bookedCount,
    checked_in_count: checkedInCount,
  });

  if (ATTENDANCE_COL && params.attendanceId) {
    await databases.updateDocument(dbId, ATTENDANCE_COL, params.attendanceId, {
      booking_id: booking.$id,
      slot_id: slot.$id,
      schedule_id: String(slot.schedule_id || booking.schedule_id || ''),
      match_type: matchType,
    });
  }

  return { bookingId: booking.$id, slotId: slot.$id };
}
