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

/**
 * Resposta JSON de erro amigável + log server-side.
 * @param {import('http').ServerResponse} res
 * @param {unknown} err
 * @param {{ tag: string, context?: string, status?: number, jsonFn?: (res: unknown, status: number, body: object) => unknown }} opts
 */
export function respondApiError(res, err, { tag, context = 'action', status = 500, jsonFn = null } = {}) {
  logApiError(tag, err);
  const payload = { sucesso: false, erro: apiErro(err, context) };
  if (typeof jsonFn === 'function') return jsonFn(res, status, payload);
  return res.status(status).json(payload);
}
