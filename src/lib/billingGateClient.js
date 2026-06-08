import { isBillingLive } from './billingEnabled.js';

export class BillingGateClientError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {string} [redirect]
   */
  constructor(code, message, redirect = '/conta?tab=assinatura') {
    super(message);
    this.name = 'BillingGateClientError';
    this.code = code;
    this.redirect = redirect;
  }
}

/**
 * Bloqueia mutações de lead no cliente quando assinatura não está ativa.
 * Enquanto billingAccess é null (carregando), não bloqueia.
 *
 * @param {{ accessLevel?: string } | null | undefined} billingAccess
 */
export function assertClientBillingMutationsAllowed(billingAccess) {
  if (!isBillingLive()) return;
  if (!billingAccess || typeof billingAccess !== 'object') return;

  const level = String(billingAccess.accessLevel || '').trim();
  if (!level || level === 'full') return;

  if (level === 'limited') {
    throw new BillingGateClientError(
      'SUBSCRIPTION_PAST_DUE',
      'Pagamento pendente. Regularize em /conta?tab=assinatura para continuar.'
    );
  }

  throw new BillingGateClientError(
    'SUBSCRIPTION_INACTIVE',
    'Assinatura inativa. Ative seu plano em /conta?tab=assinatura para continuar.'
  );
}
