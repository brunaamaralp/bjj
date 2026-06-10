import { friendlyError } from './errorMessages.js';

/**
 * Mensagens amigáveis para o chat de teste e carregamento do assistente.
 * Códigos específicos primeiro; fallback sempre via friendlyError (nunca texto técnico cru).
 * @param {{ status?: number; code?: string; erro?: string; message?: string }} ctx
 */
export function mapAgentTestErrorMessage(ctx = {}) {
  const code = String(ctx.code || ctx.erro || '').trim().toLowerCase();
  const status = Number(ctx.status) || 0;

  if (code === 'prompt_nao_configurado' || code.includes('prompt_nao_configurado')) {
    return friendlyError({ message: 'prompt_nao_configurado' }, 'action');
  }
  if (code === 'timeout' || status === 504 || String(ctx.erro || '').includes('Timeout')) {
    return 'Resposta demorou; tente uma mensagem mais curta.';
  }
  if (status === 502 || code === 'upstream_error') {
    return friendlyError({ message: 'upstream_error' }, 'action');
  }
  if (status === 429 || code === 'limite_diario') {
    const custom = String(ctx.message || '').trim();
    return custom && !/failed|error|exception/i.test(custom)
      ? custom
      : friendlyError({ message: 'limite_diario' }, 'action');
  }
  if (status >= 500) {
    return 'Erro interno ao testar o assistente. Tente novamente; se o problema persistir, fale com o suporte.';
  }

  return friendlyError(
    { message: String(ctx.message || ctx.erro || '').trim(), code: ctx.code || ctx.erro },
    'action'
  );
}

/**
 * Mensagens acionáveis para carregar/salvar configurações do assistente.
 * @param {{ status?: number; erro?: string; message?: string; network?: boolean }} ctx
 */
export function mapAgentSettingsErrorMessage(ctx = {}) {
  const status = Number(ctx.status) || 0;
  const msg = String(ctx.message || ctx.erro || '').trim();

  if (ctx.network === true || status === 0 || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return friendlyError({ message: 'Failed to fetch' }, 'network');
  }
  if (status === 500) {
    return 'Erro interno ao processar as configurações. Tente novamente; se o problema persistir, fale com o suporte.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Serviço temporariamente indisponível. Tente novamente em alguns minutos; se persistir, fale com o suporte.';
  }

  return friendlyError({ message: msg, status }, msg ? 'save' : 'action');
}
