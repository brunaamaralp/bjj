import { describe, it, expect } from 'vitest';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import {
  areTemplatesCustomized,
  computeAutomacoesWizardState,
  getCompactWizardContent,
  isAutomacoesWizardStepDone,
  isModelosWizardStepDone,
  resolveWizardCtaLabel,
  resolveWizardSurface,
  shouldShowSetupWizardOnTab,
  automacoesWizardDismissStorageKey,
  automacoesModelosAckStorageKey,
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
      isAutomacoesWizardStepDone('configuracoes', {
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
    const step = { tab: 'modelos', ctaLabel: 'Abrir Modelos de Mensagem' };
    expect(resolveWizardCtaLabel(step, 'modelos')).toBe('Continuar aqui');
    expect(resolveWizardCtaLabel(step, 'configuracoes')).toBe('Abrir Modelos de Mensagem');
  });

  it('tabForWizardStep mapeia passo externo para modelos', () => {
    expect(tabForWizardStep('whatsapp')).toBe('modelos');
    expect(tabForWizardStep('configuracoes')).toBe('configuracoes');
  });

  it('resolveWizardSurface — processos + whatsapp → compact', () => {
    const whatsappStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'whatsapp');
    expect(
      resolveWizardSurface({
        currentStep: whatsappStep,
        activeTab: 'processos',
        wizardShow: true,
      })
    ).toBe('compact');
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

  it('resolveWizardSurface — ?wizard=1 força full em processos', () => {
    const whatsappStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'whatsapp');
    expect(
      resolveWizardSurface({
        currentStep: whatsappStep,
        activeTab: 'processos',
        forceWizard: true,
        wizardShow: true,
      })
    ).toBe('full');
  });

  it('shouldShowSetupWizardOnTab compatível com resolveWizardSurface', () => {
    const modelosStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'modelos');
    const whatsappStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'whatsapp');
    expect(shouldShowSetupWizardOnTab(modelosStep, 'modelos')).toBe(true);
    expect(shouldShowSetupWizardOnTab(modelosStep, 'configuracoes')).toBe(false);
    expect(shouldShowSetupWizardOnTab(whatsappStep, 'configuracoes')).toBe(true);
    expect(shouldShowSetupWizardOnTab(whatsappStep, 'processos')).toBe(true);
  });

  it('getCompactWizardContent por passo', () => {
    expect(getCompactWizardContent('whatsapp').message).toContain('WhatsApp');
    expect(getCompactWizardContent('modelos').ctaLabel).toBe('Continuar configuração');
  });
});
