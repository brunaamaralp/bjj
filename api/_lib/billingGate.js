import { isBillingApiLive } from '../../lib/server/billingApiEnabled.js';
import {
  getBillingDatabases,
  isBillingStoreConfigured,
  findSubscriptionByStoreId,
} from '../../lib/billing/billingAppwriteStore.js';
import { evaluateBillingAccess } from '../../lib/billing/gate.js';

export class BillingGateError extends Error {
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.name = 'BillingGateError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Exige assinatura com acesso pleno (trial ativo ou active).
 * Com billing desligado ou Appwrite de billing não configurado, não bloqueia.
 * @param {string} academyId
 */
export async function assertBillingActive(academyId) {
  if (!isBillingApiLive()) return;

  const sid = String(academyId || '').trim();
  if (!sid) {
    throw new BillingGateError(400, 'INVALID_ACADEMY', 'academyId inválido.');
  }

  if (!isBillingStoreConfigured()) return;
  const databases = getBillingDatabases();
  if (!databases) return;

  const access = await evaluateBillingAccess(sid);

  if (access.accessLevel === 'full') return;

  if (access.accessLevel === 'limited') {
    throw new BillingGateError(
      402,
      'SUBSCRIPTION_PAST_DUE',
      'Pagamento pendente. Regularize em /planos para continuar.'
    );
  }

  const row = await findSubscriptionByStoreId(databases, sid);
  if (!row) {
    throw new BillingGateError(
      402,
      'NO_SUBSCRIPTION',
      'Assinatura não encontrada. Acesse /planos para ativar.'
    );
  }

  throw new BillingGateError(
    402,
    'SUBSCRIPTION_EXPIRED',
    'Assinatura vencida ou inativa. Acesse /planos para renovar.'
  );
}

/**
 * @param {import('http').ServerResponse} res
 * @param {unknown} err
 * @returns {boolean} true se a resposta já foi enviada
 */
export function sendBillingGateError(res, err) {
  if (!(err instanceof BillingGateError)) return false;
  res.status(err.status).json({
    sucesso: false,
    erro: err.message,
    code: err.code,
    message: err.message,
  });
  return true;
}
