import { unionFinanceConfigForPersist } from './financeConfigStorage.js';

/** Une todos os financeConfig candidatos (store, fetch, prop) sem perder planos/contas legados. */
export function pickFinanceConfigForPayments(...candidates) {
  const list = candidates.filter((cfg) => cfg && typeof cfg === 'object');
  if (!list.length) return null;
  return list.reduce((acc, cfg) => unionFinanceConfigForPersist(acc, cfg), list[0]);
}
