import { describe, it, expect } from 'vitest';
import {
  AGENT_ACTIVATE_HINT_DEFAULT,
  AGENT_ACTIVATE_HINT_WA,
  AGENT_PAUSE_CONFIRM_DESCRIPTION,
  AGENT_IA_MODULE_DISABLED_WHILE_ACTIVE_TOAST,
  buildActivateConfirmDescription,
  getAgentActivateHint,
  getAgentHeaderStatusChip,
  getAgentStatusBadgeVariant,
  isAgentActivateDisabled,
  shouldRenderAgentServiceControl,
  shouldShowAgentConfigBanner,
} from '../lib/agentIaServiceControl.js';

describe('agentIaServiceControl', () => {
  it('shouldShowAgentConfigBanner hides when agent is active', () => {
    expect(shouldShowAgentConfigBanner(false)).toBe(true);
    expect(shouldShowAgentConfigBanner(true)).toBe(false);
  });

  it('getAgentStatusBadgeVariant resolves canonical states', () => {
    expect(
      getAgentStatusBadgeVariant({ promptConfigurado: false, iaAtiva: false, waConnected: false })
    ).toBe('unconfigured');
    expect(
      getAgentStatusBadgeVariant({ promptConfigurado: true, iaAtiva: false, waConnected: true })
    ).toBe('ready');
    expect(
      getAgentStatusBadgeVariant({ promptConfigurado: true, iaAtiva: true, waConnected: true })
    ).toBe('active');
    expect(
      getAgentStatusBadgeVariant({ promptConfigurado: true, iaAtiva: true, waConnected: false })
    ).toBe('active-wa-offline');
  });

  it('getAgentActivateHint omits copy when IA module is off', () => {
    expect(getAgentActivateHint({ aiModuleEnabled: false, waConnected: true })).toBe(null);
    expect(getAgentActivateHint({ aiModuleEnabled: true, waConnected: false })).toBe(
      AGENT_ACTIVATE_HINT_WA
    );
    expect(getAgentActivateHint({ aiModuleEnabled: true, waConnected: true })).toBe(
      AGENT_ACTIVATE_HINT_DEFAULT
    );
  });

  it('isAgentActivateDisabled blocks when IA off or WA disconnected', () => {
    expect(
      isAgentActivateDisabled({ togglingIa: false, aiModuleEnabled: false, waConnected: true })
    ).toBe(true);
    expect(
      isAgentActivateDisabled({ togglingIa: false, aiModuleEnabled: true, waConnected: false })
    ).toBe(true);
    expect(
      isAgentActivateDisabled({ togglingIa: false, aiModuleEnabled: true, waConnected: true })
    ).toBe(false);
  });

  it('shouldRenderAgentServiceControl respects guards', () => {
    expect(
      shouldRenderAgentServiceControl({
        canEditPrompt: true,
        promptConfigurado: true,
        panelOpen: false,
      })
    ).toBe(true);
    expect(
      shouldRenderAgentServiceControl({
        canEditPrompt: true,
        promptConfigurado: false,
        panelOpen: false,
      })
    ).toBe(false);
    expect(
      shouldRenderAgentServiceControl({
        canEditPrompt: true,
        promptConfigurado: true,
        panelOpen: true,
      })
    ).toBe(false);
  });

  it('getAgentHeaderStatusChip shows active or paused when configured', () => {
    expect(getAgentHeaderStatusChip({ promptConfigurado: false, iaAtiva: false })).toBe(null);
    expect(getAgentHeaderStatusChip({ promptConfigurado: true, iaAtiva: false })).toEqual({
      label: 'Pausado',
      variant: 'paused',
    });
    expect(getAgentHeaderStatusChip({ promptConfigurado: true, iaAtiva: true })).toEqual({
      label: 'Assistente ativo',
      variant: 'active',
    });
  });

  it('buildActivateConfirmDescription includes phone and thread limit warning', () => {
    const desc = buildActivateConfirmDescription({
      waPhoneDisplay: '+55 11 99999-0000',
      aiThreadsUsed: 300,
      aiThreadsLimit: 300,
      aiOverageEnabled: false,
    });
    expect(desc).toContain('+55 11 99999-0000');
    expect(desc).toContain('300 de 300');
    expect(desc).toContain('limite do ciclo');
  });

  it('exports pause and IA-off copy constants', () => {
    expect(AGENT_PAUSE_CONFIRM_DESCRIPTION).toMatch(/preservados/i);
    expect(AGENT_IA_MODULE_DISABLED_WHILE_ACTIVE_TOAST).toMatch(/pausado/i);
  });
});
