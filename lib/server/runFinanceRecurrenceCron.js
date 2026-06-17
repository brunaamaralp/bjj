/**
 * Cron: gera FINANCIAL_TX pendentes a partir de templates recorrentes.
 */
import { Query } from 'node-appwrite';
import { Client, Databases } from 'node-appwrite';
import {
  financeTxOptionalPatchForAppwrite,
  normalizeRecurrenceType,
} from './financeTxFields.js';
import { currentYmFinance } from '../../src/lib/financeForecastCore.js';
import { invalidateFinanceForecastCache } from './financeForecastHandler.js';
import {
  alreadyGeneratedForPeriod,
  createPayableInstanceFromTemplate,
  shouldRunRecurrenceToday,
} from './financeRecurrenceInstance.js';

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

function isRecurrenceEndPast(recurrenceEnd) {
  const end = String(recurrenceEnd || '').trim();
  if (!/^\d{4}-\d{2}$/.test(end)) return false;
  return end < currentYmFinance();
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

    if (!shouldRunRecurrenceToday(template, now)) {
      skipped += 1;
      continue;
    }

    if (await alreadyGeneratedForPeriod(databases, DB_ID, FINANCIAL_TX_COL, templateId, academyId, template)) {
      skipped += 1;
      continue;
    }

    try {
      await createPayableInstanceFromTemplate(databases, DB_ID, FINANCIAL_TX_COL, template);
      invalidateFinanceForecastCache(academyId);
      generated += 1;
    } catch (e) {
      console.error('[financeRecurrenceCron] create failed', templateId, e?.message || e);
      skipped += 1;
    }
  }

  return { ok: true, generated, skipped, deactivated, templates: templates.length };
}
