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
