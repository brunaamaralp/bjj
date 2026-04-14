import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { sendZapsterText } from '../lib/server/zapsterSend.js';
import {
  BIRTHDAY_CRON_DEFAULT_TEXT,
  applyWhatsappTemplatePlaceholders
} from '../lib/whatsappTemplateDefaults.js';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { assertBillingActive, sendBillingGateError } from '../lib/server/billingGate.js';
import { addLeadEventServer } from '../lib/server/leadEvents.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
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

function resolveBirthdayMessageTemplate(academy) {
  let fromTemplates = '';
  try {
    const raw = academy?.whatsappTemplates;
    const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (t && typeof t === 'object' && typeof t.birthday === 'string' && String(t.birthday).trim()) {
      fromTemplates = String(t.birthday).trim();
    }
  } catch {
    void 0;
  }
  const fromAcademy = String(academy?.birthdayMessage || '').trim();
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

async function listLeadsForAcademy(academyId) {
  const out = [];
  let cursor = null;
  const aid = String(academyId || '').trim();
  if (!aid) return out;
  for (;;) {
    const q = [Query.equal('academyId', [aid]), Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, LEADS_COL, q);
    out.push(...(res.documents || []));
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
    const inst = zapsterInstanceFromAcademy(academy);
    if (!inst) {
      skipped += 1;
      continue;
    }

    const academyName = String(academy?.name || '').trim();
    const templateRaw = resolveBirthdayMessageTemplate(academy);

    let leads;
    try {
      leads = await listLeadsForAcademy(academy.$id);
    } catch (e) {
      errors += 1;
      details.push({ academyId: academy.$id, erro: e?.message || 'list_leads' });
      continue;
    }

    for (const doc of leads) {
      if (String(doc?.status || '').trim() !== STATUS_MATRICULADO) continue;

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

      const z = await sendZapsterText({ recipient: phone, text: message, instanceId: inst });
      if (!z?.ok) {
        errors += 1;
        details.push({ leadId: doc.$id, phone, erro: z?.erro || 'zapster' });
        continue;
      }

      sent += 1;
      try {
        await databases.updateDocument(DB_ID, LEADS_COL, doc.$id, { last_birthday_sent: monthDay });
      } catch (e) {
        console.warn('[cron-aniversario] enviado mas falhou last_birthday_sent', doc.$id, e?.message);
      }
      console.log('[cron-aniversario] enviado', { leadId: doc.$id, phone: phone.slice(0, 4) + '…', academyId: academy.$id });
    }
  }

  return { sent, skippedAcademiesWithoutZapster: skipped, errors, details, dateSp: monthDay };
}

export default async function handler(req, res) {
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

      const nowIso = new Date().toISOString();
      const payload = {
        name,
        phone,
        contact_type: 'lead',
        type: req.body?.type || 'Adulto',
        status: 'Novo',
        origin: 'WhatsApp',
        academyId,
        notes: '',
        pipeline_stage: 'Novo',
        status_changed_at: nowIso,
        pipeline_stage_changed_at: nowIso
      };

      const created = await databases.createDocument(
        DB_ID,
        LEADS_COL,
        ID.unique(),
        payload,
        [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
      );
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
