/**
 * Cobrança ativa nas rotas serverless (checkout, trial, webhook).
 * Use BILLING_ENABLED=true no Vercel / .env junto com VITE_BILLING_ENABLED=true no build do front.
 */
export function isBillingApiLive() {
  return String(process.env.BILLING_ENABLED || '').trim().toLowerCase() === 'true';
}
