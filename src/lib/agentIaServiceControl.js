/** @typedef {'unconfigured' | 'ready' | 'active' | 'active-wa-offline'} AgentIaStatusVariant */

export const AGENT_ACTIVATE_HINT_DEFAULT =
  'Último passo: ative para o assistente responder automaticamente no WhatsApp.';

export const AGENT_ACTIVATE_HINT_WA =
  'Conecte o WhatsApp no card acima antes de ativar.';

export const AGENT_STATUS_BADGE_LABELS = {
  unconfigured: 'Não configurado',
  ready: '● Pronto para ativar',
  active: '● Ativo',
  'active-wa-offline': '● Ativo — WhatsApp desconectado',
};

/**
 * Banner roxo de ambiente de configuração — oculto quando o agente já está ativo.
 * @param {boolean} iaAtiva
 */
export function shouldShowAgentConfigBanner(iaAtiva) {
  return iaAtiva !== true;
}

/**
 * @param {{ promptConfigurado: boolean, iaAtiva: boolean, waConnected: boolean }} params
 * @returns {AgentIaStatusVariant}
 */
export function getAgentStatusBadgeVariant({ promptConfigurado, iaAtiva, waConnected }) {
  if (!promptConfigurado) return 'unconfigured';
  if (!iaAtiva) return 'ready';
  if (!waConnected) return 'active-wa-offline';
  return 'active';
}

/**
 * Hint do CTA de ativação. Retorna null quando o banner de IA off já cobre o caso.
 * @param {{ aiModuleEnabled: boolean, waConnected: boolean }} params
 * @returns {string | null}
 */
export function getAgentActivateHint({ aiModuleEnabled, waConnected }) {
  if (!aiModuleEnabled) return null;
  if (!waConnected) return AGENT_ACTIVATE_HINT_WA;
  return AGENT_ACTIVATE_HINT_DEFAULT;
}

/**
 * @param {{ togglingIa: boolean, aiModuleEnabled: boolean, waConnected: boolean }} params
 */
export function isAgentActivateDisabled({ togglingIa, aiModuleEnabled, waConnected }) {
  return Boolean(togglingIa || !aiModuleEnabled || !waConnected);
}

/**
 * @param {boolean} iaAtiva
 * @param {boolean} canEditPrompt
 * @param {boolean} promptConfigurado
 * @param {boolean} panelOpen — wizard, editor ou teste
 */
export function shouldRenderAgentServiceControl({
  canEditPrompt,
  promptConfigurado,
  panelOpen,
}) {
  if (!promptConfigurado || !canEditPrompt || panelOpen) return false;
  return true;
}

/**
 * Chip compacto no PageHeader — só quando o prompt já está configurado.
 * @param {{ promptConfigurado: boolean, iaAtiva: boolean }} params
 * @returns {{ label: string, variant: 'active' | 'paused' } | null}
 */
export function getAgentHeaderStatusChip({ promptConfigurado, iaAtiva }) {
  if (!promptConfigurado) return null;
  return iaAtiva
    ? { label: 'Assistente ativo', variant: 'active' }
    : { label: 'Pausado', variant: 'paused' };
}

/**
 * @param {{
 *   waPhoneDisplay?: string | null,
 *   aiThreadsUsed?: number,
 *   aiThreadsLimit?: number,
 *   aiOverageEnabled?: boolean,
 * }} params
 */
export function buildActivateConfirmDescription({
  waPhoneDisplay,
  aiThreadsUsed = 0,
  aiThreadsLimit = 0,
  aiOverageEnabled = false,
}) {
  const lines = [
    'O assistente passará a responder automaticamente às mensagens recebidas no WhatsApp.',
  ];
  const phone = String(waPhoneDisplay || '').trim();
  if (phone) {
    lines.push(`Número conectado: ${phone}.`);
  }
  if (aiThreadsLimit > 0) {
    lines.push(`Uso neste ciclo: ${aiThreadsUsed} de ${aiThreadsLimit} conversas com assistente.`);
    if (aiThreadsUsed >= aiThreadsLimit && !aiOverageEnabled) {
      lines.push(
        'Atenção: o limite do ciclo foi atingido — novas conversas podem ficar sem resposta automática até o próximo ciclo ou contratação de mensagens extras.'
      );
    }
  }
  return lines.join('\n\n');
}

export const AGENT_PAUSE_CONFIRM_DESCRIPTION =
  'O assistente deixa de responder automaticamente no WhatsApp. As instruções e o histórico de conversas são preservados — você pode reativar quando quiser.';

export const AGENT_IA_MODULE_DISABLED_WHILE_ACTIVE_TOAST =
  'Recursos de IA desativados. O atendimento automático foi pausado.';

