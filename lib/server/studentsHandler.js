/**
 * Rotas de alunos (mutações destrutivas e perfil agregado).
 * GET  /api/students/:id/profile
 * POST /api/students/freeze | /api/students/deactivate
 * (legado: /api/leads?route=students&action=...)
 */
import { apiErro, logApiError } from './friendlyError.js';

import { Client, Databases, Query, ID } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { assertRoleOwner } from './authAppwrite.js';
import { addLeadEventServer } from './leadEvents.js';
import { computeDurationDays } from '../../lib/planFreezeCore.js';
import { executeFreezeServer } from './planFreezeExecute.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import {
  assertOrRepairStudentInAcademy,
  findStudentsByPhone,
  inferStudentAcademyId,
  isOrphanStudentDoc,
} from './studentAcademyRepair.js';
import { handleStudentsList } from './studentsListHandler.js';
import {
  ATTENDANCE_ABSENCE_REASONS,
  ATTENDANCE_RETENTION_EVENT_TYPES,
  retentionSnoozeUntilYmd,
  DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS,
} from '../attendanceRetentionCore.js';
import { clearRetentionInContact } from './studentRetentionContact.js';
import { fetchAttendanceRiskForStudent } from './attendanceRetentionServer.js';
import { revokePortalAccessForStudent } from './portalAccess.js';
const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PLAN_FREEZES_COL =
  process.env.VITE_APPWRITE_PLAN_FREEZES_COLLECTION_ID || process.env.PLAN_FREEZES_COLLECTION_ID || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID || process.env.STUDENT_PAYMENTS_COL || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID || process.env.APPWRITE_ATTENDANCE_COL_ID || '';

const DIAS_UTEIS_MES_REF = 26;

function ymFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function fetchAttendanceStatsServer(studentId, academyId) {
  const empty = { thisMonth: 0, lastMonth: 0, total: 0, monthlyRate: '0%' };
  if (!ATTENDANCE_COL) return empty;
  try {
    const res = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
      Query.equal('academy_id', academyId),
      Query.or([Query.equal('student_id', studentId), Query.equal('lead_id', studentId)]),
      Query.limit(500),
    ]);
    const docs = res.documents || [];
    const totalFromApi = typeof res.total === 'number' ? res.total : docs.length;
    const now = new Date();
    const thisYm = ymFromDate(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastYm = ymFromDate(prev);
    let thisMonth = 0;
    let lastMonth = 0;
    for (const row of docs) {
      const raw = row.checked_in_at;
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      const rowYm = ymFromDate(d);
      if (rowYm === thisYm) thisMonth += 1;
      if (rowYm === lastYm) lastMonth += 1;
    }
    return {
      thisMonth,
      lastMonth,
      total: totalFromApi,
      monthlyRate: `${((thisMonth / DIAS_UTEIS_MES_REF) * 100).toFixed(0)}%`,
    };
  } catch {
    return empty;
  }
}

async function fetchPlanFreezesForProfile(studentId, academyId) {
  if (!PLAN_FREEZES_COL) return [];
  const list = await databases.listDocuments(DB_ID, PLAN_FREEZES_COL, [
    Query.equal('lead_id', studentId),
    Query.equal('academy_id', academyId),
    Query.orderDesc('start_date'),
    Query.limit(50),
  ]);
  return list.documents || [];
}

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

async function assertStudentInAcademy(studentId, academyId) {
  return assertOrRepairStudentInAcademy(databases, DB_ID, STUDENTS_COL, studentId, academyId);
}

/**
 * Política ao desligar aluno:
 * - Cancela pagamentos pending/awaiting/scheduled com reference_month >= mês de saída.
 * - Mantém paid/partial (histórico).
 * - Pacote (bundle) covered restante: frozen se keepBundleFrozen, senão cancelled.
 */
async function cancelFuturePendingPayments(leadId, academyId, fromMonthYmd, opts = {}) {
  const keepBundleFrozen = opts.keepBundleFrozen !== false;
  if (!PAYMENTS_COL) return { cancelled: 0, frozen: 0 };
  const fromYm = String(fromMonthYmd || '').trim().slice(0, 7);
  const res = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
    Query.equal('lead_id', leadId),
    Query.equal('academy_id', academyId),
    Query.limit(200),
  ]);
  let cancelled = 0;
  let frozen = 0;
  for (const p of res.documents || []) {
    const st = String(p.status || '').toLowerCase();
    const ref = String(p.reference_month || '').trim();
    if (ref && fromYm && ref < fromYm) continue;

    const cat = String(p.payment_category || 'plan').toLowerCase();
    const isPaidHistory = st === 'paid' || st === 'partial';
    if (isPaidHistory) continue;

    if (cat === 'bundle' && (st === 'covered' || st === 'pending')) {
      if (keepBundleFrozen && st === 'covered') {
        await databases.updateDocument(DB_ID, PAYMENTS_COL, p.$id, { status: 'frozen' });
        frozen += 1;
      } else if (st === 'pending' || st === 'awaiting' || st === 'scheduled') {
        await databases.updateDocument(DB_ID, PAYMENTS_COL, p.$id, { status: 'cancelled' });
        cancelled += 1;
      }
      continue;
    }

    if (st !== 'pending' && st !== 'awaiting' && st !== 'scheduled') continue;
    await databases.updateDocument(DB_ID, PAYMENTS_COL, p.$id, { status: 'cancelled' });
    cancelled += 1;
  }
  return { cancelled, frozen };
}

async function handleProfile(req, res, academyId) {
  const studentId = String(req.query.student_id || '').trim();
  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  try {
    const doc = await assertStudentInAcademy(studentId, academyId);
    const student = mapAppwriteDocToStudent(doc);
    const ym = new Date().toISOString().slice(0, 7);
    const paymentPromise = PAYMENTS_COL
      ? databases.listDocuments(DB_ID, PAYMENTS_COL, [
          Query.equal('lead_id', studentId),
          Query.equal('academy_id', academyId),
          Query.equal('reference_month', ym),
          Query.limit(1),
        ])
      : Promise.resolve(null);
    const [payRes, attendanceStats, planFreezes, attendanceRisk] = await Promise.all([
      paymentPromise,
      fetchAttendanceStatsServer(studentId, academyId),
      fetchPlanFreezesForProfile(studentId, academyId),
      fetchAttendanceRiskForStudent(databases, DB_ID, academyId, studentId, student),
    ]);
    let paymentStatus = null;
    if (PAYMENTS_COL) {
      const p = payRes?.documents?.[0];
      if (p) {
        const dbStatus = String(p.status || 'pending').toLowerCase();
        const key =
          dbStatus === 'covered' || dbStatus === 'frozen' ? 'paid' : dbStatus || 'pending';
        paymentStatus = { key, reference_month: ym };
      } else {
        paymentStatus = { key: 'none', reference_month: ym };
      }
    }
    return json(res, 200, {
      sucesso: true,
      student,
      paymentStatus,
      freezeActive: String(doc.freeze_status || '') === 'active',
      attendanceStats,
      attendanceRisk,
      planFreezes,
    });
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    console.error('[students/profile]', studentId, e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}

async function handleDeactivate(req, res, academyId, me, academyDoc) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { sucesso: false, erro: 'JSON inválido' });
    }
  }

  const studentId = String(body.student_id || body.lead_id || '').trim();
  const exitReason = String(body.exit_reason || body.exitReason || '').trim();
  const exitDate = String(body.exit_date || body.exitDate || '').trim().slice(0, 10);
  const exitNotes = String(body.exit_notes || body.exitNotes || '').trim();
  const cancelFuture = body.cancel_future_payments === true;

  if (!studentId || !exitReason) {
    return json(res, 400, { sucesso: false, erro: 'Dados obrigatórios ausentes' });
  }

  try {
    assertRoleOwner(academyDoc, me.$id);
    await assertStudentInAcademy(studentId, academyId);
    const ymd = exitDate || toYmd(new Date());

    await databases.updateDocument(DB_ID, STUDENTS_COL, studentId, {
      student_status: 'inactive',
      exit_reason: exitReason.slice(0, 256),
      exit_date: ymd,
    });

    let paymentsCancelled = 0;
    let paymentsFrozen = 0;
    if (cancelFuture) {
      const out = await cancelFuturePendingPayments(studentId, academyId, ymd, {
        keepBundleFrozen: body.keep_bundle_frozen !== false,
      });
      paymentsCancelled = out.cancelled;
      paymentsFrozen = out.frozen;
    }

    try {
      await revokePortalAccessForStudent(databases, studentId, 'student_deactivated');
    } catch (revokeErr) {
      console.warn('[students/deactivate] portal revoke:', revokeErr?.message || revokeErr);
    }

    await addLeadEventServer({
      academyId,
      leadId: studentId,
      type: 'student_deactivated',
      text: exitNotes || `Aluno desligado: ${exitReason}`,
      createdBy: me.$id,
      payloadJson: {
        exit_reason: exitReason,
        exit_date: ymd,
        exit_notes: exitNotes,
        cancel_future_payments: cancelFuture,
        payments_cancelled: paymentsCancelled,
        payments_frozen: paymentsFrozen,
      },
    });

    return json(res, 200, {
      sucesso: true,
      payments_cancelled: paymentsCancelled,
      payments_frozen: paymentsFrozen,
    });
  } catch (e) {
    if (e.code === 'FORBIDDEN') {
      return json(res, 403, {
        sucesso: false,
        erro: e.message === 'owner_required' ? 'Apenas o titular da academia pode desligar alunos' : 'Acesso negado',
      });
    }
    console.error('[students/deactivate]', studentId, e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

async function handleFreeze(req, res, academyId, me, academyDoc) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { sucesso: false, erro: 'JSON inválido' });
    }
  }

  const studentId = String(body.student_id || body.lead_id || '').trim();
  const startYmd = String(body.start_ymd || body.startYmd || '').trim().slice(0, 10);
  const endYmd = String(body.end_ymd || body.endYmd || '').trim().slice(0, 10);
  const durationDays = body.duration_days ?? body.durationDays;
  const reason = String(body.reason || '').trim();
  const indefinite = body.indefinite === true;

  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  try {
    assertRoleOwner(academyDoc, me.$id);
    const result = await executeFreezeServer({
      databases,
      dbId: DB_ID,
      studentsCol: STUDENTS_COL,
      planFreezesCol: PLAN_FREEZES_COL,
      academiesCol: ACADEMIES_COL,
      academyId,
      studentId,
      startYmd,
      endYmd,
      durationDays,
      reason,
      indefinite,
      registeredBy: me.$id,
    });
    if (!result.ok) {
      if (result.error === 'plan_freezes_schema_outdated') {
        return json(res, 500, {
          sucesso: false,
          erro: 'Schema plan_freezes desatualizado. Execute npm run provision:plan-freeze e tente novamente.',
        });
      }
      return json(res, 400, { sucesso: false, erro: result.error });
    }
    return json(res, 200, {
      sucesso: true,
      startYmd: result.startYmd,
      endYmd: result.endYmd,
      days: result.days,
      indefinite: result.indefinite,
    });
  } catch (e) {
    if (e.code === 'FORBIDDEN') {
      return json(res, 403, {
        sucesso: false,
        erro: e.message === 'owner_required' ? 'Apenas o titular da academia pode trancar matrículas' : 'Acesso negado',
      });
    }
    console.error('[students/freeze]', studentId, e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

async function handlePlanFreezes(req, res, academyId) {
  const studentId = String(req.query.student_id || req.query.lead_id || '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });
  if (!PLAN_FREEZES_COL) return json(res, 200, { sucesso: true, plan_freezes: [] });

  try {
    await assertStudentInAcademy(studentId, academyId);
    const list = await databases.listDocuments(DB_ID, PLAN_FREEZES_COL, [
      Query.equal('lead_id', studentId),
      Query.equal('academy_id', academyId),
      Query.orderDesc('start_date'),
      Query.limit(limit),
    ]);
    return json(res, 200, { sucesso: true, plan_freezes: list.documents || [] });
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    console.error('[students/plan-freezes]', studentId, e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}

export default async function studentsHandler(req, res) {
  if (!STUDENTS_COL || !DB_ID) {
    return json(res, 503, { sucesso: false, erro: 'Coleção de alunos não configurada' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const action = String(req.query.action || req.query.route || '').trim().toLowerCase();

  if (action === 'profile' && req.method === 'GET') {
    return handleProfile(req, res, academyId);
  }
  if (action === 'plan-freezes' && req.method === 'GET') {
    return handlePlanFreezes(req, res, academyId);
  }
  if (action === 'deactivate' && req.method === 'POST') {
    return handleDeactivate(req, res, academyId, me, academyDoc);
  }
  if (action === 'freeze' && req.method === 'POST') {
    return handleFreeze(req, res, academyId, me, academyDoc);
  }
  if (action === 'collection-snooze' && req.method === 'POST') {
    return handleCollectionSnooze(req, res, academyId);
  }
  if (action === 'retention-action' && req.method === 'POST') {
    return handleAttendanceRetentionAction(req, res, academyId, me);
  }
  if (action === 'find-by-phone' && req.method === 'GET') {
    return handleFindByPhone(req, res, academyId);
  }
  if (action === 'search' && req.method === 'GET') {
    return handleSearchStudents(req, res, academyId);
  }
  if (action === 'list' && req.method === 'GET') {
    return handleStudentsList(req, res, {
      databases,
      dbId: DB_ID,
      studentsCol: STUDENTS_COL,
      academyId,
    });
  }

  return json(res, 404, { sucesso: false, erro: 'Ação inválida' });
}

async function listStudentsForSaleSearch(academyKey, academyId, rawQuery, limit) {
  const q = String(rawQuery || '').trim();
  const digits = q.replace(/\D/g, '');
  const queries = [
    Query.equal(academyKey, academyId),
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
  ];
  if (digits.length >= 4) {
    queries.push(Query.contains('phone', digits));
  } else {
    queries.push(Query.contains('name', q));
  }
  const res = await databases.listDocuments(DB_ID, STUDENTS_COL, queries);
  return res.documents || [];
}

function mapStudentSaleSearchHit(doc) {
  const nome = String(doc?.name || doc?.nome || doc?.$id || '').trim();
  return {
    id: doc.$id,
    nome,
    name: nome,
    phone: String(doc?.phone || doc?.phone_number || '').trim(),
    plan: doc?.plan || '',
    plan_price: doc?.plan_price,
    preferredPaymentMethod: doc?.preferredPaymentMethod || '',
    preferredPaymentAccount: doc?.preferredPaymentAccount || '',
  };
}

async function handleSearchStudents(req, res, academyId) {
  const q = String(req.query.q || req.query.search || '').trim();
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 8), 20);
  if (q.length < 2) {
    return json(res, 400, { sucesso: false, erro: 'Informe ao menos 2 caracteres.' });
  }

  try {
    let docs = [];
    try {
      docs = await listStudentsForSaleSearch('academyId', academyId, q, limit);
    } catch {
      docs = await listStudentsForSaleSearch('academy_id', academyId, q, limit);
    }
    const students = docs.map(mapStudentSaleSearchHit).filter((s) => s.id && s.nome);
    return json(res, 200, { sucesso: true, students });
  } catch (e) {
    console.error('[students/search]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}

async function handleFindByPhone(req, res, academyId) {
  const phone = String(req.query.phone || '').trim();
  if (phone.replace(/\D/g, '').length < 8) {
    return json(res, 400, { sucesso: false, erro: 'Informe um telefone válido.' });
  }

  try {
    const docs = await findStudentsByPhone(databases, DB_ID, STUDENTS_COL, phone, { limit: 15 });
    const matches = [];

    for (const doc of docs) {
      const id = doc.$id;
      const docAcademy = String(doc.academyId || doc.academy_id || '').trim();
      let belongs = docAcademy === String(academyId);
      let repaired = false;

      if (!belongs && isOrphanStudentDoc(doc)) {
        const inferred = await inferStudentAcademyId(databases, DB_ID, id, academyId);
        if (inferred === String(academyId)) {
          await databases.updateDocument(DB_ID, STUDENTS_COL, id, { academyId });
          belongs = true;
          repaired = true;
        }
      }

      if (belongs) {
        matches.push({
          id,
          name: String(doc.name || '').trim(),
          phone: String(doc.phone || doc.phone_number || '').trim(),
          repaired,
          student: mapAppwriteDocToStudent({ ...doc, academyId: academyId }),
        });
      }
    }

    return json(res, 200, { sucesso: true, matches });
  } catch (e) {
    console.error('[students/find-by-phone]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

async function handleCollectionSnooze(req, res, academyId) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { sucesso: false, erro: 'JSON inválido' });
    }
  }
  const studentId = String(body.student_id || '').trim();
  const refMonth = String(body.reference_month || '').trim().slice(0, 7);
  if (!studentId || !refMonth) {
    return json(res, 400, { sucesso: false, erro: 'student_id e reference_month obrigatórios' });
  }
  try {
    await assertStudentInAcademy(studentId, academyId);
    const [y, m] = refMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0);
    const until = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}T23:59:59.000Z`;
    await databases.updateDocument(DB_ID, STUDENTS_COL, studentId, {
      collection_snooze_month: refMonth,
      collection_snooze_until: until,
    });
    return json(res, 200, { sucesso: true, reference_month: refMonth, until });
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

const ABSENCE_REASON_IDS = new Set(ATTENDANCE_ABSENCE_REASONS.map((r) => r.id));

async function handleAttendanceRetentionAction(req, res, academyId, me) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { sucesso: false, erro: 'JSON inválido' });
    }
  }

  const studentId = String(body.student_id || '').trim();
  const actionType = String(body.action || '').trim().toLowerCase();
  if (!studentId || !actionType) {
    return json(res, 400, { sucesso: false, erro: 'student_id e action obrigatórios' });
  }

  const actorId = String(me?.$id || 'user').trim();

  try {
    await assertStudentInAcademy(studentId, academyId);

    if (actionType === 'mark_contact') {
      await databases.updateDocument(DB_ID, STUDENTS_COL, studentId, { retention_in_contact: true });
      await addLeadEventServer({
        academyId,
        leadId: studentId,
        type: ATTENDANCE_RETENTION_EVENT_TYPES.CONTACT_MARKED,
        text: 'Marcado como em contato (retenção por frequência)',
        createdBy: actorId,
        payloadJson: { source: 'attendance_retention' },
      });
      return json(res, 200, { sucesso: true, action: actionType });
    }

    if (actionType === 'absence_reason') {
      const reason = String(body.reason || '').trim().toLowerCase();
      const notes = String(body.notes || '').trim().slice(0, 500);
      if (!ABSENCE_REASON_IDS.has(reason)) {
        return json(res, 400, { sucesso: false, erro: 'Motivo de ausência inválido' });
      }
      const label = ATTENDANCE_ABSENCE_REASONS.find((r) => r.id === reason)?.label || reason;
      const snoozeDays = Math.min(
        90,
        Math.max(1, Number(body.snooze_days) || DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS)
      );
      const snoozedUntil = retentionSnoozeUntilYmd(snoozeDays);
      await databases.updateDocument(DB_ID, STUDENTS_COL, studentId, {
        retention_snoozed_until: snoozedUntil,
      });
      await addLeadEventServer({
        academyId,
        leadId: studentId,
        type: ATTENDANCE_RETENTION_EVENT_TYPES.ABSENCE_REASON,
        text: `Ausência registrada: ${label}${notes ? ` — ${notes}` : ''} (oculto da fila até ${snoozedUntil})`,
        createdBy: actorId,
        payloadJson: {
          source: 'attendance_retention',
          reason,
          notes: notes || null,
          snooze_days: snoozeDays,
          snoozed_until: snoozedUntil,
        },
      });
      return json(res, 200, {
        sucesso: true,
        action: actionType,
        reason,
        snoozed_until: snoozedUntil,
      });
    }

    if (actionType === 'clear_contact') {
      const cleared = await clearRetentionInContact(databases, DB_ID, studentId);
      if (cleared) {
        await addLeadEventServer({
          academyId,
          leadId: studentId,
          type: ATTENDANCE_RETENTION_EVENT_TYPES.CONTACT_CLEARED,
          text: 'Removido de «em contato» — volta à fila de retenção se ainda elegível',
          createdBy: actorId,
          payloadJson: { source: 'attendance_retention' },
        });
      }
      return json(res, 200, { sucesso: true, action: actionType, cleared });
    }

    if (actionType === 'snooze') {
      const snoozeDays = Math.min(
        90,
        Math.max(1, Number(body.snooze_days) || DEFAULT_ATTENDANCE_ABSENCE_SNOOZE_DAYS)
      );
      const snoozedUntil = retentionSnoozeUntilYmd(snoozeDays);
      await databases.updateDocument(DB_ID, STUDENTS_COL, studentId, {
        retention_snoozed_until: snoozedUntil,
      });
      await addLeadEventServer({
        academyId,
        leadId: studentId,
        type: ATTENDANCE_RETENTION_EVENT_TYPES.SNOOZE,
        text: `Oculto da fila por ${snoozeDays} dia(s) até ${snoozedUntil}`,
        createdBy: actorId,
        payloadJson: {
          source: 'attendance_retention',
          snooze_days: snoozeDays,
          snoozed_until: snoozedUntil,
        },
      });
      return json(res, 200, {
        sucesso: true,
        action: actionType,
        snoozed_until: snoozedUntil,
      });
    }

    return json(res, 400, { sucesso: false, erro: 'Ação inválida' });
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}
