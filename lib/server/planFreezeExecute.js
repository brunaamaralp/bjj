import { ID, Permission, Role, Query } from 'node-appwrite';
import {
  validateFreezeRequest,
  effectiveFreezeDaysUsed,
  planYearStartYmd,
  toYmd,
  FREEZE_STATUS_ACTIVE,
  computeDurationDays,
  isFreezeIndefinite,
} from '../planFreezeCore.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { assertOrRepairStudentInAcademy } from './studentAcademyRepair.js';
import { addLeadEventServer } from './leadEvents.js';
import { readControlIdConfig, resolveControlIdUserId } from '../controlidSettings.js';
import { configWithPlainPassword, destroyUser } from './controlidService.js';
import { paymentFreezeEndYmd } from '../planFreezeCore.js';
import { materializeFrozenPaymentsInRange, revertFrozenProjection } from './planFreezeProjectionServer.js';
import { extendBundleServer } from './runPlanFreezeCron.js';
import { controlidSyncLeadServer } from './controlidHandlers.js';

const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';

function freezeIsoFromYmd(ymd) {
  return `${String(ymd).slice(0, 10)}T12:00:00.000Z`;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} studentsCol
 * @param {string} studentId
 * @param {string} academyId
 */
async function assertStudent(databases, dbId, studentsCol, studentId, academyId) {
  return assertOrRepairStudentInAcademy(databases, dbId, studentsCol, studentId, academyId);
}

/**
 * Executa trancamento de plano (HTTP owner ou agente IA).
 * @param {object} params
 */
export async function executeFreezeServer({
  databases,
  dbId,
  studentsCol,
  planFreezesCol,
  academiesCol,
  academyId,
  studentId,
  startYmd,
  endYmd,
  durationDays,
  reason = '',
  indefinite = false,
  registeredBy = 'system',
}) {
  const sid = String(studentId || '').trim();
  const aid = String(academyId || '').trim();
  if (!databases || !dbId || !studentsCol || !sid || !aid) {
    return { ok: false, error: 'config_or_ids_missing' };
  }

  try {
    const doc = await assertStudent(databases, dbId, studentsCol, sid, aid);
    const student = mapAppwriteDocToStudent(doc);

    if (String(student.freeze_status || '').trim() === 'active') {
      return { ok: false, error: 'student_already_frozen' };
    }

    const validation = validateFreezeRequest({
      startYmd: String(startYmd || '').slice(0, 10),
      endYmd: String(endYmd || '').slice(0, 10),
      durationDays,
      student,
      indefinite: indefinite === true,
    });
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const { days, startYmd: sYmd, endYmd: eYmd } = validation;
    const isIndefinite = validation.indefinite === true;
    const enroll = String(student.enrollmentDate || '').trim().slice(0, 10);
    const quotaYear = enroll ? planYearStartYmd(enroll) : toYmd(new Date()).slice(0, 10);
    let daysUsedBase = effectiveFreezeDaysUsed(student);
    if (String(student.freeze_quota_year || '') !== quotaYear) daysUsedBase = 0;
    const newDaysUsed = isIndefinite ? daysUsedBase : daysUsedBase + days;

    const studentPatch = {
      freeze_start: freezeIsoFromYmd(sYmd),
      freeze_end: isIndefinite ? null : freezeIsoFromYmd(eYmd),
      freeze_status: FREEZE_STATUS_ACTIVE,
      freeze_days_used: newDaysUsed,
      freeze_quota_year: quotaYear,
    };
    await databases.updateDocument(dbId, studentsCol, sid, studentPatch);

    if (planFreezesCol) {
      const freezeDoc = {
        lead_id: sid,
        academy_id: aid,
        start_date: freezeIsoFromYmd(sYmd),
        reason: String(reason || '').slice(0, 256),
        registered_by: String(registeredBy || 'system').slice(0, 64),
        created_at: new Date().toISOString(),
        indefinite: isIndefinite,
      };
      if (!isIndefinite) {
        freezeDoc.end_date = freezeIsoFromYmd(eYmd);
        freezeDoc.days = days;
      }
      try {
        await databases.createDocument(dbId, planFreezesCol, ID.unique(), freezeDoc);
      } catch (freezeErr) {
        await databases.updateDocument(dbId, studentsCol, sid, {
          freeze_start: doc.freeze_start ?? null,
          freeze_end: doc.freeze_end ?? null,
          freeze_status: doc.freeze_status ?? null,
          freeze_days_used: doc.freeze_days_used ?? null,
          freeze_quota_year: doc.freeze_quota_year ?? null,
        });
        const freezeMsg = String(freezeErr?.message || '');
        if (/end_date|days|required|schema_incompatible/i.test(freezeMsg)) {
          return { ok: false, error: 'plan_freezes_schema_outdated' };
        }
        throw freezeErr;
      }
    }

    const eventText = isIndefinite
      ? reason || `Trancamento desde ${sYmd} (retorno indefinido)`
      : reason || `Trancamento ${sYmd} — ${eYmd} (${days} dias)`;

    await addLeadEventServer({
      academyId: aid,
      leadId: sid,
      type: 'student_freeze_started',
      text: eventText,
      createdBy: registeredBy,
      payloadJson: { start: sYmd, end: eYmd || null, days: days ?? null, reason, indefinite: isIndefinite },
    });

    const paymentEndYmd = paymentFreezeEndYmd({
      startYmd: sYmd,
      endYmd: eYmd,
      indefinite: isIndefinite,
    });
    await materializeFrozenPaymentsInRange({
      databases,
      dbId,
      leadId: sid,
      academyId: aid,
      startYmd: sYmd,
      endYmd: paymentEndYmd,
      planName: String(student.plan || '').trim(),
    });

    const todayYmd = toYmd(new Date()).slice(0, 10);
    if (sYmd <= todayYmd && doc.controlid_synced === true && academiesCol) {
      void (async () => {
        try {
          const academyDoc = await databases.getDocument(dbId, academiesCol, aid);
          const controlIdCfg = readControlIdConfig(academyDoc?.settings);
          if (controlIdCfg.enabled) {
            const cfg = configWithPlainPassword(academyDoc);
            if (cfg.configured) {
              const userId = resolveControlIdUserId(doc);
              if (userId) {
                await destroyUser(cfg, userId);
                await databases.updateDocument(dbId, studentsCol, sid, {
                  controlid_synced: false,
                  controlid_sync_error: null,
                });
              }
            }
          }
        } catch (e) {
          console.warn('[planFreezeExecute] controlid revoke:', e?.message);
        }
      })();
    }

    return {
      ok: true,
      summary: eventText,
      startYmd: sYmd,
      endYmd: eYmd || null,
      days: days ?? null,
      indefinite: isIndefinite,
    };
  } catch (e) {
    if (e.code === 'FORBIDDEN') return { ok: false, error: 'access_denied' };
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

async function listLeadPayments(databases, dbId, leadId) {
  if (!PAYMENTS_COL) return [];
  const res = await databases.listDocuments(dbId, PAYMENTS_COL, [
    Query.equal('lead_id', String(leadId)),
    Query.limit(120),
  ]);
  return res.documents || [];
}

/**
 * Encerra trancamento ativo (antecipado ou na data programada).
 * @param {object} params
 */
export async function executeUnfreezeServer({
  databases,
  dbId,
  studentsCol,
  planFreezesCol,
  academiesCol,
  academyId,
  studentId,
  early = true,
  registeredBy = 'system',
}) {
  const sid = String(studentId || '').trim();
  const aid = String(academyId || '').trim();
  if (!databases || !dbId || !studentsCol || !sid || !aid) {
    return { ok: false, error: 'config_or_ids_missing' };
  }

  try {
    const doc = await assertStudent(databases, dbId, studentsCol, sid, aid);
    const student = mapAppwriteDocToStudent(doc);

    if (String(student.freeze_status || '').trim() !== FREEZE_STATUS_ACTIVE) {
      return { ok: false, error: 'student_not_frozen' };
    }

    const startYmd = String(student.freeze_start || '').slice(0, 10);
    const plannedEndYmd = String(student.freeze_end || '').slice(0, 10);
    const indefinite = isFreezeIndefinite(student);
    const todayYmd = toYmd(new Date());
    const isEarly = early === true;
    const actualEndYmd = isEarly || indefinite ? todayYmd : plannedEndYmd || todayYmd;

    const actualDays = computeDurationDays(startYmd, actualEndYmd);
    const plannedDays = indefinite ? 0 : computeDurationDays(startYmd, plannedEndYmd);
    const daysCharged = isEarly || indefinite ? actualDays : plannedDays;

    const enroll = String(student.enrollmentDate || '').trim().slice(0, 10);
    const quotaYear = enroll ? planYearStartYmd(enroll) : todayYmd;
    let baseUsed = effectiveFreezeDaysUsed(student);
    if (String(student.freeze_quota_year || '') !== quotaYear) baseUsed = 0;

    const prevActiveDays = indefinite ? 0 : computeDurationDays(startYmd, plannedEndYmd);
    const adjustedUsed = Math.max(0, baseUsed - prevActiveDays + daysCharged);

    await databases.updateDocument(dbId, studentsCol, sid, {
      freeze_status: null,
      freeze_start: null,
      freeze_end: null,
      freeze_days_used: adjustedUsed,
      freeze_quota_year: quotaYear,
    });

    const payments = await listLeadPayments(databases, dbId, sid);
    const extension = await extendBundleServer(databases, dbId, {
      leadId: sid,
      academyId: aid,
      daysUsed: daysCharged,
      payments,
    });

    if (extension.extended === 0 && daysCharged > 0) {
      await addLeadEventServer({
        academyId: aid,
        leadId: sid,
        type: 'plan_extended',
        text: `Plano estendido em ${daysCharged} dias após trancamento.`,
        payloadJson: { days: daysCharged, early: isEarly },
        createdBy: registeredBy,
      });
    }

    const freezeRangeEndYmd = indefinite ? actualEndYmd : plannedEndYmd || actualEndYmd;
    await revertFrozenProjection({
      databases,
      dbId,
      planFreezesCol,
      leadId: sid,
      academyId: aid,
      unfreezeYmd: actualEndYmd,
      freezeStartYmd: startYmd,
      freezeEndYmd: freezeRangeEndYmd,
      userId: registeredBy,
    });

    if (academiesCol) {
      try {
        const academyDoc = await databases.getDocument(dbId, academiesCol, aid);
        const controlIdCfg = readControlIdConfig(academyDoc?.settings ?? academyDoc);
        if (controlIdCfg.enabled && doc.controlid_synced === true) {
          await controlidSyncLeadServer(aid, sid);
        }
      } catch (e) {
        console.warn('[planFreezeExecute] controlid sync:', e?.message);
      }
    }

    const eventText = isEarly || indefinite
      ? `Trancamento encerrado antecipadamente (${actualDays} dias utilizados).`
      : `Trancamento encerrado — retorno em ${actualEndYmd}.`;

    await addLeadEventServer({
      academyId: aid,
      leadId: sid,
      type: 'student_freeze_ended',
      text: eventText,
      payloadJson: {
        days_used: daysCharged,
        early: isEarly,
        extension_months: extension.extended || 0,
      },
      createdBy: registeredBy,
    });

    return {
      ok: true,
      summary: eventText,
      actualEndYmd,
      daysCharged,
      freeze_days_used: adjustedUsed,
      freeze_quota_year: quotaYear,
      extension,
    };
  } catch (e) {
    if (e.code === 'FORBIDDEN') return { ok: false, error: 'access_denied' };
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}
