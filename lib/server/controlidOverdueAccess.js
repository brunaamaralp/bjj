/**
 * Bloqueio de catraca para alunos inadimplentes (revoke / re-sync).
 */
import { Client, Databases } from 'node-appwrite';
import { readControlIdConfig, mergeControlIdIntoSettings, resolveControlIdUserId } from '../controlidSettings.js';
import {
  configWithPlainPassword,
  destroyUser,
  syncStudentOnDevice,
} from './controlidService.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

export function isControlIdOverdueBlockConfigured(settings) {
  const cfg = readControlIdConfig(settings);
  return cfg.enabled === true && cfg.block_overdue_access === true;
}

export function shouldDenyOverdueAttendance(config, studentDoc) {
  if (!config?.enabled || !config?.block_overdue_access) return false;
  return studentDoc?.overdue === true;
}

function isActiveStudentDoc(doc) {
  if (STUDENTS_COL) {
    return String(doc?.student_status || '').trim().toLowerCase() !== 'inactive';
  }
  const isStudent =
    String(doc?.status || '').trim() === 'Matriculado' ||
    String(doc?.contact_type || '').trim() === 'student';
  if (!isStudent) return false;
  return String(doc?.student_status || '').trim().toLowerCase() !== 'inactive';
}

async function patchLeadSyncState(leadId, patch) {
  if (STUDENTS_COL) {
    return databases
      .updateDocument(DB_ID, STUDENTS_COL, leadId, patch)
      .catch(() => databases.updateDocument(DB_ID, LEADS_COL, leadId, patch));
  }
  return databases.updateDocument(DB_ID, LEADS_COL, leadId, patch);
}

async function touchControlIdLastSync(academyId, academyDoc) {
  const merged = mergeControlIdIntoSettings(academyDoc?.settings, {
    last_sync: new Date().toISOString(),
  });
  await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
    settings: JSON.stringify(merged),
  });
}

async function loadStudent(leadId) {
  if (STUDENTS_COL) {
    try {
      return await databases.getDocument(DB_ID, STUDENTS_COL, leadId);
    } catch {
      /* legacy */
    }
  }
  return databases.getDocument(DB_ID, LEADS_COL, leadId);
}

async function revokeStudentFromDevice(academyId, academyDoc, studentDoc) {
  const deviceConfig = configWithPlainPassword(academyDoc);
  if (!deviceConfig.configured) return { action: 'not_configured' };

  const userId = resolveControlIdUserId(studentDoc);
  if (!userId) {
    await patchLeadSyncState(studentDoc.$id, { controlid_synced: false });
    return { action: 'skipped_no_user' };
  }

  await destroyUser(deviceConfig, userId);
  await patchLeadSyncState(studentDoc.$id, {
    controlid_synced: false,
    controlid_sync_error: null,
  });
  return { action: 'revoked', userId };
}

async function syncStudentToDevice(academyId, academyDoc, studentDoc) {
  const deviceConfig = configWithPlainPassword(academyDoc);
  if (!deviceConfig.configured) return { action: 'not_configured' };

  const photoUrl = String(studentDoc.photo_url || studentDoc.photoUrl || '').trim();
  if (!photoUrl) return { action: 'skipped_no_photo' };

  const { userId } = await syncStudentOnDevice(deviceConfig, { leadDoc: studentDoc, photoUrl });
  await patchLeadSyncState(studentDoc.$id, {
    controlid_user_id: userId,
    device_id: userId,
    controlid_synced: true,
    controlid_sync_error: null,
  });
  await touchControlIdLastSync(academyId, academyDoc);
  return { action: 'synced', userId };
}

/**
 * Ajusta acesso na catraca conforme flag overdue do aluno.
 * @param {{ academyId: string, academyDoc: object, studentDoc: object }} opts
 */
export async function reconcileControlIdOverdueAccess({ academyId, academyDoc, studentDoc }) {
  if (!isControlIdOverdueBlockConfigured(academyDoc?.settings)) {
    return { action: 'skipped_config' };
  }
  if (!studentDoc?.$id) return { action: 'skipped_no_student' };

  const isOverdue = studentDoc.overdue === true;
  const synced = studentDoc.controlid_synced === true;
  const active = isActiveStudentDoc(studentDoc);
  const photo = String(studentDoc.photo_url || studentDoc.photoUrl || '').trim();

  if (isOverdue && synced) {
    return revokeStudentFromDevice(academyId, academyDoc, studentDoc);
  }

  if (!isOverdue && active && photo && !synced) {
    return syncStudentToDevice(academyId, academyDoc, studentDoc);
  }

  return { action: 'unchanged' };
}

/** Fire-and-forget com reload do aluno após mudança de overdue. */
export function scheduleControlIdOverdueReconcile({ academyId, academyDoc, studentId }) {
  void (async () => {
    try {
      const studentDoc = await loadStudent(studentId);
      await reconcileControlIdOverdueAccess({ academyId, academyDoc, studentDoc });
    } catch (e) {
      console.warn('[controlidOverdue] reconcile', studentId, e?.message || e);
    }
  })();
}
