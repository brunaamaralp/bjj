import { describe, expect, it } from 'vitest';
import {
  mapAgentSettingsErrorMessage,
  mapAgentTestErrorMessage,
} from '../lib/agentTestErrorMessage.js';
import { normalizeInboxApiError } from '../lib/inboxApiUtils.js';

describe('agentTestErrorMessage', () => {
  it('traduz prompt não configurado', () => {
    expect(mapAgentTestErrorMessage({ erro: 'prompt_nao_configurado' })).toContain('Configure o assistente');
  });

  it('não expõe mensagem técnica do Appwrite no teste do agente', () => {
    const msg = mapAgentTestErrorMessage({
      erro: 'Unknown attribute: "financeConfig"',
    });
    expect(msg).not.toContain('Unknown attribute');
    expect(msg).not.toContain('financeConfig');
  });

  it('mapAgentSettingsErrorMessage humaniza erro de rede', () => {
    expect(mapAgentSettingsErrorMessage({ network: true })).toContain('internet');
  });
});

describe('normalizeInboxApiError', () => {
  it('humaniza erro JSON da API', () => {
    const msg = normalizeInboxApiError(
      JSON.stringify({ erro: 'Unknown attribute: "messages"' }),
      'Falha',
      'load'
    );
    expect(msg).not.toContain('Unknown attribute');
  });
});
