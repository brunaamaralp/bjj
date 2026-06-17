/**
 * Cron diário — automações WhatsApp de reativação por frequência.
 */
import { Query } from 'node-appwrite';
import { parseAutomationsConfig, normalizePhoneDigits } from '../automationCore.js';
import {
  ATTENDANCE_RETENTION_LOOKBACK_DAYS,
  ATTENDANCE_RISK_STATUS,
  aggregateLastCheckinByStudent,
  buildStudentRetentionMetrics,
  isRetentionEligibleStudent,
} from '../attendanceRetentionCore.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { sendZapsterText } from './zapsterSend.js';
import { recordWhatsappTemplateSent } from './whatsappTemplateSent.js';
import {
  applyWhatsappTemplatePlaceholders,
  parseWhatsappTemplatesField,
} from '../whatsappTemplateDefaults.js';
import { listAcademyStudentDocs } from './listAcademyStudents.js';
import { addDays, toYmd } from '../planFreezeCore.js';
import { enrollmentDateYmd } from '../../src/lib/studentEnrollmentDate.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID || process.env.APPWRITE_ATTENDANCE_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const ATTENDANCE_PAGE_SIZE = 500;
const MAX_ATTENDANCE_DOCS = 12_000;

function zapsterInstanceFromAcademy(doc) {
  return String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim();
}

function resolveTemplateText(academy, templateKey) {
  const key = String(templateKey || 'recovery').trim() || 'recovery';
  const { templates } = parseWhatsappTemplatesField(academy?.whatsappTemplates);
  return String(templates?.[key] || '').trim();
}

function absenceAnchor(lastCheckinAt, student) {
  const last = String(lastCheckinAt || '').trim();
  if (last) return last;
  const enroll = enrollmentDateYmd(student);
  return enroll ? `${enroll}T12:00:00.000Z` : '';
}

async function listAllAcademies(databases, dbId) {
  const out = [];
  let cursor = null;
  for (;;) {
    const q = [Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, ACADEMIES_COL, q);
    for (const d of res.documents || []) {
      if (d?.$id) out.push(d);
    }
    if (!res.documents || res.documents.length < 100) break;
    cursor = res.documents[res.documents.length - 1].$id;
  }
  return out;
}

async function fetchAttendanceSince(databases, dbId, academyId, sinceIso) {
  if (!ATTENDANCE_COL) return [];
  const docs = [];
  let cursor = null;
  for (;;) {
    const queries = [
      Query.equal('academy_id', academyId),
      Query.greaterThanEqual('checked_in_at', sinceIso),
      Query.orderDesc('checked_in_at'),
      Query.limit(ATTENDANCE_PAGE_SIZE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(dbId, ATTENDANCE_COL, queries);
    const batch = page.documents || [];
    docs.push(...batch);
    if (docs.length >= MAX_ATTENDANCE_DOCS || batch.length < ATTENDANCE_PAGE_SIZE) break;
    cursor = batch[batch.length - 1].$id;
  }
  return docs.slice(0, MAX_ATTENDANCE_DOCS);
}

function shouldTriggerAutomation(metrics, automationKey, cfg) {
  const days = Number(metrics?.daysWithoutCheckin) || 0;
  const enrolledDays = Number(metrics?.daysSinceEnrollment);
  const isNewcomer = enrolledDays != null && enrolledDays < 60;
  const threshold = Math.max(1, Number(cfg?.thresholdDays) || (automationKey === 'newcomer_at_risk' ? 7 : 10));

  if (automationKey === 'newcomer_at_risk') {
    return (
      metrics?.status === ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK ||
      (isNewcomer && days >= threshold)
    );
  }
  if (automationKey === 'absent_student') {
    if (isNewcomer && metrics?.status === ATTENDANCE_RISK_STATUS.NEWCOMER_AT_RISK) return false;
    return days >= threshold;
  }
  return false;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 */
export async function runAttendanceRetentionCron(databases, dbId) {
  if (!ACADEMIES_COL || !STUDENTS_COL) {
    return { sent: 0, skipped: 0, errors: 0, details: [], skippedReason: 'collections_missing' };
  }

  const today = new Date();
  const sinceIso = `${toYmd(addDays(today, -ATTENDANCE_RETENTION_LOOKBACK_DAYS))}T00:00:00.000Z`;
  const academies = await listAllAcademies(databases, dbId);

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const details = [];

  for (const academy of academies) {
    const cfgAll = parseAutomationsConfig(academy.automations_config);
    const absentCfg = cfgAll.absent_student || {};
    const newcomerCfg = cfgAll.newcomer_at_risk || {};
    if (!absentCfg.active && !newcomerCfg.active) continue;

    const inst = zapsterInstanceFromAcademy(academy);
    if (!inst) {
      skipped += 1;
      continue;
    }

    const academyName = String(academy?.name || '').trim();
    let docs;
    try {
      docs = await listAcademyStudentDocs(academy.$id);
    } catch (e) {
      errors += 1;
      details.push({ academyId: academy.$id, erro: e?.message || 'list_students' });
      continue;
    }

    let attendanceDocs = [];
    try {
      attendanceDocs = await fetchAttendanceSince(databases, dbId, academy.$id, sinceIso);
    } catch (e) {
      errors += 1;
      details.push({ academyId: academy.$id, erro: e?.message || 'list_attendance' });
      continue;
    }

    const lastCheckinByStudent = aggregateLastCheckinByStudent(attendanceDocs);

    for (const raw of docs) {
      const student = mapAppwriteDocToStudent(raw);
      if (!student || !isRetentionEligibleStudent(student, today)) continue;

      const studentId = String(student.id || raw.$id || '').trim();
      const lastCheckin = lastCheckinByStudent.get(studentId) || null;
      const metrics = buildStudentRetentionMetrics(student, lastCheckin, today);
      if (!metrics) continue;

      const anchor = absenceAnchor(lastCheckin, student);
      const sentAnchor = String(raw.retention_automation_anchor || '').trim();
      if (anchor && sentAnchor === anchor) {
        skipped += 1;
        continue;
      }

      let automationKey = null;
      let cfg = null;
      if (newcomerCfg.active && shouldTriggerAutomation(metrics, 'newcomer_at_risk', newcomerCfg)) {
        automationKey = 'newcomer_at_risk';
        cfg = newcomerCfg;
      } else if (absentCfg.active && shouldTriggerAutomation(metrics, 'absent_student', absentCfg)) {
        automationKey = 'absent_student';
        cfg = absentCfg;
      } else {
        continue;
      }

      const phone = normalizePhoneDigits(student.phone || raw.phone);
      if (!phone) {
        skipped += 1;
        continue;
      }

      const templateKey = String(cfg.templateKey || 'recovery').trim() || 'recovery';
      const templateRaw = resolveTemplateText(academy, templateKey);
      if (!templateRaw) {
        skipped += 1;
        continue;
      }

      const message = applyWhatsappTemplatePlaceholders(templateRaw, {
        lead: { name: student.name, scheduledDate: null, scheduledTime: null },
        academyName,
      });

      const z = await sendZapsterText({
        recipient: phone,
        text: message,
        instanceId: inst,
        proactive: true,
        academyId: academy.$id,
        leadId: studentId,
        leadDoc: raw,
      });

      if (!z?.ok) {
        if (z?.skipped === 'no_recent_interaction') {
          skipped += 1;
          details.push({ studentId, skipped: 'no_recent_interaction' });
          continue;
        }
        errors += 1;
        details.push({ studentId, erro: z?.erro || 'zapster' });
        continue;
      }

      sent += 1;
      const nowIso = new Date().toISOString();
      try {
        await recordWhatsappTemplateSent({
          academyId: academy.$id,
          leadId: studentId,
          templateKey,
          automationKey,
          createdBy: 'cron',
        });
      } catch {
        void 0;
      }
      try {
        await databases.updateDocument(dbId, STUDENTS_COL, studentId, {
          last_retention_automation_at: nowIso,
          retention_automation_anchor: anchor || nowIso,
        });
      } catch (e) {
        console.warn('[cron-attendance-retention] enviado mas falhou persistência', studentId, e?.message);
      }
    }
  }

  return { sent, skipped, errors, details };
}
