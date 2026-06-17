/** Wizard e tour da aba Conciliação (primeiro uso). */

export const RECON_WIZARD_STEPS = [
  {
    id: 'import',
    label: 'Importar',
    title: 'Importe seu extrato bancário',
    description:
      'Envie OFX, CSV, Excel ou PDF do banco. O Nave sugere vínculos com lançamentos já liquidados no Caixa.',
    ctaLabel: 'Importar extrato',
    action: 'openImport',
  },
  {
    id: 'review',
    label: 'Revisar',
    title: 'Confira as sugestões automáticas',
    description:
      'Linhas com boa correspondência aparecem em destaque. Você pode confirmar uma a uma ou em lote.',
    ctaLabel: 'Entendi',
    action: 'advance',
  },
  {
    id: 'link',
    label: 'Vincular',
    title: 'Clique na linha → vincule à direita',
    description:
      'Para pendências sem sugestão, selecione a linha do extrato e escolha o lançamento Nave na coluna ao lado.',
    ctaLabel: 'Entendi',
    action: 'advance',
  },
  {
    id: 'finish',
    label: 'Finalizar',
    title: 'Feche o período com segurança',
    description:
      'Quando todas as linhas estiverem tratadas, revise a prova de saldo e finalize a conciliação.',
    ctaLabel: 'Começar',
    action: 'dismiss',
  },
];

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

export function reconWizardDismissKey(academyId) {
  return `navi_recon_wizard_dismissed_${String(academyId || '').trim()}`;
}

export function reconTourSeenKey(academyId) {
  return `navi_recon_tour_seen_${String(academyId || '').trim()}`;
}

export function readReconWizardDismissed(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(reconWizardDismissKey(academyId)) === '1';
  } catch {
    return false;
  }
}

export function writeReconWizardDismissed(academyId) {
  if (!academyId) return;
  try {
    localStorage.setItem(reconWizardDismissKey(academyId), '1');
  } catch {
    void 0;
  }
}

export function clearReconWizardDismissed(academyId) {
  if (!academyId) return;
  try {
    localStorage.removeItem(reconWizardDismissKey(academyId));
  } catch {
    void 0;
  }
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
 * @param {{ statementsCount: number, dismissed: boolean, forceWizard?: boolean, hasImported?: boolean }} opts
 */
export function computeReconWizardState({ statementsCount = 0, dismissed = false, forceWizard = false, hasImported = false } = {}) {
  const steps = RECON_WIZARD_STEPS.map((step) => {
    let done = false;
    if (step.id === 'import') done = statementsCount > 0 || hasImported;
    return { ...step, done };
  });

  const doneCount = steps.filter((s) => s.done).length;
  const show = !dismissed && !forceWizard ? statementsCount === 0 : forceWizard && !dismissed;
  const currentStep = steps.find((s) => !s.done) || steps[steps.length - 1];

  return {
    steps,
    currentStep,
    doneCount,
    totalSteps: steps.length,
    show: forceWizard ? !dismissed : show && statementsCount === 0 && !dismissed,
    canReopen: dismissed && statementsCount === 0,
  };
}

/**
 * @param {{ inDetail: boolean, tourSeen: boolean, forceTour?: boolean }} opts
 */
export function shouldShowReconTour({ inDetail = false, tourSeen = false, forceTour = false } = {}) {
  if (!inDetail) return false;
  if (forceTour) return true;
  return !tourSeen;
}
