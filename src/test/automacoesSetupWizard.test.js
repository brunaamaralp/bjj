import { describe, it, expect } from 'vitest';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import {
  areTemplatesCustomized,
  automacoesModelosAckStorageKey,
  clearAutomacoesScopeBannerDismissed,
  isModelosWizardStepDone,
  readAutomacoesScopeBannerDismissed,
  writeAutomacoesScopeBannerDismissed,
} from '../lib/automacoesSetupWizard.js';

describe('automacoesSetupWizard', () => {
  it('storage key é por academia', () => {
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

  it('scope banner dismiss por academia', () => {
    const aid = 'ac-test-scope';
    expect(readAutomacoesScopeBannerDismissed(aid)).toBe(false);
    writeAutomacoesScopeBannerDismissed(aid, true);
    expect(readAutomacoesScopeBannerDismissed(aid)).toBe(true);
    clearAutomacoesScopeBannerDismissed(aid);
    expect(readAutomacoesScopeBannerDismissed(aid)).toBe(false);
  });
});
