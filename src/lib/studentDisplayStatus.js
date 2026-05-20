import { isFreezeActive } from '../../lib/planFreezeCore.js';
import { isInactiveStudent } from './studentStatus.js';

/**
 * Status de exibição na listagem e no perfil.
 * @returns {'ativo'|'trancado'|'inativo'|'pendente'|'pago'|null}
 */
export function resolveStudentListStatus(student, paymentHint = null) {
  if (!student) return null;
  if (isInactiveStudent(student)) return 'inativo';
  if (isFreezeActive(student) || String(student.freeze_status || '') === 'active') return 'trancado';

  const pay = paymentHint || student._paymentStatus;
  if (pay) {
    const key = String(pay.key || pay.status || '').toLowerCase();
    if (key === 'pending' || key === 'partial' || key === 'awaiting') return 'pendente';
    if (key === 'paid') return 'pago';
  }
  return 'ativo';
}

export const STUDENT_STATUS_BADGE_LABELS = {
  ativo: 'Ativo',
  trancado: 'Trancado',
  inativo: 'Inativo',
  pendente: 'Pendente',
  pago: 'Em dia',
};
