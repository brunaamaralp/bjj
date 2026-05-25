/**
 * Cron: gera FINANCIAL_TX pendentes a partir de templates recorrentes.
 */
import { Query, ID, Permission, Role } from 'node-appwrite';
import { Client, Databases } from 'node-appwrite';
import {
  buildFinanceTxPayload,
  financeTxDocumentForAppwrite,
  stripUnknownFinanceTxAttrs,
  normalizeRecurrenceType,
} from './financeTxFields.js';
import { recordAcademyEvent, FINANCE_RECURRENCE_EVENT_TYPES } from './academyEvents.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';

function currentYm(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseYm(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]) - 1 };
}

function isRecurrenceEndPast(recurrenceEnd) {
  const end = String(recurrenceEnd || '').trim();
  if (!/^\d{4}-\d{2}$/.test(end)) return false;
  return end < currentYm();
}

function shouldRunToday(template, now = new Date()) {
  const type = normalizeRecurrenceType(template.recurrence_type);
  const day = Number(template.recurrence_day) || 1;
  if (type === 'monthly') {
    const dom = Math.min(28, Math.max(1, day));
    return now.getUTCDate() === dom;
  }
  if (type === 'weekly') {
    const dow = Math.min(6, Math.max(0, Math.trunc(day)));
    return now.getUTCDay() === dow;
  }
  return false;
}

function weekBoundsUtc(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  const start = d.toISOString();
  const endDate = new Date(d);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  endDate.setUTCHours(23, 59, 59, 999);
  return { start, end: endDate.toISOString() };
}

async function deactivateTemplate(databases, templateId) {
  try {
    await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, templateId, {
      recurrence_type: 'none',
      is_recurrence_template: false,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('Unknown attribute')) throw e;
  }
}

async function alreadyGeneratedThisPeriod(databases, templateId, academyId, template) {
  const type = normalizeRecurrenceType(template.recurrence_type);
  if (type === 'monthly') {
    const ym = currentYm();
    try {
      const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
        Query.equal('academyId', academyId),
        Query.equal('recurrence_origin_id', templateId),
        Query.equal('competence_month', ym),
        Query.limit(1),
      ]);
      return (res.total || 0) > 0;
    } catch (e) {
      if (String(e?.message || '').includes('Unknown attribute')) return false;
      throw e;
    }
  }
  if (type === 'weekly') {
    const { start, end } = weekBoundsUtc();
    try {
      const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
        Query.equal('academyId', academyId),
        Query.equal('recurrence_origin_id', templateId),
        Query.greaterThanEqual('$createdAt', start),
        Query.lessThanEqual('$createdAt', end),
        Query.limit(1),
      ]);
      return (res.total || 0) > 0;
    } catch (e) {
      if (String(e?.message || '').includes('Unknown attribute')) return false;
      throw e;
    }
  }
  return false;
}

async function createFromTemplate(databases, template) {
  const academyId = String(template.academyId || '');
  const templateId = template.$id;
  const ym = currentYm();

  const payload = buildFinanceTxPayload(
    {
      academyId,
      type: template.type,
      category: template.category,
      gross: template.gross,
      fee: template.fee,
      net: template.net,
      direction: template.direction,
      method: template.method,
      installments: template.installments,
      planName: template.planName,
      note: template.note,
      lead_id: template.lead_id,
      status: 'pending',
      competence_month: ym,
      recurrence_origin_id: templateId,
      is_recurrence_template: false,
      recurrence_type: 'none',
    },
    {
      created_by: 'system',
      updated_by: 'system',
      origin_type: 'recurrence',
      origin_id: templateId,
    }
  );

  const forDb = financeTxDocumentForAppwrite(payload);
  let doc;
  try {
    doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), forDb, [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
    ]);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), stripUnknownFinanceTxAttrs(payload), [
      Permission.read(Role.users()),
      Permission.update(Role.users()),
    ]);
  }

  await recordAcademyEvent({
    event_type: FINANCE_RECURRENCE_EVENT_TYPES.GENERATED,
    academy_id: academyId,
    actor_user_id: 'system',
    actor_name: 'Sistema',
    template_id: templateId,
    tx_id: doc.$id,
    target_id: doc.$id,
    amount: template.gross,
    category: template.category,
    timestamp: new Date().toISOString(),
  });

  return doc.$id;
}

async function listRecurrenceTemplates(databases) {
  if (!FINANCIAL_TX_COL) return [];
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (let i = 0; i < 50; i += 1) {
    const q = [Query.equal('is_recurrence_template', true), Query.limit(PAGE)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    } catch (e) {
      if (String(e?.message || '').includes('Unknown attribute')) return [];
      throw e;
    }
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1]?.$id;
  }
  return all.filter((d) => {
    const t = normalizeRecurrenceType(d.recurrence_type);
    return t === 'monthly' || t === 'weekly';
  });
}

export async function runFinanceRecurrenceCron() {
  if (!FINANCIAL_TX_COL || !DB_ID || !API_KEY || !PROJECT_ID) {
    return { ok: false, error: 'not_configured', generated: 0, skipped: 0, deactivated: 0 };
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const now = new Date();
  let generated = 0;
  let skipped = 0;
  let deactivated = 0;

  const templates = await listRecurrenceTemplates(databases);

  for (const template of templates) {
    const templateId = template.$id;
    const academyId = String(template.academyId || '');

    if (isRecurrenceEndPast(template.recurrence_end)) {
      await deactivateTemplate(databases, templateId);
      deactivated += 1;
      continue;
    }

    if (!shouldRunToday(template, now)) {
      skipped += 1;
      continue;
    }

    if (await alreadyGeneratedThisPeriod(databases, templateId, academyId, template)) {
      skipped += 1;
      continue;
    }

    try {
      await createFromTemplate(databases, template);
      generated += 1;
    } catch (e) {
      console.error('[financeRecurrenceCron] create failed', templateId, e?.message || e);
      skipped += 1;
    }
  }

  return { ok: true, generated, skipped, deactivated, templates: templates.length };
}
