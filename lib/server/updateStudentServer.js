import { sanitizeStudentUpdatesForNl } from '../studentNlUpdates.js';
import { stripUnknownStudentPatch } from '../../src/lib/studentAppwritePatch.js';
import { assertOrRepairStudentInAcademy } from './studentAcademyRepair.js';
import { addLeadEventServer } from './leadEvents.js';
import { DB_ID, LEADS_COL, STUDENTS_COL } from './appwriteCollections.js';

/**
 * @param {Record<string, string>} sanitized — saída de sanitizeStudentUpdatesForNl
 */
export function nlSanitizedToStudentPatch(sanitized) {
  const patch = {};
  const s = sanitized || {};
  const copy = (k, v) => {
    if (v !== undefined && v !== null && v !== '') patch[k] = v;
  };

  if (s.name) copy('name', s.name);
  if (s.phone) copy('phone', s.phone);
  if (s.type) copy('type', s.type);
  if (s.plan) copy('plan', s.plan);
  if (s.cpf) patch.cpf = s.cpf;
  if (s.responsavel) patch.responsavel = s.responsavel;
  if (s.birthDate) patch.birth_date = s.birthDate;
  if (s.enrollmentDate) patch.enrollmentDate = s.enrollmentDate;
  if (s.parentName) copy('parentName', s.parentName);
  if (s.age) copy('age', s.age);
  if (s.emergencyContact) copy('emergencyContact', s.emergencyContact);
  if (s.emergencyPhone) copy('emergencyPhone', s.emergencyPhone);
  if (s.belt) copy('belt', s.belt);
  if (s.origin) copy('source_origin', s.origin);
  if (s.preferredPaymentMethod) patch.preferred_payment_method = s.preferredPaymentMethod;
  if (s.preferredPaymentAccount) patch.preferred_payment_account = s.preferredPaymentAccount;

  return patch;
}

/**
 * @param {Record<string, string>} sanitized
 */
export function nlSanitizedToLeadPatch(sanitized) {
  const patch = nlSanitizedToStudentPatch(sanitized);
  if (patch.source_origin) {
    patch.origin = patch.source_origin;
    delete patch.source_origin;
  }
  return patch;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} params
 */
export async function updateStudentServer(databases, { academyId, contact, data }) {
  const aid = String(academyId || '').trim();
  const sanitized = sanitizeStudentUpdatesForNl(data || {});
  const patch = nlSanitizedToStudentPatch(sanitized);
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'no_valid_fields' };
  }

  const kind = contact?.kind;
  const id = String(contact?.id || data?.student_id || '').trim();

  try {
    if (kind === 'student' && id && STUDENTS_COL && DB_ID) {
      await assertOrRepairStudentInAcademy(databases, DB_ID, STUDENTS_COL, id, aid);
      let lean = { ...patch };
      try {
        await databases.updateDocument(DB_ID, STUDENTS_COL, id, lean);
      } catch (e) {
        lean = stripUnknownStudentPatch(lean, e?.message);
        await databases.updateDocument(DB_ID, STUDENTS_COL, id, lean);
      }
      await addLeadEventServer({
        academyId: aid,
        leadId: id,
        type: 'student_updated',
        text: 'Cadastro atualizado pela IA',
        createdBy: 'ai-agent',
        payloadJson: { fields: Object.keys(lean) },
      });
      return { ok: true, summary: 'Cadastro do aluno atualizado', entityIds: { student_id: id } };
    }

    if ((kind === 'lead' || id) && LEADS_COL && DB_ID) {
      const leadId = kind === 'lead' ? id : id;
      if (!leadId) return { ok: false, error: 'lead_not_found' };
      const leadPatch = nlSanitizedToLeadPatch(sanitized);
      await databases.updateDocument(DB_ID, LEADS_COL, leadId, leadPatch);
      await addLeadEventServer({
        academyId: aid,
        leadId,
        type: 'lead_updated',
        text: 'Cadastro atualizado pela IA',
        createdBy: 'ai-agent',
        payloadJson: { fields: Object.keys(leadPatch) },
      });
      return { ok: true, summary: 'Cadastro do lead atualizado', entityIds: { lead_id: leadId } };
    }

    return { ok: false, error: 'contact_not_found' };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}
