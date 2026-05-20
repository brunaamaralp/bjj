/**
 * Mensagens amigáveis para o chat de teste do assistente.
 * @param {{ status?: number; code?: string; erro?: string; message?: string }} ctx
 */
export function mapAgentTestErrorMessage(ctx = {}) {
  const code = String(ctx.code || ctx.erro || '').trim().toLowerCase();
  const status = Number(ctx.status) || 0;

  if (code === 'prompt_nao_configurado' || code.includes('prompt_nao_configurado')) {
    return 'Configure o assistente no wizard antes de testar.';
  }
  if (code === 'timeout' || status === 504 || String(ctx.erro || '').includes('Timeout')) {
    return 'Resposta demorou; tente uma mensagem mais curta.';
  }
  if (status === 502 || code === 'upstream_error') {
    return 'Erro no assistente; contate o suporte.';
  }
  if (status === 429 || code === 'limite_diario') {
    return String(ctx.message || '').trim() || 'Limite diário de testes atingido.';
  }
  return String(ctx.message || ctx.erro || '').trim() || 'Não foi possível obter resposta do assistente.';
}
