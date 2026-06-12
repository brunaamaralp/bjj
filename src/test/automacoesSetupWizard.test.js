import { describe, it, expect } from 'vitest';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import {
  areTemplatesCustomized,
  computeAutomacoesWizardState,
  isAutomacoesWizardStepDone,
  isModelosWizardStepDone,
  resolveWizardCtaLabel,
  shouldShowSetupWizardOnTab,
  automacoesWizardDismissStorageKey,
  AUTOMACOES_WIZARD_STEPS,
} from '../lib/automacoesSetupWizard.js';

describe('automacoesSetupWizard', () => {
  it('storage key é por academia', () => {
    expect(automacoesWizardDismissStorageKey('abc')).toContain('abc');
  });

  it('modelos não conclui só com templates padrão', () => {
    expect(
      isModelosWizardStepDone({
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosTabVisited: false,
      })
    ).toBe(false);
  });

  it('modelos conclui após visitar aba ou customizar', () => {
    expect(
      isModelosWizardStepDone({
        templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
        modelosTabVisited: true,
      })
    ).toBe(true);
    expect(
      areTemplatesCustomized({
        ...DEFAULT_WHATSAPP_TEMPLATES,
        confirm: 'Texto personalizado',
      })
    ).toBe(true);
  });

  it('passos whatsapp e gatilhos', () => {
    expect(
      isAutomacoesWizardStepDone('whatsapp', {
        templatesMap: DEFAULT_WHATSAPP_TEMPLATES,
        modelosTabVisited: true,
        zapsterOk: true,
        activeCount: 0,
      })
    ).toBe(true);
    expect(
      isAutomacoesWizardStepDone('configuracoes', {
        templatesMap: DEFAULT_WHATSAPP_TEMPLATES,
        modelosTabVisited: true,
        zapsterOk: true,
        activeCount: 2,
      })
    ).toBe(true);
  });

  it('mostra guia quando incompleto e não dispensado', () => {
    const state = computeAutomacoesWizardState({
      templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES },
      modelosTabVisited: false,
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
      modelosTabVisited: false,
      zapsterOk: false,
      activeCount: 0,
      dismissed: true,
    });
    expect(state.show).toBe(false);
  });

  it('oculta guia quando todos os passos concluídos', () => {
    const state = computeAutomacoesWizardState({
      templatesMap: { ...DEFAULT_WHATSAPP_TEMPLATES, confirm: 'Olá custom' },
      modelosTabVisited: true,
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
      modelosTabVisited: true,
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

  it('shouldShowSetupWizardOnTab por aba do passo', () => {
    const modelosStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'modelos');
    const whatsappStep = AUTOMACOES_WIZARD_STEPS.find((s) => s.id === 'whatsapp');
    expect(shouldShowSetupWizardOnTab(modelosStep, 'modelos')).toBe(true);
    expect(shouldShowSetupWizardOnTab(modelosStep, 'configuracoes')).toBe(false);
    expect(shouldShowSetupWizardOnTab(whatsappStep, 'configuracoes')).toBe(true);
  });
});
