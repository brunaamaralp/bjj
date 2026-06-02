import { DEFAULT_OVERDUE_LABEL, parseOverdueLabel } from './collectionRules.js';

export function readStudentOverdueFlag(student) {
  return student?.overdue === true;
}

export function readStudentOverdueLabel(student) {
  const fromDoc = String(student?.overdueLabel ?? student?.overdue_label ?? '').trim();
  if (fromDoc) return fromDoc;
  return '';
}

/** Texto do badge: rótulo do aluno ou fallback da academia / padrão. */
export function resolveStudentOverdueBadgeLabel(student, financeConfig) {
  const fromStudent = readStudentOverdueLabel(student);
  if (fromStudent) return fromStudent;
  const fromAcademy = parseOverdueLabel(
    financeConfig?.overdueLabel ?? financeConfig?.overdue_label ?? DEFAULT_OVERDUE_LABEL
  );
  return fromAcademy || DEFAULT_OVERDUE_LABEL;
}
