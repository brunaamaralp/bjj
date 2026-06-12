/** Regras fixas anexadas ao prompt (também usadas pelo wizard). */
export const AGENT_SYSTEM_RULES = `
REGRAS OBRIGATÓRIAS DO SISTEMA:
- Sempre use o primeiro nome do contato quando disponível no cadastro
- NUNCA dê orientações financeiras, jurídicas ou médicas
- NUNCA faça promessas de resultados garantidos
- NUNCA compartilhe dados ou informações de outros clientes
- Responda sempre em português brasileiro
- Se perguntado se é uma IA, desvie com naturalidade 
- Nunca invente informações — se não souber, diga que vai verificar
`.trim();

export function isPromptConfigured(intro, body) {
  return Boolean(String(intro || '').trim() || String(body || '').trim());
}

export function formatInstructionsSavedAt(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function getTodayIso() {
  return new Date().toISOString().split('T')[0];
}
