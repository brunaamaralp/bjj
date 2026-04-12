/** Mensagens mantidas no histórico persistido e usadas como contexto da IA / melhorar rascunho. */
export const AGENT_HISTORY_WINDOW = 20;

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

/** Timeout por chamada HTTP ao Claude (agentRespond). */
export const CLAUDE_TIMEOUT_MS = 25000;

/** Tentativas extra após a primeira (total ≤ 1 + CLAUDE_MAX_RETRIES). */
export const CLAUDE_MAX_RETRIES = 2;

/** Base do backoff exponencial entre retries (ms). */
export const CLAUDE_RETRY_DELAY_MS = 1000;

/** Status HTTP Anthropic considerados transitórios para retry. */
export const CLAUDE_RETRYABLE_HTTP_STATUS = [429, 500, 502, 503, 529];
