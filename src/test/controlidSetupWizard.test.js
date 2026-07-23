import { describe, it, expect } from 'vitest';
import {
  CONTROLID_SETUP_STEP_CONNECT,
  CONTROLID_SETUP_STEP_PORTAL,
  CONTROLID_SETUP_STEP_RULES,
  nextControlIdSetupStep,
  visibleControlIdSetupSections,
} from '../lib/controlidSetupWizard.js';
import { receptionPresenceSubtitle } from '../lib/dashboardReceptionCopy.js';

describe('controlidSetupWizard', () => {
  it('avança Conectar → Porta após teste OK', () => {
    expect(
      nextControlIdSetupStep(CONTROLID_SETUP_STEP_CONNECT, { tested: true })
    ).toBe(CONTROLID_SETUP_STEP_PORTAL);
  });

  it('avança Porta → Regras', () => {
    expect(nextControlIdSetupStep(CONTROLID_SETUP_STEP_PORTAL, {})).toBe(
      CONTROLID_SETUP_STEP_RULES
    );
  });

  it('em edição mostra todas as seções', () => {
    expect(visibleControlIdSetupSections(CONTROLID_SETUP_STEP_CONNECT, { editMode: true })).toEqual({
      connect: true,
      portal: true,
      rules: true,
      status: true,
    });
  });

  it('no 1º setup só mostra o que o passo permite', () => {
    expect(visibleControlIdSetupSections(CONTROLID_SETUP_STEP_CONNECT, { editMode: false })).toEqual({
      connect: true,
      portal: false,
      rules: false,
      status: false,
    });
    expect(visibleControlIdSetupSections(CONTROLID_SETUP_STEP_PORTAL, { editMode: false })).toEqual({
      connect: true,
      portal: true,
      rules: false,
      status: false,
    });
    expect(visibleControlIdSetupSections(CONTROLID_SETUP_STEP_RULES, { editMode: false })).toEqual({
      connect: true,
      portal: true,
      rules: true,
      status: true,
    });
  });
});

describe('dashboardReceptionCopy glossary', () => {
  it('subtítulo de Presença não usa “Catraca” como nome da aba', () => {
    const sub = receptionPresenceSubtitle();
    expect(sub.toLowerCase()).not.toMatch(/^catraca/);
    expect(sub.toLowerCase()).toMatch(/presença|entradas|retenção/);
  });
});
