/**
 * API de agendamento — slots e bookings.
 * GET  ?route=bookings&action=list-slots
 * GET  ?route=bookings&action=list-bookings
 * GET  ?route=bookings&action=lesson-staff-report
 * POST ?route=bookings&action=create
 * POST ?route=bookings&action=cancel
 * POST ?route=bookings&action=checkin
 * POST ?route=bookings&action=confirm-lesson
 */
import { apiErro } from './friendlyError.js';
import { Client, Databases, Query, ID } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { buildAcademyDocumentPermissions } from './academyDocumentPermissions.js';
import { addLeadEventServer } from './leadEvents.js';
import {
  BOOKING_SOURCE_RECEPTION,
  BOOKING_STATUS_BOOKED,
  BOOKING_STATUS_CANCELLED,
  BOOKING_STATUS_CHECKED_IN,
  countActiveBookings,
  formatSlotCapacityLabel,
  hasCapacityForBooking,
  isActiveBookingStatus,
  isSlotBookable,
  MATCH_TYPE_MANUAL,
  resolveMaxCapacity,
} from '../bookingCore.js';
import { applyBookingCheckinMatch } from './bookingAttendanceMatch.js';
import { buildManualAttendanceDocument } from '../attendanceDocument.js';
import {
  buildLessonStaffReportPayload,
  confirmLessonStaff,
  fetchLessonStaffReportSlots,
} from './lessonStaffRegisterServer.js';
import { normalizeLessonStatus } from '../lessonStaffRegister.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const CLASS_SLOTS_COL =
  process.env.VITE_APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  process.env.APPWRITE_CLASS_SLOTS_COLLECTION_ID ||
  'class_slots';
const BOOKINGS_COL =
  process.env.VITE_APPWRITE_BOOKINGS_COLLECTION_ID ||
  process.env.APPWRITE_BOOKINGS_COLLECTION_ID ||
  'bookings';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.APPWRITE_ATTENDANCE_COLLECTION_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COLLECTION_ID ||
  '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function mapSlotDoc(doc) {
  if (!doc) return null;
  const maxCapacity =
    doc.max_capacity == null || doc.max_capacity === ''
      ? null
      : Math.max(1, Number(doc.max_capacity) || 0) || null;
  const bookedCount = Number(doc.booked_count ?? 0) || 0;
  return {
    id: doc.$id,
    academy_id: doc.academy_id,
    class_id: doc.class_id,
    schedule_id: doc.schedule_id,
    slot_date: doc.slot_date,
    weekday: doc.weekday,
    time_start: doc.time_start,
    time_end: doc.time_end,
    starts_at: doc.starts_at,
    ends_at: doc.ends_at,
    name: doc.name,
    modality: doc.modality,
    instructor: doc.instructor,
    level: doc.level,
    max_capacity: maxCapacity,
    booked_count: bookedCount,
    checked_in_count: Number(doc.checked_in_count ?? 0) || 0,
    status: doc.status,
    capacity_label: formatSlotCapacityLabel(maxCapacity, bookedCount),
    lesson_status: normalizeLessonStatus(doc.lesson_status),
    professor_user_id: String(doc.professor_user_id || '').trim(),
    professor_name: String(doc.professor_name || '').trim(),
    instructor_user_id: String(doc.instructor_user_id || '').trim(),
    instructor_name: String(doc.instructor_name || '').trim(),
    lesson_cancel_reason: String(doc.lesson_cancel_reason || '').trim(),
    lesson_recorded_by: String(doc.lesson_recorded_by || '').trim(),
    lesson_recorded_by_name: String(doc.lesson_recorded_by_name || '').trim(),
    lesson_recorded_at: doc.lesson_recorded_at || '',
  };
}

function mapBookingDoc(doc) {
  if (!doc) return null;
  return {
    id: doc.$id,
    academy_id: doc.academy_id,
    slot_id: doc.slot_id,
    class_id: doc.class_id,
    schedule_id: doc.schedule_id,
    student_id: doc.student_id,
    student_name: doc.student_name || '',
    status: doc.status,
    booked_at: doc.booked_at,
    booked_by: doc.booked_by || '',
    booked_by_name: doc.booked_by_name || '',
    source: doc.source,
    checked_in_at: doc.checked_in_at || '',
    cancelled_at: doc.cancelled_at || '',
    cancel_reason: doc.cancel_reason || '',
    waitlist_position: doc.waitlist_position ?? null,
  };
}

async function loadStudent(academyId, studentId) {
  const cols = [STUDENTS_COL, LEADS_COL].filter(Boolean);
  for (const col of cols) {
    try {
      const doc = await databases.getDocument(DB_ID, col, studentId);
      const docAcademy = String(doc.academyId || doc.academy_id || '').trim();
      if (docAcademy && docAcademy !== academyId) return null;
      return doc;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function listBookingsForSlot(slotId) {
  const res = await databases.listDocuments(DB_ID, BOOKINGS_COL, [
    Query.equal('slot_id', slotId),
    Query.limit(200),
  ]);
  return res.documents || [];
}

async function handleListSlots(req, res, academyId) {
  const q = req.query || {};
  const slotDate = String(q.date || q.slot_date || '').trim();
  const fromIso = String(q.from || '').trim();
  const toIso = String(q.to || '').trim();
  const status = String(q.status || 'scheduled').trim();

  try {
    const filters = [
      Query.equal('academy_id', academyId),
      Query.orderAsc('starts_at'),
      Query.limit(Math.min(200, Math.max(1, Number(q.limit) || 100))),
    ];
    if (slotDate) filters.push(Query.equal('slot_date', slotDate));
    if (status) filters.push(Query.equal('status', status));
    if (fromIso) filters.push(Query.greaterThanEqual('starts_at', fromIso));
    if (toIso) filters.push(Query.lessThanEqual('starts_at', toIso));

    let list = await databases.listDocuments(DB_ID, CLASS_SLOTS_COL, filters);
    let slots = (list.documents || []).map(mapSlotDoc).filter(Boolean);

    // Lazy generation se estiver vazio para hoje
    if (slots.length === 0 && slotDate) {
      const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      // Se estiver buscando a data de hoje ou amanhã, e vier vazio, tenta gerar
      if (slotDate === todayIso || slotDate === new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })) {
        const { generateSlotsForAcademy } = await import('./classSlotGenerator.js');
        await generateSlotsForAcademy(databases, DB_ID, academyId, { lookaheadDays: 7 });
        
        // Refetch after generation
        list = await databases.listDocuments(DB_ID, CLASS_SLOTS_COL, filters);
        slots = (list.documents || []).map(mapSlotDoc).filter(Boolean);
      }
    }

    return json(res, 200, { sucesso: true, slots, total: list.total ?? slots.length });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}

async function handleListBookings(req, res, academyId) {
  const slotId = String(req.query?.slot_id || '').trim();
  if (!slotId) return json(res, 400, { sucesso: false, erro: 'slot_id obrigatório' });

  try {
    const slot = await databases.getDocument(DB_ID, CLASS_SLOTS_COL, slotId);
    if (String(slot.academy_id) !== academyId) {
      return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    }
    const docs = await listBookingsForSlot(slotId);
    const bookings = docs
      .map(mapBookingDoc)
      .filter((b) => b && b.status !== BOOKING_STATUS_CANCELLED);
    return json(res, 200, { sucesso: true, bookings, total: bookings.length });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}

async function handleCreateBooking(req, res, academyId, me, academyDoc) {
  const slotId = String(req.body?.slot_id || '').trim();
  const studentId = String(req.body?.student_id || '').trim();
  if (!slotId || !studentId) {
    return json(res, 400, { sucesso: false, erro: 'slot_id e student_id são obrigatórios' });
  }

  try {
    const slot = await databases.getDocument(DB_ID, CLASS_SLOTS_COL, slotId);
    if (String(slot.academy_id) !== academyId) {
      return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    }
    if (!isSlotBookable(slot.status)) {
      return json(res, 409, { sucesso: false, erro: 'Aula indisponível para reserva' });
    }

    const student = await loadStudent(academyId, studentId);
    if (!student) return json(res, 404, { sucesso: false, erro: 'Aluno não encontrado' });

    const existing = await databases.listDocuments(DB_ID, BOOKINGS_COL, [
      Query.equal('slot_id', slotId),
      Query.equal('student_id', studentId),
      Query.limit(20),
    ]);
    const duplicate = (existing.documents || []).find((b) => isActiveBookingStatus(b.status));
    if (duplicate) {
      return json(res, 409, { sucesso: false, erro: 'Aluno já inscrito nesta aula' });
    }

    const allBookings = await listBookingsForSlot(slotId);
    const activeCount = countActiveBookings(allBookings);
    const maxCapacity = resolveMaxCapacity(slot, null) ?? slot.max_capacity ?? null;
    if (!hasCapacityForBooking(maxCapacity, activeCount)) {
      return json(res, 409, {
        sucesso: false,
        erro: 'Aula lotada',
        capacity: formatSlotCapacityLabel(maxCapacity, activeCount),
      });
    }

    const now = new Date().toISOString();
    const studentName = String(student.name || '').trim();
    const perms = buildAcademyDocumentPermissions(academyDoc, { requireTeam: false });
    const bookingDoc = {
      academy_id: academyId,
      slot_id: slotId,
      class_id: String(slot.class_id || ''),
      schedule_id: String(slot.schedule_id || ''),
      student_id: studentId,
      student_name: studentName,
      status: BOOKING_STATUS_BOOKED,
      booked_at: now,
      booked_by: String(me?.$id || me?.id || ''),
      booked_by_name: String(me?.name || me?.email || 'Staff').slice(0, 100),
      source: BOOKING_SOURCE_RECEPTION,
    };

    const created = await databases.createDocument(
      DB_ID,
      BOOKINGS_COL,
      ID.unique(),
      bookingDoc,
      perms.length ? perms : undefined
    );

    const newBookedCount = (Number(slot.booked_count) || 0) + 1;
    await databases.updateDocument(DB_ID, CLASS_SLOTS_COL, slotId, {
      booked_count: newBookedCount,
    });

    void addLeadEventServer({
      academyId,
      leadId: studentId,
      type: 'booking_created',
      text: `Inscrito na aula ${slot.name} (${slot.slot_date} ${slot.time_start})`,
      createdBy: me?.$id || 'staff',
      payloadJson: { slot_id: slotId, booking_id: created.$id },
    });

    return json(res, 200, {
      sucesso: true,
      booking: mapBookingDoc(created),
      slot: mapSlotDoc({ ...slot, booked_count: newBookedCount }),
    });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

async function handleCancelBooking(req, res, academyId, me) {
  const bookingId = String(req.body?.booking_id || '').trim();
  const reason = String(req.body?.reason || req.body?.cancel_reason || '').trim().slice(0, 256);
  if (!bookingId) return json(res, 400, { sucesso: false, erro: 'booking_id obrigatório' });

  try {
    const booking = await databases.getDocument(DB_ID, BOOKINGS_COL, bookingId);
    if (String(booking.academy_id) !== academyId) {
      return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    }
    if (booking.status === BOOKING_STATUS_CANCELLED) {
      return json(res, 200, { sucesso: true, booking: mapBookingDoc(booking), already: true });
    }
    if (booking.status === BOOKING_STATUS_CHECKED_IN) {
      return json(res, 409, { sucesso: false, erro: 'Não é possível cancelar após check-in' });
    }

    const now = new Date().toISOString();
    const updated = await databases.updateDocument(DB_ID, BOOKINGS_COL, bookingId, {
      status: BOOKING_STATUS_CANCELLED,
      cancelled_at: now,
      cancel_reason: reason,
      cancelled_by: String(me?.$id || me?.id || ''),
    });

    if (booking.status === BOOKING_STATUS_BOOKED) {
      try {
        const slot = await databases.getDocument(DB_ID, CLASS_SLOTS_COL, booking.slot_id);
        const newCount = Math.max(0, (Number(slot.booked_count) || 0) - 1);
        await databases.updateDocument(DB_ID, CLASS_SLOTS_COL, booking.slot_id, {
          booked_count: newCount,
        });
      } catch {
        /* ignore */
      }
    }

    void addLeadEventServer({
      academyId,
      leadId: booking.student_id,
      type: 'booking_cancelled',
      text: reason || 'Inscrição cancelada na aula',
      createdBy: me?.$id || 'staff',
      payloadJson: { booking_id: bookingId, slot_id: booking.slot_id },
    });

    return json(res, 200, { sucesso: true, booking: mapBookingDoc(updated) });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

async function handleCheckinBooking(req, res, academyId, me, academyDoc) {
  const bookingId = String(req.body?.booking_id || '').trim();
  if (!bookingId) return json(res, 400, { sucesso: false, erro: 'booking_id obrigatório' });

  try {
    const booking = await databases.getDocument(DB_ID, BOOKINGS_COL, bookingId);
    if (String(booking.academy_id) !== academyId) {
      return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    }
    if (booking.status === BOOKING_STATUS_CHECKED_IN) {
      return json(res, 200, { sucesso: true, booking: mapBookingDoc(booking), already: true });
    }
    if (booking.status !== BOOKING_STATUS_BOOKED) {
      return json(res, 409, { sucesso: false, erro: 'Reserva não está ativa para check-in' });
    }

    const slot = await databases.getDocument(DB_ID, CLASS_SLOTS_COL, booking.slot_id);
    const checkedInAtIso = new Date().toISOString();
    let attendanceId = '';

    if (ATTENDANCE_COL) {
      const perms = buildAcademyDocumentPermissions(academyDoc, { requireTeam: false });
      const attDoc = buildManualAttendanceDocument({
        academy_id: academyId,
        student_id: booking.student_id,
        checked_in_by: me?.$id || 'staff',
        checked_in_by_name: me?.name || me?.email || 'Recepção',
      });
      const att = await databases.createDocument(
        DB_ID,
        ATTENDANCE_COL,
        ID.unique(),
        attDoc,
        perms.length ? perms : undefined
      );
      attendanceId = att.$id;
    }

    await applyBookingCheckinMatch(databases, DB_ID, {
      attendanceId,
      academyId,
      slot,
      booking,
      checkedInAtIso,
      matchType: MATCH_TYPE_MANUAL,
    });

    const refreshed = await databases.getDocument(DB_ID, BOOKINGS_COL, bookingId);
    return json(res, 200, { sucesso: true, booking: mapBookingDoc(refreshed), attendance_id: attendanceId });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

function resolveBookingAction(req) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  const action = String(req.query?.action || '').trim().toLowerCase();
  if (route === 'class-slot-list') return 'list-slots';
  if (route === 'booking-create') return 'create';
  if (route === 'booking-cancel') return 'cancel';
  if (route === 'booking-checkin') return 'checkin';
  if (route === 'confirm-lesson') return 'confirm-lesson';
  if (route === 'lesson-staff-report') return 'lesson-staff-report';
  return action || 'list-slots';
}

async function handleConfirmLesson(req, res, academyId, me, academyDoc) {
  const body = req.body || {};
  try {
    const updated = await confirmLessonStaff(databases, DB_ID, {
      academyId,
      academyDoc,
      slotId: body.slot_id || body.slotId,
      scheduleId: body.schedule_id || body.scheduleId,
      date: body.date || body.slot_date,
      body,
      me,
    });
    return json(res, 200, { sucesso: true, slot: mapSlotDoc(updated) });
  } catch (e) {
    const code = e?.code || '';
    if (code === 'validation') {
      return json(res, 400, { sucesso: false, erro: e.message });
    }
    if (
      code === 'slot_params_required' ||
      code === 'schedule_not_on_date' ||
      code === 'schedule_inactive' ||
      code === 'schedule_wrong_academy' ||
      code === 'slot_wrong_academy'
    ) {
      return json(res, 400, { sucesso: false, erro: apiErro(e, 'confirm_lesson') });
    }
    if (e?.code === 404 || String(e?.type || '').includes('document')) {
      return json(res, 404, { sucesso: false, erro: 'Aula ou horário não encontrado' });
    }
    console.error('[bookingsHandler] confirm-lesson', e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'confirm_lesson') });
  }
}

async function handleLessonStaffReport(req, res, academyId, academyDoc) {
  const q = req.query || {};
  const from = String(q.from || '').trim();
  const to = String(q.to || '').trim();
  const userId = String(q.user_id || q.userId || '').trim();
  const format = String(q.format || 'json').trim().toLowerCase();
  if (!from || !to) {
    return json(res, 400, { sucesso: false, erro: 'Informe from e to (YYYY-MM-DD)' });
  }
  try {
    const docs = await fetchLessonStaffReportSlots(databases, DB_ID, academyId, { from, to, userId });
    const report = buildLessonStaffReportPayload(docs, { userId });
    if (format === 'pdf') {
      const { renderLessonStaffReportPdfBuffer } = await import(
        '../receipts/renderLessonStaffReportPdf.js'
      );
      const pdf = await renderLessonStaffReportPdfBuffer({
        from,
        to,
        academyName: academyDoc?.name || academyDoc?.nome || '',
        ...report,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="aulas-staff-${from}_${to}.pdf"`
      );
      return res.status(200).send(Buffer.from(pdf));
    }
    return json(res, 200, { sucesso: true, from, to, ...report });
  } catch (e) {
    console.error('[bookingsHandler] lesson-staff-report', e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'lesson_staff_report') });
  }
}

export default async function bookingsHandler(req, res) {
  if (!CLASS_SLOTS_COL || !BOOKINGS_COL || !DB_ID) {
    return json(res, 503, { sucesso: false, erro: 'Agendamento não configurado' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const action = resolveBookingAction(req);

  if (action === 'list-slots' && req.method === 'GET') {
    return handleListSlots(req, res, academyId);
  }
  if (action === 'list-bookings' && req.method === 'GET') {
    return handleListBookings(req, res, academyId);
  }
  if (action === 'lesson-staff-report' && req.method === 'GET') {
    return handleLessonStaffReport(req, res, academyId, academyDoc);
  }
  if (action === 'create' && req.method === 'POST') {
    return handleCreateBooking(req, res, academyId, me, academyDoc);
  }
  if (action === 'cancel' && req.method === 'POST') {
    return handleCancelBooking(req, res, academyId, me);
  }
  if (action === 'checkin' && req.method === 'POST') {
    return handleCheckinBooking(req, res, academyId, me, academyDoc);
  }
  if (action === 'confirm-lesson' && req.method === 'POST') {
    return handleConfirmLesson(req, res, academyId, me, academyDoc);
  }

  return json(res, 405, { sucesso: false, erro: 'Método ou ação não suportado' });
}
