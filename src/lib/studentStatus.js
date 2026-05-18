/** Status operacional do aluno (pós-matrícula). Distinto de status do funil (lead). */

export const STUDENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

export function normalizeStudentStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === STUDENT_STATUS.INACTIVE) return STUDENT_STATUS.INACTIVE;
  return STUDENT_STATUS.ACTIVE;
}

export function isStudentRecord(lead) {
  if (!lead) return false;
  return (
    String(lead?.status || '').trim() === 'Matriculado' ||
    String(lead?.contact_type || '').trim() === 'student'
  );
}

export function isActiveStudent(lead) {
  if (!isStudentRecord(lead)) return false;
  return normalizeStudentStatus(lead?.studentStatus) === STUDENT_STATUS.ACTIVE;
}

export function isInactiveStudent(lead) {
  if (!isStudentRecord(lead)) return false;
  return normalizeStudentStatus(lead?.studentStatus) === STUDENT_STATUS.INACTIVE;
}

export function filterActiveStudents(leads) {
  return (leads || []).filter((l) => isStudentRecord(l) && isActiveStudent(l));
}

export function filterStudentsByStatus(leads, showInactive) {
  return (leads || []).filter((l) => {
    if (!isStudentRecord(l)) return false;
    return showInactive ? isInactiveStudent(l) : isActiveStudent(l);
  });
}
