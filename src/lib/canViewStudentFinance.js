import { useLeadStore } from '../store/useLeadStore.js';

/**
 * Financeiro no perfil do aluno: apenas titular da academia (owner).
 * Membros do time (recepcionista) não veem valores, histórico de pagamentos nem vendas.
 */
export function canViewStudentFinance(userId, academyDoc) {
  if (!academyDoc || !userId) return false;
  return String(academyDoc.ownerId || '').trim() === String(userId || '').trim();
}

export function useCanViewStudentFinance() {
  const userId = useLeadStore((s) => s.userId);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = (academyList || []).find((a) => a.id === academyId) || null;
  return canViewStudentFinance(userId, academyDoc);
}
