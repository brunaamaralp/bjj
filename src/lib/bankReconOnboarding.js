/** Tour contextual na tela de detalhe da conciliação (primeiro uso). */

export const RECON_TOUR_STEPS = [
  {
    id: 'kpi',
    target: 'kpi',
    title: 'Resumo do extrato',
    description: 'Acompanhe quantas linhas ainda faltam conciliar e o saldo pendente.',
  },
  {
    id: 'extrato',
    target: 'extrato-col',
    title: 'Linhas do extrato',
    description: 'Clique em uma linha pendente para selecioná-la.',
  },
  {
    id: 'lancamentos',
    target: 'lancamentos-col',
    title: 'Lançamentos Nave',
    description: 'Com uma linha selecionada, toque em Vincular no lançamento correspondente.',
  },
  {
    id: 'confirm-all',
    target: 'confirm-all',
    title: 'Confirmar em lote',
    description: 'Quando as sugestões estiverem corretas, confirme todas de uma vez.',
    optional: true,
  },
];

export function reconTourSeenKey(academyId) {
  return `navi_recon_tour_seen_${String(academyId || '').trim()}`;
}

export function readReconTourSeen(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(reconTourSeenKey(academyId)) === '1';
  } catch {
    return false;
  }
}

export function writeReconTourSeen(academyId) {
  if (!academyId) return;
  try {
    localStorage.setItem(reconTourSeenKey(academyId), '1');
  } catch {
    void 0;
  }
}

/**
 * @param {{ inDetail: boolean, tourSeen: boolean, forceTour?: boolean }} opts
 */
export function shouldShowReconTour({ inDetail = false, tourSeen = false, forceTour = false } = {}) {
  if (!inDetail) return false;
  if (forceTour) return true;
  return !tourSeen;
}
