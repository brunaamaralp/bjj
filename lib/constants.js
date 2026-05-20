/** Mensagens mantidas no histórico persistido e usadas como contexto da IA / melhorar rascunho. */
export const AGENT_HISTORY_WINDOW = 20;

/** Máximo de mensagens no JSON do documento de conversa (curto prazo antes de subcoleção). */
export const CONVERSATION_MESSAGES_STORE_MAX = 300;

export function assertHumanHandoffEnvOnBoot() {
  const serverH = resolveHumanHandoffHours(process.env.HUMAN_HANDOFF_HOURS);
  const clientH = resolveHumanHandoffHours(process.env.VITE_HUMAN_HANDOFF_HOURS);
  if (serverH !== clientH) {
    console.error(
      JSON.stringify({
        event: 'handoff_env_mismatch',
        error: 'HUMAN_HANDOFF_HOURS must match VITE_HUMAN_HANDOFF_HOURS',
        server_hours: serverH,
        client_hours: clientH,
      })
    );
  }
  return serverH === clientH;
}

/** Default matches server when HUMAN_HANDOFF_HOURS / VITE_HUMAN_HANDOFF_HOURS are unset. */
export const HUMAN_HANDOFF_HOURS_DEFAULT = 6;

export function resolveHumanHandoffHours(envValue) {
  const n = Number.parseInt(String(envValue ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : HUMAN_HANDOFF_HOURS_DEFAULT;
}

export function getHumanHandoffHoursForServer() {
  if (typeof process !== 'undefined' && process.env) {
    return resolveHumanHandoffHours(process.env.HUMAN_HANDOFF_HOURS);
  }
  return HUMAN_HANDOFF_HOURS_DEFAULT;
}

export function getHumanHandoffHoursForClient() {
  try {
    const v =
      typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_HUMAN_HANDOFF_HOURS;
    if (v != null && String(v).trim() !== '') return resolveHumanHandoffHours(v);
  } catch {
    void 0;
  }
  return HUMAN_HANDOFF_HOURS_DEFAULT;
}

/**
 * Timeout por chamada HTTP ao Claude em produção (agentRespond / webhook Zapster ~8,5s SLA).
 * Chat de teste e painel usam CLAUDE_TEST_TIMEOUT_MS (25–30s).
 */
export const CLAUDE_TIMEOUT_MS = 8500;

/** Timeout no sandbox de teste do assistente (api/agent/test) — maior que produção. */
export const CLAUDE_TEST_TIMEOUT_MS = 28000;

/** Tentativas extra após a primeira (total ≤ 1 + CLAUDE_MAX_RETRIES). */
export const CLAUDE_MAX_RETRIES = 1;

/** Base do backoff exponencial entre retries (ms). */
export const CLAUDE_RETRY_DELAY_MS = 1000;

/** Status HTTP Anthropic considerados transitórios para retry. */
export const CLAUDE_RETRYABLE_HTTP_STATUS = [429, 500, 502, 503, 529];
