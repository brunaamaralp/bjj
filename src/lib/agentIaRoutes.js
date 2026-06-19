/** Rota canônica do Agente de atendimento. */
export const AGENTE_IA_PATH = '/agente-ia';

/** Query que abre a configuração guiada ao entrar em /agente-ia (handoff pós-WhatsApp). */
export const AGENTE_IA_SETUP_PARAM = 'setup';

export const AGENTE_IA_SETUP_VALUE = '1';

export const AGENTE_IA_FROM_INTEGRACOES_PARAM = 'from';

export const AGENTE_IA_FROM_INTEGRACOES_VALUE = 'integracoes';

export const AGENTE_IA_SETUP_PATH = `${AGENTE_IA_PATH}?${AGENTE_IA_SETUP_PARAM}=${AGENTE_IA_SETUP_VALUE}`;

export function buildAgentIaSetupPath({ fromIntegracoes = false } = {}) {
  if (!fromIntegracoes) return AGENTE_IA_SETUP_PATH;
  return `${AGENTE_IA_SETUP_PATH}&${AGENTE_IA_FROM_INTEGRACOES_PARAM}=${AGENTE_IA_FROM_INTEGRACOES_VALUE}`;
}

export function isAgentIaSetupIntent(raw) {
  return String(raw || '').trim() === AGENTE_IA_SETUP_VALUE;
}

export function readAgentIaSetupIntent(searchParams) {
  const params = searchParams && typeof searchParams.get === 'function' ? searchParams : null;
  if (!params) return false;
  return isAgentIaSetupIntent(params.get(AGENTE_IA_SETUP_PARAM));
}

export function readAgentIaFromIntegracoes(searchParams) {
  const params = searchParams && typeof searchParams.get === 'function' ? searchParams : null;
  if (!params) return false;
  return String(params.get(AGENTE_IA_FROM_INTEGRACOES_PARAM) || '').trim() === AGENTE_IA_FROM_INTEGRACOES_VALUE;
}
