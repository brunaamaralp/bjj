import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { AUTOMACOES_COPY } from './automacoesCopy.js';

/** Passos do guia inicial em /automacoes. */
export const AUTOMACOES_WIZARD_STEPS = [
  {
    id: 'modelos',
    label: AUTOMACOES_COPY.wizard.step.modelos,
    title: AUTOMACOES_COPY.wizard.modelos.title,
    description: AUTOMACOES_COPY.wizard.modelos.description,
    tab: 'modelos',
    ctaLabel: AUTOMACOES_COPY.wizard.modelos.ctaLabel,
  },
  {
    id: 'whatsapp',
    label: AUTOMACOES_COPY.wizard.step.whatsapp,
    title: AUTOMACOES_COPY.wizard.whatsapp.title,
    description: AUTOMACOES_COPY.wizard.whatsapp.description,
    path: '/agente-ia',
    ctaLabel: AUTOMACOES_COPY.wizard.whatsapp.ctaLabel,
    ctaHint: AUTOMACOES_COPY.wizard.whatsapp.ctaHint,
    external: true,
  },
  {
    id: 'configuracoes',
    label: AUTOMACOES_COPY.wizard.step.configuracoes,
    title: AUTOMACOES_COPY.wizard.configuracoes.title,
    description: AUTOMACOES_COPY.wizard.configuracoes.description,
    tab: 'configuracoes',
    ctaLabel: AUTOMACOES_COPY.wizard.configuracoes.ctaLabel,
  },
];

export function automacoesWizardDismissStorageKey(academyId) {
  return `navi_automacoes_wizard_dismissed_${String(academyId || '').trim()}`;
}

export function automacoesModelosAckStorageKey(academyId) {
  return `navi_automacoes_modelos_ack_${String(academyId || '').trim()}`;
}

/** @deprecated Mantido para migração; não conclui o wizard. */
export function automacoesModelosVisitedStorageKey(academyId) {
  return `navi_automacoes_modelos_visited_${String(academyId || '').trim()}`;
}

export function readAutomacoesModelosAck(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(automacoesModelosAckStorageKey(academyId)) === '1';
  } catch {
    return false;
  }
}

export function writeAutomacoesModelosAck(academyId, acknowledged = true) {
  if (!academyId) return;
  try {
    if (acknowledged) {
      localStorage.setItem(automacoesModelosAckStorageKey(academyId), '1');
    } else {
      localStorage.removeItem(automacoesModelosAckStorageKey(academyId));
    }
  } catch {
    void 0;
  }
}

/** @deprecated */
export function readAutomacoesModelosVisited(academyId) {
  if (!academyId) return false;
  try {
    return localStorage.getItem(automacoesModelosVisitedStorageKey(academyId)) === '1';
  } catch {
    return false;
  }
}

/** @deprecated */
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

/** Aba do hub para um passo do wizard (passos externos → modelos). */
export function tabForWizardStep(stepId) {
  const step = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === stepId);
  if (!step) return 'processos';
  if (step.tab) return step.tab;
  return 'modelos';
}

/**
 * @param {{ currentStep: object; activeTab: string; forceWizard?: boolean; wizardShow?: boolean }}
 * @returns {'hidden' | 'full' | 'compact'}
 */
export function resolveWizardSurface({ currentStep, activeTab, forceWizard = false, wizardShow = true }) {
  if (!wizardShow || !currentStep) return 'hidden';
  if (forceWizard) return 'full';

  if (activeTab === 'processos') return 'compact';

  if (currentStep.path) return 'full';

  if (currentStep.tab === activeTab) return 'full';

  return 'hidden';
}

/** @deprecated Use resolveWizardSurface */
export function shouldShowSetupWizardOnTab(currentStep, activeTab) {
  return resolveWizardSurface({ currentStep, activeTab, wizardShow: true }) !== 'hidden';
}

export function getCompactWizardContent(stepId) {
  const id = String(stepId || '').trim();
  const copy = AUTOMACOES_COPY.wizard.compact;
  if (id === 'modelos') return { message: copy.modelos, ctaLabel: copy.cta };
  if (id === 'whatsapp') return { message: copy.whatsapp, ctaLabel: copy.cta };
  if (id === 'configuracoes') return { message: copy.configuracoes, ctaLabel: copy.cta };
  return { message: '', ctaLabel: copy.cta };
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

export function isModelosWizardStepDone({ templatesMap, modelosAcknowledged }) {
  return areTemplatesCustomized(templatesMap) || Boolean(modelosAcknowledged);
}

export function isAutomacoesWizardStepDone(
  stepId,
  { templatesMap, modelosAcknowledged, zapsterOk, activeCount }
) {
  switch (String(stepId || '').trim()) {
    case 'modelos':
      return isModelosWizardStepDone({ templatesMap, modelosAcknowledged });
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

export function computeWizardProgressPercent(steps, currentStepId, totalSteps) {
  const total = Number(totalSteps) || (Array.isArray(steps) ? steps.length : 0) || 0;
  if (!total) return { percent: 0, value: 0, max: 0 };
  const idx = (steps || []).findIndex((s) => s.id === currentStepId);
  const value = idx >= 0 ? idx + 1 : 0;
  return {
    percent: Math.round((value / total) * 100),
    value,
    max: total,
  };
}

export function isWizardExternalStep(step) {
  return Boolean(step?.path || step?.external);
}

/** Bloqueia CTA primário do passo Modelos até ack ou customização. */
export function resolveWizardPrimaryDisabled(step, { templatesMap, modelosAcknowledged } = {}) {
  if (!step || step.id !== 'modelos') return false;
  return !isModelosWizardStepDone({ templatesMap, modelosAcknowledged });
}

/**
 * @param {{
 *   templatesMap?: Record<string, string>;
 *   modelosAcknowledged?: boolean;
 *   zapsterOk?: boolean;
 *   activeCount?: number;
 *   dismissed?: boolean;
 * }} snapshot
 */
export function computeAutomacoesWizardState(snapshot = {}) {
  const {
    templatesMap,
    modelosAcknowledged = false,
    zapsterOk,
    activeCount = 0,
    dismissed = false,
  } = snapshot;
  const steps = AUTOMACOES_WIZARD_STEPS.map((def) => ({
    ...def,
    done: isAutomacoesWizardStepDone(def.id, {
      templatesMap,
      modelosAcknowledged,
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
