/**
 * Rotas de alunos (mutações destrutivas e perfil agregado).
 * GET  /api/students/:id/profile
 * POST /api/students/freeze | /api/students/deactivate
 * (legado: /api/leads?route=students&action=...)
 */
import { Client, Databases, Query, ID } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import { assertRoleOwner } from './authAppwrite.js';
import { addLeadEventServer } from './leadEvents.js';
import {
  validateFreezeRequest,
  effectiveFreezeDaysUsed,
  planYearStartYmd,
  toYmd,
  FREEZE_STATUS_ACTIVE,
  computeDurationDays,
} from '../../lib/planFreezeCore.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { readControlIdConfig, resolveControlIdUserId } from '../controlidSettings.js';
import { configWithPlainPassword, destroyUser } from './controlidService.js';

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

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function freezeIsoFromYmd(ymd) {
  return `${String(ymd).slice(0, 10)}T12:00:00.000Z`;
}

async function assertStudentInAcademy(studentId, academyId) {
  const doc = await databases.getDocument(DB_ID, STUDENTS_COL, studentId);
  if (String(doc.academyId || '') !== String(academyId)) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return doc;
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
    let paymentStatus = null;
    if (PAYMENTS_COL) {
      const ym = new Date().toISOString().slice(0, 7);
      const payRes = await databases.listDocuments(DB_ID, PAYMENTS_COL, [
        Query.equal('lead_id', studentId),
        Query.equal('academy_id', academyId),
        Query.equal('reference_month', ym),
        Query.limit(1),
      ]);
      const p = payRes.documents?.[0];
      if (p) {
        paymentStatus = { key: String(p.status || 'pending'), reference_month: ym };
      } else {
        paymentStatus = { key: 'none', reference_month: ym };
      }
    }
    return json(res, 200, {
      sucesso: true,
      student,
      paymentStatus,
      freezeActive: String(doc.freeze_status || '') === 'active',
    });
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
    console.error('[students/profile]', studentId, e?.message || e);
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao carregar perfil' });
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
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao desligar aluno' });
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

  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  try {
    assertRoleOwner(academyDoc, me.$id);
    const doc = await assertStudentInAcademy(studentId, academyId);
    const student = mapAppwriteDocToStudent(doc);

    const validation = validateFreezeRequest({
      startYmd,
      endYmd,
      durationDays,
      student,
    });
    if (!validation.ok) {
      return json(res, 400, { sucesso: false, erro: validation.error });
    }

    const { days, startYmd: sYmd, endYmd: eYmd } = validation;
    const enroll = String(student.enrollmentDate || '').trim().slice(0, 10);
    const quotaYear = enroll ? planYearStartYmd(enroll) : toYmd(new Date()).slice(0, 10);
    let daysUsedBase = effectiveFreezeDaysUsed(student);
    if (String(student.freeze_quota_year || '') !== quotaYear) daysUsedBase = 0;
    const newDaysUsed = daysUsedBase + days;

    await databases.updateDocument(DB_ID, STUDENTS_COL, studentId, {
      freeze_start: freezeIsoFromYmd(sYmd),
      freeze_end: freezeIsoFromYmd(eYmd),
      freeze_status: FREEZE_STATUS_ACTIVE,
      freeze_days_used: newDaysUsed,
      freeze_quota_year: quotaYear,
    });

    if (PLAN_FREEZES_COL) {
      await databases.createDocument(DB_ID, PLAN_FREEZES_COL, ID.unique(), {
        lead_id: studentId,
        academy_id: academyId,
        start_date: freezeIsoFromYmd(sYmd),
        end_date: freezeIsoFromYmd(eYmd),
        days,
        reason: reason.slice(0, 256),
        registered_by: String(me.$id || '').slice(0, 64),
        created_at: new Date().toISOString(),
      });
    }

    await addLeadEventServer({
      academyId,
      leadId: studentId,
      type: 'student_freeze_started',
      text: reason || `Trancamento ${sYmd} — ${eYmd} (${days} dias)`,
      createdBy: me.$id,
      payloadJson: { start: sYmd, end: eYmd, days, reason },
    });

    // Revogar acesso na catraca se freeze começa hoje ou no passado
    const todayYmd = toYmd(new Date()).slice(0, 10);
    if (sYmd <= todayYmd && doc.controlid_synced === true && ACADEMIES_COL) {
      void (async () => {
        try {
          const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
          const controlIdCfg = readControlIdConfig(academyDoc?.settings);
          if (controlIdCfg.enabled) {
            const cfg = configWithPlainPassword(academyDoc);
            if (cfg.configured) {
              const userId = resolveControlIdUserId(doc);
              if (userId) {
                await destroyUser(cfg, userId);
                await databases.updateDocument(DB_ID, STUDENTS_COL, studentId, {
                  controlid_synced: false,
                  controlid_sync_error: null,
                });
              }
            }
          }
        } catch (e) {
          console.warn('[freeze] controlid revoke:', e?.message);
        }
      })();
    }

    return json(res, 200, {
      sucesso: true,
      startYmd: sYmd,
      endYmd: eYmd,
      days,
      freeze_days_used: newDaysUsed,
    });
  } catch (e) {
    if (e.code === 'FORBIDDEN') {
      return json(res, 403, {
        sucesso: false,
        erro: e.message === 'owner_required' ? 'Apenas o titular da academia pode trancar matrículas' : 'Acesso negado',
      });
    }
    console.error('[students/freeze]', studentId, e?.message || e);
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao trancar plano' });
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
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar trancamentos' });
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
    return handleCollectionSnooze(req, res, academyId, me);
  }

  return json(res, 404, { sucesso: false, erro: 'Ação inválida' });
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
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao adiar régua' });
  }
}
