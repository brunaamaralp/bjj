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

export function studentStatusRaw(lead) {
  return lead?.studentStatus ?? lead?.student_status ?? '';
}

export function isStudentRecord(lead) {
  if (!lead) return false;
  if (lead._isStudent === true) return true;
  if (String(studentStatusRaw(lead)).trim()) return true;
  return (
    String(lead?.status || '').trim() === 'Matriculado' ||
    String(lead?.contact_type || '').trim() === 'student'
  );
}

export function isActiveStudent(lead) {
  if (!isStudentRecord(lead)) return false;
  return normalizeStudentStatus(studentStatusRaw(lead)) === STUDENT_STATUS.ACTIVE;
}

export function isInactiveStudent(lead) {
  if (!isStudentRecord(lead)) return false;
  return normalizeStudentStatus(studentStatusRaw(lead)) === STUDENT_STATUS.INACTIVE;
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

/** Filtra itens da listagem paginada (já mapeados com studentStatus). */
export function filterMappedStudentsByListStatus(items, studentStatus) {
  if (studentStatus === 'all') return items || [];
  if (studentStatus === STUDENT_STATUS.INACTIVE) {
    return (items || []).filter((item) => normalizeStudentStatus(item?.studentStatus) === STUDENT_STATUS.INACTIVE);
  }
  return (items || []).filter((item) => normalizeStudentStatus(item?.studentStatus) !== STUDENT_STATUS.INACTIVE);
}
