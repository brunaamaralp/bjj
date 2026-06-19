import { describe, it, expect } from 'vitest';
import {
  AGENTE_IA_PATH,
  AGENTE_IA_SETUP_PATH,
  buildAgentIaSetupPath,
  isAgentIaSetupIntent,
  readAgentIaSetupIntent,
  readAgentIaFromIntegracoes,
} from '../lib/agentIaRoutes.js';

describe('agentIaRoutes', () => {
  it('expõe paths canônicos', () => {
    expect(AGENTE_IA_PATH).toBe('/agente-ia');
    expect(AGENTE_IA_SETUP_PATH).toBe('/agente-ia?setup=1');
  });

  it('detecta intent de setup na query', () => {
    expect(isAgentIaSetupIntent('1')).toBe(true);
    expect(isAgentIaSetupIntent('0')).toBe(false);
    expect(readAgentIaSetupIntent(new URLSearchParams('setup=1'))).toBe(true);
    expect(readAgentIaSetupIntent(new URLSearchParams(''))).toBe(false);
  });

  it('buildAgentIaSetupPath inclui from=integracoes quando handoff', () => {
    expect(buildAgentIaSetupPath()).toBe(AGENTE_IA_SETUP_PATH);
    expect(buildAgentIaSetupPath({ fromIntegracoes: true })).toBe(
      '/agente-ia?setup=1&from=integracoes'
    );
    expect(readAgentIaFromIntegracoes(new URLSearchParams('from=integracoes'))).toBe(true);
  });
});
