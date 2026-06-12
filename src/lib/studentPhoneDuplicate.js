export {
  normalizePhoneDedup,
  normalizeNameDedup,
  namesMatchForDedup,
  findLocalStudentByPhone,
  findLocalLeadByPhone,
} from './studentPhoneDedup.js';
import { isActiveStudent } from './studentStatus.js';
import { apiFindStudentsByPhone } from './studentsApi.js';
import {
  findLocalStudentByPhone,
  namesMatchForDedup,
  normalizePhoneDedup,
} from './studentPhoneDedup.js';

function recordMatchesPhoneAndName(record, phone, name) {
  const compareName = String(name || '').trim();
  if (compareName.length < 2) return false;
  if (normalizePhoneDedup(record?.phone) !== normalizePhoneDedup(phone)) return false;
  return namesMatchForDedup(record?.name, compareName);
}

/**
 * Busca aluno ativo com o mesmo telefone (store local + API para órfãos/fora da página).
 */
export async function findActiveStudentByPhone({
  phone,
  name = '',
  academyId,
  students = [],
  excludeStudentId = '',
}) {
  const local = findLocalStudentByPhone(students, phone, { excludeId: excludeStudentId, name });
  if (local) return { source: 'local', student: local };

  const aid = String(academyId || '').trim();
  if (!aid || normalizePhoneDedup(phone).length < 8) return null;
  if (String(name || '').trim().length < 2) return null;

  try {
    const matches = await apiFindStudentsByPhone(phone, aid);
    for (const m of matches) {
      const s = m?.student;
      const id = String(s?.id || m?.id || '').trim();
      if (!id || (excludeStudentId && id === excludeStudentId)) continue;
      if (!recordMatchesPhoneAndName(s, phone, name)) continue;
      if (!isActiveStudent(s)) continue;
      return { source: 'api', student: s };
    }
  } catch {
    void 0;
  }
  return null;
}

export function studentPhoneDuplicateError(student) {
  const name = String(student?.name || 'outro aluno').trim() || 'outro aluno';
  const err = new Error(`phone_duplicate_active:${name}`);
  err.code = 'phone_duplicate';
  return err;
}
