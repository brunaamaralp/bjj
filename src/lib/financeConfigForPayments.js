import { hasConfiguredBankAccounts } from './bankAccounts.js';

/** Escolhe o financeConfig mais completo para lançamentos (store, fetch local ou prop). */
export function pickFinanceConfigForPayments(...candidates) {
  const list = candidates.filter((cfg) => cfg && typeof cfg === 'object');
  for (const cfg of list) {
    if (hasConfiguredBankAccounts(cfg)) return cfg;
  }
  for (const cfg of list) {
    const hasPlans = (cfg.plans || []).some((plan) => String(plan?.name || '').trim());
    if (hasPlans) return cfg;
  }
  return list[0] || null;
}
