const ACTIVE_STUDENT_KEY = 'portal_active_student_id';
const ACTIVE_ACADEMY_KEY = 'portal_active_academy_id';

export function getPortalActiveStudentId() {
  try {
    return String(sessionStorage.getItem(ACTIVE_STUDENT_KEY) || '').trim() || null;
  } catch {
    return null;
  }
}

export function setPortalActiveStudentId(studentId) {
  try {
    const id = String(studentId || '').trim();
    if (id) sessionStorage.setItem(ACTIVE_STUDENT_KEY, id);
    else sessionStorage.removeItem(ACTIVE_STUDENT_KEY);
  } catch {
    void 0;
  }
}

export function getPortalActiveAcademyId() {
  try {
    return String(sessionStorage.getItem(ACTIVE_ACADEMY_KEY) || '').trim() || null;
  } catch {
    return null;
  }
}

export function setPortalActiveAcademyId(academyId) {
  try {
    const id = String(academyId || '').trim();
    if (id) sessionStorage.setItem(ACTIVE_ACADEMY_KEY, id);
    else sessionStorage.removeItem(ACTIVE_ACADEMY_KEY);
  } catch {
    void 0;
  }
}

export function clearPortalSession() {
  setPortalActiveStudentId(null);
  setPortalActiveAcademyId(null);
}

/**
 * Resolve aluno ativo a partir do contexto portal.
 * @param {{ students?: Array<{id:string}>, active_student_id?: string }} context
 */
export function resolveActiveStudentFromContext(context) {
  const students = Array.isArray(context?.students) ? context.students : [];
  const stored = getPortalActiveStudentId();
  if (stored && students.some((s) => s.id === stored)) return stored;
  const fromApi = String(context?.active_student_id || '').trim();
  if (fromApi && students.some((s) => s.id === fromApi)) return fromApi;
  return students[0]?.id || null;
}

export function isPortalOnlyPath(pathname = '') {
  return /^\/portal(\/|$)/.test(String(pathname || ''));
}

export function isPublicPortalPath(pathname = '') {
  const p = String(pathname || '');
  return (
    p === '/portal/login' ||
    p === '/portal/esqueci-senha' ||
    /^\/portal\/ativar\//.test(p)
  );
}
