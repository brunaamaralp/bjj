import { databases, DB_ID, LEADS_COL, STUDENTS_COL } from './appwrite.js';
import { buildStudentPayloadFromDoc } from './leadStudentPayload.js';
import { mapAppwriteDocToStudent } from './mapAppwriteStudentDoc.js';
import { useLeadStore } from '../store/useLeadStore.js';
import { useStudentStore } from '../store/useStudentStore.js';

/**
 * Move lead → students (mesmo $id). Remove doc de leads.
 *
 * Após a migração, a fonte de verdade do cadastro é a coleção students
 * (nome, telefone e demais campos vivem só no documento de aluno).
 *
 * @param {object} opts
 * @param {string} opts.leadId
 * @param {object} [opts.lead] — objeto UI; se omitido, busca no store ou Appwrite
 * @param {object} [opts.overrides] — campos extras (plan, customAnswers, etc.)
 * @param {string[]} [opts.permissions] — permissões do documento
 */
export async function moveLeadToStudent({ leadId, lead = null, overrides = {}, permissions = [] }) {
  const id = String(leadId || '').trim();
  if (!id) throw new Error('lead_missing');
  if (!STUDENTS_COL) throw new Error('students_collection_not_configured');

  let source = lead;
  if (!source) {
    source = useLeadStore.getState().getLeadById(id);
  }
  if (!source) {
    try {
      const raw = await databases.getDocument(DB_ID, LEADS_COL, id);
      source = { id: raw.$id, ...raw };
    } catch {
      throw new Error('lead_not_found');
    }
  }

  const academyId = String(
    overrides.academyId ||
      overrides.academy_id ||
      source.academyId ||
      source.academy_id ||
      useLeadStore.getState().academyId ||
      ''
  ).trim();
  const payload = buildStudentPayloadFromDoc(source, {
    ...overrides,
    ...(academyId ? { academyId } : {}),
  });
  const perms = permissions.length ? permissions : undefined;

  await databases.createDocument(DB_ID, STUDENTS_COL, id, payload, perms);

  try {
    await databases.deleteDocument(DB_ID, LEADS_COL, id);
  } catch (delErr) {
    console.error('[moveLeadToStudent] delete lead failed after student create:', delErr);
    try {
      await databases.deleteDocument(DB_ID, STUDENTS_COL, id);
    } catch (rollbackErr) {
      console.error('[moveLeadToStudent] rollback student failed', { id, rollbackErr });
    }
    throw new Error('enrollment_rollback_failed');
  }

  const studentUi = mapAppwriteDocToStudent({ $id: id, ...payload, $createdAt: source.createdAt });
  const merged = { ...studentUi, ...overrides, id };

  useLeadStore.setState((state) => ({
    leads: state.leads.filter((l) => l.id !== id),
  }));
  useStudentStore.setState((state) => ({
    students: [merged, ...state.students.filter((s) => s.id !== id)],
  }));

  return merged;
}
