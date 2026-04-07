/**
 * Cobrança/assinatura Asaas no app.
 * Só fica operacional quando VITE_BILLING_ENABLED=true no build (Vite injeta no cliente).
 */
export function isBillingLive() {
  return import.meta.env.VITE_BILLING_ENABLED === 'true';
}
