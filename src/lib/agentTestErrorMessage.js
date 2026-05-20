/**
 * Mensagens amigáveis para o chat de teste e carregamento do assistente.
 * @param {{ status?: number; code?: string; erro?: string; message?: string }} ctx
 */
export function mapAgentTestErrorMessage(ctx = {}) {
  const code = String(ctx.code || ctx.erro || '').trim().toLowerCase();
  const status = Number(ctx.status) || 0;

  if (code === 'prompt_nao_configurado' || code.includes('prompt_nao_configurado')) {
    return 'Configure o assistente na configuração guiada antes de testar.';
  }
  if (code === 'timeout' || status === 504 || String(ctx.erro || '').includes('Timeout')) {
    return 'Resposta demorou; tente uma mensagem mais curta.';
  }
  if (status === 502 || code === 'upstream_error') {
    return 'Erro no assistente. Tente novamente; se o problema persistir, fale com o suporte.';
  }
  if (status === 429 || code === 'limite_diario') {
    return String(ctx.message || '').trim() || 'Limite diário de testes atingido.';
  }
  if (status === 500) {
    return 'Erro interno ao testar o assistente. Tente novamente; se o problema persistir, fale com o suporte.';
  }
  const msg = String(ctx.message || ctx.erro || '').trim();
  if (!msg || status >= 500) {
    return 'Não foi possível obter resposta do assistente. Tente novamente; se o problema persistir, fale com o suporte.';
  }
  return msg;
}

/**
 * Mensagens acionáveis para carregar/salvar configurações do assistente.
 * @param {{ status?: number; erro?: string; message?: string; network?: boolean }} ctx
 */
export function mapAgentSettingsErrorMessage(ctx = {}) {
  const status = Number(ctx.status) || 0;
  const msg = String(ctx.message || ctx.erro || '').trim();

  if (ctx.network === true || status === 0 || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente; se o problema persistir, fale com o suporte.';
  }
  if (status === 500) {
    return 'Erro interno ao processar as configurações. Tente novamente; se o problema persistir, fale com o suporte.';
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Serviço temporariamente indisponível. Tente novamente em alguns minutos; se persistir, fale com o suporte.';
  }
  if (msg) return msg;
  return 'Não foi possível concluir a operação. Tente novamente; se o problema persistir, fale com o suporte.';
}
