/**
 * Mensagens amigáveis em respostas JSON da API (serverless).
 * Reutiliza a mesma lógica do frontend.
 */
import { friendlyError, friendlySaleError } from '../../src/lib/errorMessages.js';
import { getAppwriteDevHint } from '../../src/lib/appwriteErrors.js';

export { friendlyError, friendlySaleError, getAppwriteDevHint };

/** Campo `erro` / `message` em JSON para o cliente. */
export function apiErro(err, context = 'action') {
  return friendlyError(err, context);
}

/** Log técnico no servidor (mensagem crua + dica Appwrite). */
export function logApiError(tag, err) {
  const raw = err?.message ?? String(err ?? '');
  const hint = getAppwriteDevHint(err);
  if (hint) {
    console.error(`[${tag}]`, raw, hint);
  } else if (raw) {
    console.error(`[${tag}]`, raw);
  }
}
