/**
 * Cron mensal: materializa cobranças pending em student_payments para alunos ativos.
 * Agendado: GET /api/cron/reset-usage?action=student-payment-materialize
 * Requer CRON_SECRET.
 */
import { Query } from 'node-appwrite';
import { Client, Databases } from 'node-appwrite';
import { listAcademyStudentDocs } from './listAcademyStudents.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import { isActiveStudent, isStudentRecord } from '../../src/lib/studentStatus.js';
import { referenceMonthSaoPaulo } from '../studentPaymentMaterialization.js';
import { materializeStudentPaymentForMonth } from './studentPaymentMaterializeCore.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function parseFinanceConfig(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function resolveReferenceMonth(override = '') {
  const fromEnv = String(process.env.STUDENT_PAYMENT_MATERIALIZE_MONTH || '').trim();
  const fromParam = String(override || '').trim();
  const candidate = fromParam || fromEnv;
  if (/^\d{4}-\d{2}$/.test(candidate)) return candidate;
  return referenceMonthSaoPaulo();
}

function isActiveStudentDoc(doc) {
  const mapped = mapAppwriteDocToStudent(doc);
  return isStudentRecord(mapped) && isActiveStudent(mapped);
}

/**
 * @param {{ referenceMonth?: string }} [opts]
 */
export async function runStudentPaymentMaterializeCron(opts = {}) {
  if (!DB_ID || !API_KEY || !PROJECT_ID || !ACADEMIES_COL) {
    return { ok: false, skipped: 'not_configured' };
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const referenceMonth = resolveReferenceMonth(opts.referenceMonth);
  const issuedAt = new Date().toISOString();

  const stats = {
    ok: true,
    referenceMonth,
    academies: 0,
    studentsChecked: 0,
    createdPending: 0,
    createdFrozen: 0,
    backfilled: 0,
    upgradedToFrozen: 0,
    skipped: 0,
    errors: 0,
  };

  const academies = await databases.listDocuments(DB_ID, ACADEMIES_COL, [Query.limit(100)]);

  for (const academy of academies.documents || []) {
    stats.academies += 1;
    const academyId = String(academy.$id || '').trim();
    if (!academyId) continue;

    const financeConfig = parseFinanceConfig(academy.financeConfig ?? academy.finance_config);
    const studentDocs = await listAcademyStudentDocs(academyId);

    for (const doc of studentDocs) {
      if (!isActiveStudentDoc(doc)) continue;
      stats.studentsChecked += 1;

      const student = mapAppwriteDocToStudent(doc);
      try {
        const out = await materializeStudentPaymentForMonth({
          databases,
          dbId: DB_ID,
          student,
          academyId,
          financeConfig,
          referenceMonth,
          issuedAt,
        });

        switch (out.action) {
          case 'created_pending':
            stats.createdPending += 1;
            break;
          case 'created_frozen':
            stats.createdFrozen += 1;
            break;
          case 'backfilled_pending':
          case 'backfilled_settled':
            stats.backfilled += 1;
            break;
          case 'upgraded_to_frozen':
            stats.upgradedToFrozen += 1;
            break;
          case 'error':
            stats.errors += 1;
            break;
          default:
            stats.skipped += 1;
        }
      } catch (e) {
        stats.errors += 1;
        console.warn(
          JSON.stringify({
            event: 'student_payment_materialize_student_failed',
            academy_id: academyId,
            lead_id: student?.id,
            reference_month: referenceMonth,
            error: e?.message || String(e),
          })
        );
      }
    }
  }

  console.log(
    JSON.stringify({
      level: 'info',
      action: 'student_payment_materialize_cron',
      ...stats,
    })
  );

  return stats;
}
