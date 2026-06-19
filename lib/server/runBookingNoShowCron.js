/**
 * Cron — marca bookings como no_show após fim da aula + tolerância.
 */
import { Query } from 'node-appwrite';
import {
  BOOKING_STATUS_BOOKED,
  BOOKING_STATUS_NO_SHOW,
  SLOT_STATUS_COMPLETED,
  SLOT_STATUS_SCHEDULED,
} from '../bookingCore.js';

const CLASS_SLOTS_COL =
  process.env.VITE_APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  process.env.APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  'class_slots';
const BOOKINGS_COL =
  process.env.VITE_APPWRITE_BOOKINGS_COLLECTION_ID ||
  process.env.APPWRITE_BOOKINGS_COLLECTION_ID ||
  'bookings';

const PAGE = 100;

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {string} nowIso
 */
async function markNoShowsForAcademy(databases, dbId, academyId, nowIso) {
  if (!CLASS_SLOTS_COL || !BOOKINGS_COL) {
    return { marked: 0, errors: 0 };
  }

  let marked = 0;
  let errors = 0;
  let cursor = null;

  for (;;) {
    const q = [
      Query.equal('academy_id', academyId),
      Query.equal('status', SLOT_STATUS_SCHEDULED),
      Query.lessThanEqual('ends_at', nowIso),
      Query.limit(PAGE),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));

    const slots = await databases.listDocuments(dbId, CLASS_SLOTS_COL, q);
    for (const slot of slots.documents || []) {
      try {
        const bookings = await databases.listDocuments(dbId, BOOKINGS_COL, [
          Query.equal('slot_id', slot.$id),
          Query.equal('status', BOOKING_STATUS_BOOKED),
          Query.limit(200),
        ]);
        for (const booking of bookings.documents || []) {
          await databases.updateDocument(dbId, BOOKINGS_COL, booking.$id, {
            status: BOOKING_STATUS_NO_SHOW,
            no_show_at: nowIso,
          });
          marked += 1;
        }
        await databases.updateDocument(dbId, CLASS_SLOTS_COL, slot.$id, {
          status: SLOT_STATUS_COMPLETED,
        });
      } catch (e) {
        errors += 1;
        console.warn('[bookingNoShow]', academyId, slot.$id, e?.message || e);
      }
    }

    if (!slots.documents || slots.documents.length < PAGE) break;
    cursor = slots.documents[slots.documents.length - 1].$id;
  }

  return { marked, errors };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 */
export async function runBookingNoShowCron(databases, dbId) {
  const ACADEMIES_COL =
    process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
  if (!ACADEMIES_COL) return { marked: 0, errors: 0, academies: 0 };

  const nowIso = new Date().toISOString();
  let marked = 0;
  let errors = 0;
  let academies = 0;
  let cursor = null;

  for (;;) {
    const q = [Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, ACADEMIES_COL, q);
    for (const academy of res.documents || []) {
      academies += 1;
      const out = await markNoShowsForAcademy(databases, dbId, academy.$id, nowIso);
      marked += out.marked;
      errors += out.errors;
    }
    if (!res.documents || res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }

  return { academies, marked, errors };
}
