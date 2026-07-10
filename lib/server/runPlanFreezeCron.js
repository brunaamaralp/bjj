import { Query, ID, Permission, Role } from 'node-appwrite';
import { addLeadEventServer } from './leadEvents.js';
import {
  FREEZE_STATUS_ACTIVE,
  toYmd,
  computeDurationDays,
  bundleExtensionMonthsFromDays,
  effectiveFreezeDaysUsed,
  planYearStartYmd,
  projectedFreezeDaysUsed,
  shouldAlertFreezeLimit,
  buildFreezeLimitAlertDescription,
  FREEZE_LIMIT_ALERT_MARKER,
} from '../planFreezeCore.js';
import { readControlIdConfig } from '../controlidSettings.js';
import { controlidSyncLeadServer } from './controlidHandlers.js';
import {
  materializeFrozenPaymentsInRange,
  revertFrozenProjection,
} from './planFreezeProjectionServer.js';
import { planFreezesCollectionId } from './planFreezeLookup.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const TASKS_COL = process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';

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

function mapDocToStudentLike(doc, todayYmd) {
  return {
    freeze_status: doc.freeze_status,
    freeze_start: doc.freeze_start,
    freeze_end: doc.freeze_end,
    freeze_days_used: doc.freeze_days_used,
    freeze_quota_year: doc.freeze_quota_year,
    enrollmentDate: doc.enrollmentDate || doc.enrollment_date,
  };
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

async function listLeadTasks(databases, dbId, leadId) {
  if (!TASKS_COL || !leadId) return [];
  try {
    const res = await databases.listDocuments(dbId, TASKS_COL, [
      Query.equal('lead_id', String(leadId)),
      Query.limit(50),
    ]);
    return res.documents || [];
  } catch {
    return [];
  }
}

function isBundleAnchor(doc) {
  const cat = String(doc?.payment_category || '').toLowerCase();
  if (cat !== 'bundle') return false;
  const origin = String(doc?.bundle_origin_id || '').trim();
  const id = String(doc?.$id || '').trim();
  return !origin || origin === id;
}

function hasFreezeLimitAlertTask(tasks, leadId, freezeStartYmd) {
  const marker = buildFreezeLimitAlertDescription(freezeStartYmd);
  return (tasks || []).some((t) => {
    if (String(t.lead_id || '') !== String(leadId)) return false;
    const desc = String(t.description || '');
    if (!desc.includes(FREEZE_LIMIT_ALERT_MARKER)) return false;
    if (desc.includes(`freeze_start: ${freezeStartYmd}`)) return true;
    return desc === marker;
  });
}

async function ensureFrozenPaymentsInRange(databases, dbId, { leadId, academyId, startYmd, endYmd, planName }) {
  const out = await materializeFrozenPaymentsInRange({
    databases,
    dbId,
    leadId,
    academyId,
    startYmd,
    endYmd,
    planName,
  });
  return { updated: (out.updated || 0) + (out.created || 0) };
}

async function maybeAlertFreezeLimit(databases, dbId, doc, todayYmd) {
  const leadId = doc.$id;
  const academyId = String(doc.academyId || doc.academy_id || '').trim();
  const startYmd = String(doc.freeze_start || '').slice(0, 10);
  if (!academyId || !startYmd) return { alerted: false };

  const studentLike = mapDocToStudentLike(doc, todayYmd);
  const refDate = new Date(`${todayYmd}T12:00:00`);
  if (!shouldAlertFreezeLimit(studentLike, refDate)) return { alerted: false };

  const tasks = await listLeadTasks(databases, dbId, leadId);
  if (hasFreezeLimitAlertTask(tasks, leadId, startYmd)) return { alerted: false, skipped: 'duplicate' };

  const leadName = String(doc.name || '').trim();
  const projected = projectedFreezeDaysUsed(studentLike, refDate);
  const description = buildFreezeLimitAlertDescription(startYmd);

  if (TASKS_COL) {
    const nowIso = new Date().toISOString();
    try {
      await databases.createDocument(
        dbId,
        TASKS_COL,
        ID.unique(),
        {
          academy_id: academyId,
          title: 'Ligar para aluno — retorno do trancamento',
          description: `${description}\n---\nAluno com 75+ dias de trancamento no ano do plano (restam ≤15 dias da cota de 90).`,
          status: 'pending',
          due_date: todayYmd,
          assigned_to: '',
          lead_id: leadId,
          lead_name: leadName,
          created_by: 'cron',
          created_at: nowIso,
          updated_at: nowIso,
        },
        [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
      );
    } catch (e) {
      console.warn('[cron/plan-freeze] limit task', leadId, e?.message);
      return { alerted: false, error: e?.message };
    }
  }

  await addLeadEventServer({
    academyId,
    leadId,
    type: 'student_freeze_limit_warning',
    text: `Aluno próximo do limite de trancamento (${projected}/90 dias no ano do plano).`,
    payloadJson: { projected_days: projected, freeze_start: startYmd },
    createdBy: 'cron',
  });

  return { alerted: true, projected };
}

export async function extendBundleServer(databases, dbId, { leadId, academyId, daysUsed, payments }) {
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

/**
 * Retoma planos com freeze_end <= hoje; mantém indefinidos; alerta limite de 90 dias.
 */
export async function runPlanFreezeCron(databases, dbId, leadsCol, academiesCol) {
  const today = todayYmdSaoPaulo();
  const docs = await listActiveFreezes(databases, dbId, leadsCol);
  let processed = 0;
  let errors = 0;
  let indefiniteMaintained = 0;
  let limitAlerts = 0;
  const notifications = [];

  for (const doc of docs) {
    const endYmd = String(doc.freeze_end || '').slice(0, 10);
    const startYmd = String(doc.freeze_start || '').slice(0, 10);
    const leadId = doc.$id;
    const academyId = String(doc.academyId || doc.academy_id || '').trim();
    const indefinite = !endYmd;

    try {
      if (indefinite) {
        await ensureFrozenPaymentsInRange(databases, dbId, {
          leadId,
          academyId,
          startYmd,
          endYmd: today,
          planName: String(doc.plan || '').trim(),
        });
        indefiniteMaintained += 1;
        const alertOut = await maybeAlertFreezeLimit(databases, dbId, doc, today);
        if (alertOut.alerted) limitAlerts += 1;
        continue;
      }

      if (endYmd > today) {
        const alertOut = await maybeAlertFreezeLimit(databases, dbId, doc, today);
        if (alertOut.alerted) limitAlerts += 1;
        continue;
      }

      const daysCharged = computeDurationDays(startYmd, endYmd);

      const enroll = String(doc.enrollmentDate || doc.enrollment_date || '').slice(0, 10);
      const quotaYear = enroll ? planYearStartYmd(enroll, new Date(`${today}T12:00:00`)) : today;
      const studentLike = {
        freeze_days_used: doc.freeze_days_used,
        freeze_quota_year: doc.freeze_quota_year,
        enrollmentDate: enroll,
      };
      const baseUsed = effectiveFreezeDaysUsed(studentLike, new Date(`${today}T12:00:00`));
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
        daysUsed: daysCharged,
        payments,
      });

      if (ext.extended === 0 && daysCharged > 0) {
        await addLeadEventServer({
          academyId,
          leadId,
          type: 'plan_extended',
          text: `Plano estendido em ${daysCharged} dias após trancamento.`,
          payloadJson: { days: daysCharged, auto: true },
          createdBy: 'cron',
        });
      }

      await revertFrozenProjection({
        databases,
        dbId,
        planFreezesCol: planFreezesCollectionId(),
        leadId,
        academyId,
        unfreezeYmd: endYmd,
        freezeStartYmd: startYmd,
        freezeEndYmd: endYmd,
        userId: 'cron',
      });

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
        payloadJson: { days_used: daysCharged, auto: true },
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

  return {
    today,
    checked: docs.length,
    processed,
    errors,
    indefiniteMaintained,
    limitAlerts,
    notifications,
  };
}
