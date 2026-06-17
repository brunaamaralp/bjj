import { describe, it, expect } from 'vitest';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import {
  areTemplatesCustomized,
  computeAutomacoesWizardState,
  computeWizardProgressPercent,
  isAutomacoesWizardStepDone,
  isModelosWizardStepDone,
  resolveWizardCtaLabel,
  resolveWizardSurface,
  shouldShowSetupWizardOnTab,
  resolveWizardPrimaryDisabled,
  automacoesWizardDismissStorageKey,
  automacoesModelosAckStorageKey,
  readAutomacoesScopeBannerDismissed,
  writeAutomacoesScopeBannerDismissed,
  clearAutomacoesScopeBannerDismissed,
  tabForWizardStep,
  AUTOMACOES_WIZARD_STEPS,
} from '../lib/automacoesSetupWizard.js';

describe('automacoesSetupWizard', () => {
  it('storage key é por academia', () => {
    expect(automacoesWizardDismissStorageKey('abc')).toContain('abc');
    expect(automacoesModelosAckStorageKey('abc')).toContain('abc');
  });

  it('modelos não conclui só com templates padrão', () => {
    expect(
      isModelosWizardStepDone({
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosAcknowledged: false,
      })
    ).toBe(false);
  });

  it('modelos conclui após ack explícito ou customizar', () => {
    expect(
      isModelosWizardStepDone({
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosAcknowledged: true,
      })
    ).toBe(true);
    expect(
      areTemplatesCustomized({
        ...DEFAULT_WHATSAPP_TEMPLATES,
        confirm: 'Texto personalizado',
      })
    ).toBe(true);
  });

  it('modelos não conclui só por visitar aba (legado)', () => {
    expect(
      isModelosWizardStepDone({
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosTabVisited: true,
      })
    ).toBe(false);
  });

  it('passos whatsapp e gatilhos', () => {
    expect(
      isAutomacoesWizardStepDone('whatsapp', {
        templatesMap: DEFAULT_WHATSAPP_TEMPLATES,
        modelosAcknowledged: true,
        zapsterOk: true,
        activeCount: 0,
      })
    ).toBe(true);
    expect(
      isAutomacoesWizardStepDone('gatilhos', {
        templatesMap: DEFAULT_WHATSAPP_TEMPLATES,
        modelosAcknowledged: true,
        zapsterOk: true,
        activeCount: 2,
      })
    ).toBe(true);
  });

  it('mostra guia quando incompleto e não dispensado', () => {
    const state = computeAutomacoesWizardState({
      templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
      modelosAcknowledged: false,
      zapsterOk: false,
      activeCount: 0,
      dismissed: false,
    });
    expect(state.show).toBe(true);
    expect(state.currentStepId).toBe('modelos');
  });

  it('oculta guia quando dispensado', () => {
    const state = computeAutomacoesWizardState({
      templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
      modelosAcknowledged: false,
      zapsterOk: false,
      activeCount: 0,
      dismissed: true,
    });
    expect(state.show).toBe(false);
  });

  it('oculta guia quando todos os passos concluídos', () => {
    const state = computeAutomacoesWizardState({
      templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES, confirm: 'Olá custom' },
      modelosAcknowledged: true,
      zapsterOk: true,
      activeCount: 1,
      dismissed: false,
    });
    expect(state.allComplete).toBe(true);
    expect(state.show).toBe(false);
  });

  it('avança passo atual para whatsapp após modelos', () => {
    const state = computeAutomacoesWizardState({
      templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
      modelosAcknowledged: true,
      zapsterOk: false,
      activeCount: 0,
      dismissed: false,
    });
    expect(state.currentStepId).toBe('whatsapp');
  });

  it('resolveWizardCtaLabel contextual', () => {
    const step = { tab: 'modelos', ctaLabel: 'Abrir Modelos' };
    expect(resolveWizardCtaLabel(step, 'modelos')).toBe('Continuar aqui');
    expect(resolveWizardCtaLabel(step, 'gatilhos')).toBe('Abrir Modelos');
  });

  it('tabForWizardStep mapeia passo externo para modelos', () => {
    expect(tabForWizardStep('whatsapp')).toBe('modelos');
    expect(tabForWizardStep('gatilhos')).toBe('gatilhos');
    expect(tabForWizardStep('unknown')).toBe('modelos');
  });

  it('resolveWizardSurface — modelos + passo modelos → full', () => {
    const modelosStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'modelos');
    expect(
      resolveWizardSurface({
        currentStep: modelosStep,
        activeTab: 'modelos',
        wizardShow: true,
      })
    ).toBe('full');
  });

  it('resolveWizardSurface — gatilhos oculto em modelos', () => {
    const gatilhosStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'gatilhos');
    expect(
      resolveWizardSurface({
        currentStep: gatilhosStep,
        activeTab: 'modelos',
        wizardShow: true,
      })
    ).toBe('hidden');
  });

  it('resolveWizardSurface — ?wizard=1 força full', () => {
    const gatilhosStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'gatilhos');
    expect(
      resolveWizardSurface({
        currentStep: gatilhosStep,
        activeTab: 'modelos',
        forceWizard: true,
        wizardShow: true,
      })
    ).toBe('full');
  });

  it('shouldShowSetupWizardOnTab compatível com resolveWizardSurface', () => {
    const modelosStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'modelos');
    const whatsappStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'whatsapp');
    expect(shouldShowSetupWizardOnTab(modelosStep, 'modelos')).toBe(true);
    expect(shouldShowSetupWizardOnTab(modelosStep, 'gatilhos')).toBe(false);
    expect(shouldShowSetupWizardOnTab(whatsappStep, 'gatilhos')).toBe(true);
    expect(shouldShowSetupWizardOnTab(whatsappStep, 'modelos')).toBe(true);
  });

  it('passo gatilhos usa label Ativar gatilhos', () => {
    const step = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'gatilhos');
    expect(step?.label).toBe('Ativar gatilhos');
    expect(step?.tab).toBe('gatilhos');
  });

  it('scope banner dismiss por academia', () => {
    const aid = 'ac-test-scope';
    expect(readAutomacoesScopeBannerDismissed(aid)).toBe(false);
    writeAutomacoesScopeBannerDismissed(aid, true);
    expect(readAutomacoesScopeBannerDismissed(aid)).toBe(true);
    clearAutomacoesScopeBannerDismissed(aid);
    expect(readAutomacoesScopeBannerDismissed(aid)).toBe(false);
  });

  it('resolveWizardPrimaryDisabled bloqueia passo modelos sem ack', () => {
    const modelosStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'modelos');
    expect(
      resolveWizardPrimaryDisabled(modelosStep, {
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosAcknowledged: false,
      })
    ).toBe(true);
    expect(
      resolveWizardPrimaryDisabled(modelosStep, {
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosAcknowledged: true,
      })
    ).toBe(false);
  });

  it('resolveWizardPrimaryDisabled ignora outros passos', () => {
    const whatsappStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'whatsapp');
    expect(
      resolveWizardPrimaryDisabled(whatsappStep, {
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosAcknowledged: false,
      })
    ).toBe(false);
  });

  it('computeWizardProgressPercent usa posição do passo atual', () => {
    const steps = AUTOMACOES_WIZARD_STEPS;
    expect(computeWizardProgressPercent(steps, 'modelos', 3)).toEqual({
      percent: 33,
      value: 1,
      max: 3,
    });
    expect(computeWizardProgressPercent(steps, 'whatsapp', 3)).toEqual({
      percent: 67,
      value: 2,
      max: 3,
    });
    expect(computeWizardProgressPercent(steps, 'gatilhos', 3)).toEqual({
      percent: 100,
      value: 3,
      max: 3,
    });
  });
});
