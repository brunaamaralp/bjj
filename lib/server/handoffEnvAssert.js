import { resolveHumanHandoffHours } from '../constants.js';

/**
 * Garante paridade VITE_HUMAN_HANDOFF_HOURS (cliente) vs HUMAN_HANDOFF_HOURS (servidor).
 * Chamar no boot de APIs server-side.
 */
export function assertHumanHandoffEnvParity() {
  const serverH = resolveHumanHandoffHours(process.env.HUMAN_HANDOFF_HOURS);
  const clientH = resolveHumanHandoffHours(process.env.VITE_HUMAN_HANDOFF_HOURS);
  if (serverH !== clientH) {
    console.error(
      JSON.stringify({
        event: 'handoff_env_mismatch',
        error: 'HUMAN_HANDOFF_HOURS diverge from VITE_HUMAN_HANDOFF_HOURS',
        server_hours: serverH,
        client_hours: clientH,
        ts: new Date().toISOString(),
      })
    );
    return false;
  }
  return true;
}
