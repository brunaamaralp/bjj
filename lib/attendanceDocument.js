/**
 * Payloads para a coleção `attendance` no Appwrite.
 * Somente atributos existentes no schema — sem portal_id / event_type legados do Control iD.
 */

function personIdFromData(data) {
  return String(data?.lead_id || data?.student_id || data?.leadId || data?.studentId || '').trim();
}

/**
 * Check-in manual (perfil do aluno, NL, etc.).
 * @param {object} data
 * @returns {object}
 */
export function buildManualAttendanceDocument(data) {
  const personId = personIdFromData(data);
  const academy_id = String(data?.academy_id || '').trim();
  if (!personId || !academy_id) {
    throw new Error('Dados de presença incompletos.');
  }
  return {
    student_id: personId,
    academy_id,
    checked_in_at: new Date().toISOString(),
    checked_in_by: String(data.checked_in_by || 'user').trim().slice(0, 128),
    checked_in_by_name: String(data.checked_in_by_name || 'Usuário').trim().slice(0, 128) || 'Usuário',
    source: 'manual',
  };
}

/**
 * Registro importado do equipamento Control iD (API server-side).
 * @param {{ academyId: string; student: { $id: string; name?: string }; log: { id?: unknown; user_id?: unknown; time: number } }} opts
 */
export function buildControlIdAttendanceDocument({ academyId, student, log }) {
  const doc = {
    academy_id: academyId,
    student_id: student.$id,
    checked_in_at: new Date(Number(log.time) * 1000).toISOString(),
  };
  const name = String(student.name || '').trim();
  if (name) doc.student_name = name.slice(0, 256);
  if (log?.id != null && String(log.id) !== '') doc.device_log_id = String(log.id);
  if (log?.user_id != null && String(log.user_id) !== '') doc.device_user_id = String(log.user_id);
  return doc;
}
