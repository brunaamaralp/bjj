import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';

/** Passos do guia inicial em /automacoes (P3). */
export const AUTOMACOES_WIZARD_STEPS = [
  {
    id: 'modelos',
    label: 'Modelos',
    title: 'Personalize os textos',
    description: 'Revise as mensagens que o funil envia automaticamente no WhatsApp.',
    tab: 'modelos',
    ctaLabel: 'Abrir Modelos de Mensagem',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    title: 'Conecte o WhatsApp',
    description: 'O envio automático só funciona com o número conectado no Agente IA.',
    path: '/agente-ia',
    ctaLabel: 'Ir para Agente IA',
  },
  {
    id: 'configuracoes',
    label: 'Gatilhos',
    title: 'Ative os gatilhos',
    description: 'Ligue só os envios que sua academia precisa — você pode mudar depois.',
    tab: 'configuracoes',
    ctaLabel: 'Ir para Configurações',
  },
];

export function automacoesWizardDismissStorageKey(academyId) {
  return `navi_automacoes_wizard_dismissed_${String(academyId || '').trim()}`;
}

export function automacoesModelosVisitedStorageKey(academyId) {
  return `navi_automacoes_modelos_visited_${String(academyId || '').trim()}`;
}

export function readAutomacoesModelosVisited(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(automacoesModelosVisitedStorageKey(academyId)) === '1';
  } catch {
    return false;
  }
}

export function writeAutomacoesModelosVisited(academyId) {
  if (!academyId) return;
  try {
    localStorage.setItem(automacoesModelosVisitedStorageKey(academyId), '1');
  } catch {
    void 0;
  }
}

export function clearAutomacoesWizardDismissed(academyId) {
  if (!academyId) return;
  try {
    localStorage.removeItem(automacoesWizardDismissStorageKey(academyId));
  } catch {
    void 0;
  }
}

/** Exibe o guia na aba do passo atual; passos externos (WhatsApp) aparecem em qualquer aba. */
export function shouldShowSetupWizardOnTab(currentStep, activeTab) {
  if (!currentStep) return false;
  if (currentStep.path) return true;
  return currentStep.tab === activeTab;
}

/** True quando pelo menos um modelo difere do texto padrão do sistema. */
export function areTemplatesCustomized(templatesMap) {
  const map = templatesMap && typeof templatesMap === 'object' ? templatesMap : {};
  for (const key of Object.keys(DEFAULT_WHATSAPP_TEMPLATES)) {
    const cur = String(map[key] ?? '').trim();
    const def = String(DEFAULT_WHATSAPP_TEMPLATES[key] ?? '').trim();
    if (cur !== def) return true;
  }
  return false;
}

export function isModelosWizardStepDone({ templatesMap, modelosTabVisited }) {
  return areTemplatesCustomized(templatesMap) || Boolean(modelosTabVisited);
}

export function isAutomacoesWizardStepDone(
  stepId,
  { templatesMap, modelosTabVisited, zapsterOk, activeCount }
) {
  switch (String(stepId || '').trim()) {
    case 'modelos':
      return isModelosWizardStepDone({ templatesMap, modelosTabVisited });
    case 'whatsapp':
      return Boolean(zapsterOk);
    case 'configuracoes':
      return Number(activeCount) > 0;
    default:
      return false;
  }
}

export function resolveWizardCtaLabel(step, activeTab) {
  if (!step) return '';
  if (step.tab && step.tab === activeTab) return 'Continuar aqui';
  return step.ctaLabel || '';
}

/**
 * @param {{
 *   templatesMap?: Record<string, string>;
 *   modelosTabVisited?: boolean;
 *   zapsterOk?: boolean;
 *   activeCount?: number;
 *   dismissed?: boolean;
 * }} snapshot
 */
export function computeAutomacoesWizardState(snapshot = {}) {
  const {
    templatesMap,
    modelosTabVisited = false,
    zapsterOk,
    activeCount = 0,
    dismissed = false,
  } = snapshot;
  const steps = AUTOMACOES_WIZARD_STEPS.map((def) => ({
    ...def,
    done: isAutomacoesWizardStepDone(def.id, {
      templatesMap,
      modelosTabVisited,
      zapsterOk,
      activeCount,
    }),
  }));
  const allComplete = steps.every((s) => s.done);
  const show = !dismissed && !allComplete;
  const currentStep = steps.find((s) => !s.done) || steps[steps.length - 1];
  const currentStepId = currentStep?.id || AUTOMACOES_WIZARD_STEPS[0].id;
  const doneCount = steps.filter((s) => s.done).length;

  return {
    show,
    steps,
    currentStepId,
    currentStep,
    allComplete,
    doneCount,
    totalSteps: steps.length,
  };
}
