import { Query } from 'node-appwrite';
import { addLeadEventServer } from './leadEvents.js';
import {
  FREEZE_STATUS_ACTIVE,
  toYmd,
  computeDurationDays,
  bundleExtensionMonthsFromDays,
  referenceMonthsInRange,
  effectiveFreezeDaysUsed,
  planYearStartYmd,
} from '../planFreezeCore.js';
import { readControlIdConfig } from '../controlidSettings.js';
import { controlidSyncLeadServer } from './controlidHandlers.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const PLAN_FREEZES_COL =
  process.env.APPWRITE_PLAN_FREEZES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_PLAN_FREEZES_COLLECTION_ID ||
  '';

function todayYmdSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

async function listActiveFreezes(databases, dbId, leadsCol) {
  const out = [];
  let cursor = null;
  for (;;) {
    const q = [Query.equal('freeze_status', [FREEZE_STATUS_ACTIVE]), Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, leadsCol, q);
    out.push(...(res.documents || []));
    if (!res.documents || res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return out;
}

async function listLeadPayments(databases, dbId, leadId) {
  if (!PAYMENTS_COL) return [];
  const res = await databases.listDocuments(dbId, PAYMENTS_COL, [
    Query.equal('lead_id', String(leadId)),
    Query.limit(120),
  ]);
  return res.documents || [];
}

function isBundleAnchor(doc) {
  const cat = String(doc?.payment_category || '').toLowerCase();
  if (cat !== 'bundle') return false;
  const origin = String(doc?.bundle_origin_id || '').trim();
  const id = String(doc?.$id || '').trim();
  return !origin || origin === id;
}

async function extendBundleServer(databases, dbId, { leadId, academyId, daysUsed, payments }) {
  const anchor = payments.find(
    (p) => isBundleAnchor(p) && ['paid', 'covered'].includes(String(p.status || '').toLowerCase())
  );
  if (!anchor) return { extended: 0 };

  const monthsToAdd = bundleExtensionMonthsFromDays(daysUsed);
  const bundleMonths = Number(anchor.bundle_months) || 12;
  let cursorYm = anchor.reference_month;
  for (let m = 1; m < bundleMonths; m += 1) {
    const d = new Date(`${cursorYm}-02T12:00:00`);
    d.setMonth(d.getMonth() + 1);
    cursorYm = d.toISOString().slice(0, 7);
  }

  let created = 0;
  const anchorOrigin = String(anchor.bundle_origin_id || anchor.$id);

  for (let i = 0; i < monthsToAdd; i += 1) {
    const d = new Date(`${cursorYm}-02T12:00:00`);
    d.setMonth(d.getMonth() + 1);
    cursorYm = d.toISOString().slice(0, 7);

    const existing = payments.find((p) => String(p.reference_month) === cursorYm);
    if (existing && ['paid', 'covered'].includes(String(existing.status || '').toLowerCase())) {
      continue;
    }

    const payload = {
      lead_id: leadId,
      academy_id: academyId,
      reference_month: cursorYm,
      status: 'covered',
      amount: 0,
      method: anchor.method || 'pix',
      account: anchor.account || '',
      plan_name: anchor.plan_name || '',
      payment_category: 'bundle',
      bundle_origin_id: anchorOrigin,
      note: `Extensão por trancamento (${daysUsed} dias)`,
    };

    if (existing?.$id) {
      await databases.updateDocument(dbId, PAYMENTS_COL, existing.$id, payload);
    } else {
      const { ID } = await import('node-appwrite');
      await databases.createDocument(dbId, PAYMENTS_COL, ID.unique(), payload);
    }
    created += 1;
  }

  if (created > 0) {
    try {
      await databases.updateDocument(dbId, PAYMENTS_COL, anchor.$id, {
        bundle_months: bundleMonths + created,
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Unknown attribute')) throw e;
    }
  }

  return { extended: created, newEndYm: cursorYm };
}

async function clearFrozenPayments(databases, dbId, leadId, startYmd, endYmd) {
  if (!PAYMENTS_COL) return;
  const months = new Set(referenceMonthsInRange(startYmd, endYmd));
  const payments = await listLeadPayments(databases, dbId, leadId);
  for (const p of payments) {
    if (!months.has(String(p.reference_month || ''))) continue;
    if (String(p.status || '').toLowerCase() !== 'frozen') continue;
    try {
      await databases.updateDocument(dbId, PAYMENTS_COL, p.$id, { status: 'pending' });
    } catch (e) {
      console.warn('[cron/plan-freeze] clear frozen', p.$id, e?.message);
    }
  }
}

/**
 * Retoma planos com freeze_end <= hoje.
 */
export async function runPlanFreezeCron(databases, dbId, leadsCol, academiesCol) {
  const today = todayYmdSaoPaulo();
  const docs = await listActiveFreezes(databases, dbId, leadsCol);
  let processed = 0;
  let errors = 0;
  const notifications = [];

  for (const doc of docs) {
    const endYmd = String(doc.freeze_end || '').slice(0, 10);
    if (!endYmd || endYmd > today) continue;

    const leadId = doc.$id;
    const academyId = String(doc.academyId || doc.academy_id || '').trim();
    const startYmd = String(doc.freeze_start || '').slice(0, 10);
    const daysCharged = computeDurationDays(startYmd, endYmd);

    try {
      const enroll = String(doc.enrollmentDate || doc.enrollment_date || '').slice(0, 10);
      const quotaYear = enroll ? planYearStartYmd(enroll, new Date(`${today}T12:00:00`)) : today;
      const studentLike = {
        freeze_days_used: doc.freeze_days_used,
        freeze_quota_year: doc.freeze_quota_year,
        enrollmentDate: enroll,
      };
      let baseUsed = effectiveFreezeDaysUsed(studentLike, new Date(`${today}T12:00:00`));
      const plannedDays = daysCharged;
      const adjustedUsed = Math.max(0, baseUsed);

      await databases.updateDocument(dbId, leadsCol, leadId, {
        freeze_status: null,
        freeze_start: null,
        freeze_end: null,
        freeze_days_used: adjustedUsed,
        freeze_quota_year: quotaYear,
      });

      const payments = await listLeadPayments(databases, dbId, leadId);
      const ext = await extendBundleServer(databases, dbId, {
        leadId,
        academyId,
        daysUsed: plannedDays,
        payments,
      });

      if (ext.extended === 0 && plannedDays > 0) {
        await addLeadEventServer({
          academyId,
          leadId,
          type: 'plan_extended',
          text: `Plano estendido em ${plannedDays} dias após trancamento.`,
          payloadJson: { days: plannedDays, auto: true },
          createdBy: 'cron',
        });
      }

      await clearFrozenPayments(databases, dbId, leadId, startYmd, endYmd);

      let academyDoc = null;
      if (academiesCol && academyId) {
        try {
          academyDoc = await databases.getDocument(dbId, academiesCol, academyId);
        } catch {
          void 0;
        }
      }
      const controlIdCfg = readControlIdConfig(academyDoc?.settings ?? academyDoc);
      if (controlIdCfg.enabled && doc.controlid_synced === true) {
        try {
          await controlidSyncLeadServer(academyId, leadId);
        } catch (e) {
          console.warn('[cron/plan-freeze] controlid sync', leadId, e?.message);
        }
      }

      await addLeadEventServer({
        academyId,
        leadId,
        type: 'plan_unfreeze',
        text: `Trancamento encerrado automaticamente em ${endYmd}.`,
        payloadJson: { days_used: plannedDays, auto: true },
        createdBy: 'cron',
      });

      notifications.push({
        leadId,
        leadName: String(doc.name || '').trim(),
        endYmd,
        academyId,
      });
      processed += 1;
    } catch (e) {
      errors += 1;
      console.error('[cron/plan-freeze] lead', leadId, e?.message || e);
    }
  }

  return { today, checked: docs.length, processed, errors, notifications };
}
