import { Client, Databases, Query, ID } from 'node-appwrite';
import {
  buildAcademyDocumentPermissions,
  AcademyPermissionError,
} from '../lib/server/academyDocumentPermissions.js';
import { buildCanonicalLeadPayload } from '../src/lib/leadDocumentFields.js';
import { sendZapsterText } from '../lib/server/zapsterSend.js';
import {
  BIRTHDAY_CRON_DEFAULT_TEXT,
  applyWhatsappTemplatePlaceholders,
  isBirthdayCronEnabled,
  parseWhatsappTemplatesField,
} from '../lib/whatsappTemplateDefaults.js';
import { parseAutomationsConfig } from '../lib/automationCore.js';
import { recordWhatsappTemplateSent } from '../lib/server/whatsappTemplateSent.js';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { listAcademyStudentDocs } from '../lib/server/listAcademyStudents.js';
import { assertBillingActive, sendBillingGateError } from '../lib/server/billingGate.js';
import { addLeadEventServer } from '../lib/server/leadEvents.js';
import { buildLeadFieldsFromClassification } from '../lib/agentClassificationFields.js';
import inventoryHandler from '../lib/server/inventoryHandler.js';
import productsHandler from '../lib/server/productsHandler.js';
import aiProductImportHandler from '../lib/server/aiProductImportHandler.js';
import salesHistoryHandler from '../lib/server/salesHistoryHandler.js';
import salesCreateHandler from '../lib/server/salesCreateHandler.js';
import salesReconcileHandler from '../lib/server/salesReconcileHandler.js';
import salesLiquidateHandler from '../lib/server/salesLiquidateHandler.js';
import cashShiftHandler from '../lib/server/cashShiftHandler.js';
import salesByStudentHandler from '../lib/server/salesByStudentHandler.js';
import studentsHandler from '../lib/server/studentsHandler.js';
import { buildControlIdAttendanceDocument } from '../lib/attendanceDocument.js';
import publicEnrollmentHandler from '../lib/server/publicEnrollmentHandler.js';
import {
  controlidStatusHandler,
  controlidTestHandler,
  controlidSaveConfigHandler,
  controlidSyncHandler,
  controlidRevokeHandler,
  controlidReleaseHandler,
  controlidMonitorHandler,
  controlidTestImageHandler,
  controlidSyncAllHandler,
} from '../lib/server/controlidHandlers.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const PEOPLE_COL = STUDENTS_COL || LEADS_COL;
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.APPWRITE_ATTENDANCE_COLLECTION_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COLLECTION_ID ||
  '';
const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

const STATUS_MATRICULADO = 'Matriculado';

function json(res, status, obj) {
  res.status(status).json(obj);
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function todayYmdSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

function extractBirthYmdFromLeadDoc(doc) {
  const top = String(doc?.birth_date || doc?.birthDate || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(top)) return top;
  try {
    const parsed = doc?.notes ? JSON.parse(doc.notes) : null;
    const b = parsed && typeof parsed === 'object' ? String(parsed.birthDate || '').trim().slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : '';
  } catch {
    return '';
  }
}

function birthYmdMatchesToday(birthYmd, monthStr, dayStr) {
  if (!birthYmd || birthYmd.length < 10) return false;
  const mm = birthYmd.slice(5, 7);
  const dd = birthYmd.slice(8, 10);
  return mm === monthStr && dd === dayStr;
}

function zapsterInstanceFromAcademy(doc) {
  return String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
}

function resolveBirthdayMessageTemplate(academy, templateKey = 'birthday') {
  const key = String(templateKey || 'birthday').trim() || 'birthday';
  const { templates } = parseWhatsappTemplatesField(academy?.whatsappTemplates);
  const fromTemplates = String(templates?.[key] || '').trim();
  const fromAcademy = key === 'birthday' ? String(academy?.birthdayMessage || '').trim() : '';
  return fromTemplates || fromAcademy || BIRTHDAY_CRON_DEFAULT_TEXT;
}

async function listAllAcademyIds() {
  const out = [];
  let cursor = null;
  for (;;) {
    const q = [Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, ACADEMIES_COL, q);
    for (const d of res.documents || []) {
      if (d?.$id) out.push(d);
    }
    if (!res.documents || res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return out;
}

function cronAuthOk(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const auth = String(req.headers?.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const header = String(req.headers['x-cron-secret'] || '').trim();
  const q = String(req.query?.secret || '').trim();
  return bearer === expected || header === expected || q === expected;
}

async function runBirthdayCron() {
  const monthDay = todayYmdSaoPaulo();
  const monthStr = monthDay.slice(5, 7);
  const dayStr = monthDay.slice(8, 10);

  const academies = await listAllAcademyIds();
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const details = [];

  for (const academy of academies) {
    if (!isBirthdayCronEnabled(academy)) continue;

    const inst = zapsterInstanceFromAcademy(academy);
    if (!inst) {
      skipped += 1;
      continue;
    }

    const academyName = String(academy?.name || '').trim();
    const birthdayCfg = parseAutomationsConfig(academy.automations_config).birthday || {};
    const templateKey = String(birthdayCfg.templateKey || 'birthday').trim() || 'birthday';
    const templateRaw = resolveBirthdayMessageTemplate(academy, templateKey);

    let leads;
    try {
      leads = await listAcademyStudentDocs(academy.$id);
    } catch (e) {
      errors += 1;
      details.push({ academyId: academy.$id, erro: e?.message || 'list_leads' });
      continue;
    }

    for (const doc of leads) {
      if (!STUDENTS_COL && String(doc?.status || '').trim() !== STATUS_MATRICULADO) continue;

      const birthYmd = extractBirthYmdFromLeadDoc(doc);
      if (!birthYmdMatchesToday(birthYmd, monthStr, dayStr)) continue;

      const lastSent = String(doc?.last_birthday_sent || '').trim().slice(0, 10);
      if (lastSent === monthDay) continue;

      const phone = normalizePhone(doc.phone);
      if (!phone) continue;

      const firstName = String(doc.name || '')
        .trim()
        .split(/\s+/)[0] || 'aluno';
      const message = applyWhatsappTemplatePlaceholders(templateRaw, {
        lead: {
          name: doc.name,
          scheduledDate: doc.scheduledDate,
          scheduledTime: doc.scheduledTime
        },
        academyName
      });

      const z = await sendZapsterText({
        recipient: phone,
        text: message,
        instanceId: inst,
        proactive: true,
        academyId: academy.$id,
        leadId: doc.$id,
        leadDoc: doc,
      });
      if (!z?.ok) {
        if (z?.skipped === 'no_recent_interaction') {
          skipped += 1;
          details.push({ leadId: doc.$id, phone, skipped: 'no_recent_interaction' });
          continue;
        }
        errors += 1;
        details.push({ leadId: doc.$id, phone, erro: z?.erro || 'zapster' });
        continue;
      }

      sent += 1;
      try {
        await recordWhatsappTemplateSent({
          academyId: academy.$id,
          leadId: doc.$id,
          templateKey: 'birthday',
          automationKey: 'birthday',
          createdBy: 'cron',
        });
      } catch {
        void 0;
      }
      try {
        await databases.updateDocument(DB_ID, PEOPLE_COL, doc.$id, { last_birthday_sent: monthDay });
      } catch (e) {
        console.warn('[cron-aniversario] enviado mas falhou last_birthday_sent', doc.$id, e?.message);
      }
      console.log('[cron-aniversario] enviado', { leadId: doc.$id, phone: phone.slice(0, 4) + '…', academyId: academy.$id });
    }
  }

  return { sent, skippedAcademiesWithoutZapster: skipped, errors, details, dateSp: monthDay };
}

export default async function handler(req, res) {
  if (req.query.hub === 'sales') {
    const action = String(req.query?.action || '').trim();
    if (action === 'reconcile') return salesReconcileHandler(req, res);
    if (
      action === 'shift' ||
      action === 'shift_open' ||
      action === 'shift_close' ||
      action === 'shift_move'
    ) {
      return cashShiftHandler(req, res);
    }
    if (req.method === 'POST') return salesCreateHandler(req, res);
    if (req.method === 'PATCH') return salesLiquidateHandler(req, res);
    if (req.method === 'GET') return salesHistoryHandler(req, res);
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  if (req.query.route === 'public-enrollment' || req.query.route === 'public-enrollment-config') {
    return publicEnrollmentHandler(req, res);
  }
  if (req.query.route === 'inventory') return inventoryHandler(req, res);
  if (req.query.route === 'products') return productsHandler(req, res);
  if (req.query.route === 'ai_import_products') return aiProductImportHandler(req, res);
  if (req.query.route === 'sales') return salesHistoryHandler(req, res);
  if (req.query.route === 'sales_by_student') return salesByStudentHandler(req, res);
  if (req.query.route === 'students') return studentsHandler(req, res);
  if (req.query.route === 'controlid_status') return controlidStatusHandler(req, res);
  if (req.query.route === 'controlid_test') return controlidTestHandler(req, res);
  if (req.query.route === 'controlid_save_config') return controlidSaveConfigHandler(req, res);
  if (req.query.route === 'controlid_sync') return controlidSyncHandler(req, res);
  if (req.query.route === 'controlid_revoke') return controlidRevokeHandler(req, res);
  if (req.query.route === 'controlid_release') return controlidReleaseHandler(req, res);
  if (req.query.route === 'controlid_monitor') return controlidMonitorHandler(req, res);
  if (req.query.route === 'controlid_test_image') return controlidTestImageHandler(req, res);
  if (req.query.route === 'controlid_sync_all') return controlidSyncAllHandler(req, res);

  // Rota de presença Control iD (rewrite de /api/control-id/attendance)
  if (req.query.route === 'control-id-attendance') {
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;
    if (req.method === 'GET') return handleAttendanceGet(req, res, academyId);
    if (req.method === 'POST') return handleAttendancePost(req, res, academyId);
    return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  }

  const idRaw = req.query.id || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug) || '';
  const id = String(idRaw).trim();

  if (id === 'convert') {
    if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Method Not Allowed' });
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const academyId = access.academyId;
    try {
      await assertBillingActive(academyId);
    } catch (e) {
      if (sendBillingGateError(res, e)) return;
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro interno' });
    }
    const phone = normalizePhone(req.body?.phone || '');
    const name = String(req.body?.name || '').trim() || phone;

    if (!phone) return json(res, 400, { sucesso: false, erro: 'phone ausente' });

    try {
      const list = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('phone', [phone]),
        Query.equal('academyId', [academyId]),
        Query.limit(1)
      ]);
      const existing = list.documents?.[0];

      if (existing && String(existing.name || '').trim().toLowerCase() === name.toLowerCase()) {
        return json(res, 200, { sucesso: true, ja_existe: true, id: existing.$id });
      }

      const classificacao = req.body?.classificacao;
      const classPatch = buildLeadFieldsFromClassification(classificacao);
      const typeFromClass = classPatch.type;
      delete classPatch.type;

      const payload = buildCanonicalLeadPayload({
        academyId,
        phone,
        name,
        origin: 'WhatsApp',
        extra: {
          contact_type: 'lead',
          type: typeFromClass || req.body?.type || 'Adulto',
          notes: '',
          ...classPatch,
        },
      });

      const perms = buildAcademyDocumentPermissions(access.doc);
      const created = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), payload, perms);
      await addLeadEventServer({
        academyId,
        leadId: created.$id,
        type: 'lead_criado',
        text: 'Convertido via Inbox',
        at: created.$createdAt,
        createdBy: 'system'
      });
      return json(res, 200, { sucesso: true, ja_existe: false, id: created.$id });
    } catch (e) {
      if (e instanceof AcademyPermissionError) {
        return json(res, 403, { sucesso: false, erro: e.message, code: e.code });
      }
      return json(res, 500, { sucesso: false, erro: e.message });
    }
  }

  if (id === 'cron-aniversario') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).end();
    }
    if (!cronAuthOk(req)) {
      return json(res, 401, { sucesso: false, erro: 'unauthorized' });
    }
    if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL || !ACADEMIES_COL) {
      return json(res, 503, { sucesso: false, erro: 'misconfigured' });
    }
    try {
      const result = await runBirthdayCron();
      return json(res, 200, { sucesso: true, ...result });
    } catch (e) {
      console.error('[cron-aniversario]', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'cron_failed' });
    }
  }

  if (req.method === 'PATCH') {
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    try {
      await assertBillingActive(access.academyId);
    } catch (e) {
      if (sendBillingGateError(res, e)) return;
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro interno' });
    }
    try {
      const lead = await databases.getDocument(DB_ID, LEADS_COL, id);
      const leadAcademy = String(lead?.academyId || lead?.academy_id || '').trim();
      if (!leadAcademy || leadAcademy !== access.academyId) {
        return json(res, 403, { sucesso: false, erro: 'Acesso negado a este lead' });
      }
      const up = await databases.updateDocument(DB_ID, LEADS_COL, id, req.body);
      return json(res, 200, { sucesso: true, id: up.$id });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e.message });
    }
  }

  return json(res, 404, { erro: 'not_found' });
}

// ── Presença Control iD ──────────────────────────────────────────────────────

async function handleAttendanceGet(req, res, academyId) {
  const { student_id, start, end } = req.query;
  const cursor = String(req.query.cursor || '').trim();
  const limitRaw = Number(req.query.limit);
  const pageLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 100;
  const filters = [
    Query.equal('academy_id', academyId),
    Query.orderDesc('checked_in_at'),
    Query.limit(pageLimit),
  ];
  if (student_id) filters.push(Query.equal('student_id', student_id));
  if (start) filters.push(Query.greaterThanEqual('checked_in_at', start));
  if (end) filters.push(Query.lessThanEqual('checked_in_at', end));
  if (cursor) filters.push(Query.cursorAfter(cursor));
  try {
    const result = await databases.listDocuments(DB_ID, ATTENDANCE_COL, filters);
    const docs = result.documents || [];
    const lastId = docs.length ? docs[docs.length - 1].$id : null;
    return res.json({
      sucesso: true,
      records: docs,
      next_cursor: docs.length === pageLimit && lastId ? lastId : null,
      has_more: docs.length === pageLimit && Boolean(lastId),
    });
  } catch (err) {
    return json(res, 500, { sucesso: false, erro: err.message });
  }
}

async function handleAttendancePost(req, res, academyId) {
  const { logs } = req.body || {};
  if (!Array.isArray(logs) || logs.length === 0)
    return json(res, 400, { sucesso: false, erro: 'logs deve ser um array não vazio' });
  if (!ATTENDANCE_COL)
    return json(res, 500, { sucesso: false, erro: 'APPWRITE_ATTENDANCE_COLLECTION_ID não configurado' });

  let students = [];
  try {
    const PAGE = 100;
    let cursor = null;
    for (;;) {
      const queries = [Query.equal('academyId', academyId), Query.limit(PAGE)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const result = await databases.listDocuments(DB_ID, PEOPLE_COL, queries);
      const batch = result.documents || [];
      students.push(...batch);
      if (batch.length < PAGE) break;
      cursor = batch[batch.length - 1].$id;
    }
    students = students.filter((s) => s?.controlid_user_id != null || s?.device_id != null);
  } catch (err) {
    return json(res, 500, { sucesso: false, erro: 'Erro ao buscar alunos' });
  }

  const byDeviceId = {};
  for (const s of students) {
    const uid = s.controlid_user_id ?? s.device_id;
    if (uid != null) byDeviceId[String(uid)] = s;
  }
  let count = 0;
  const errors = [];

  for (const log of logs) {
    const student = byDeviceId[String(log.user_id)];
    if (!student) continue;
    try {
      const existing = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('device_log_id', String(log.id)),
        Query.limit(1),
      ]);
      if (existing.total > 0) continue;
      await databases.createDocument(
        DB_ID,
        ATTENDANCE_COL,
        ID.unique(),
        buildControlIdAttendanceDocument({ academyId, student, log })
      );
      count++;
    } catch (err) {
      errors.push({ logId: log.id, err: err.message });
    }
  }

  return res.json({ sucesso: true, count, errors: errors.length > 0 ? errors : undefined });
}
