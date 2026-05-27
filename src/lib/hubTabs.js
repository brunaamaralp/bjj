/** Resolve aba de hub via ?tab= com fallback seguro. */
export function resolveHubTab(raw, allowedIds, fallback) {
  const id = String(raw || '').trim().toLowerCase();
  const set = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  return set.has(id) ? id : fallback;
}

export {
  financeiroLegacyTabToSlug,
  caixaLegacyTabToSlug,
  financeLegacyTabToFinanceiro,
  financeLegacyTabToCaixa,
} from './financeiroHubTabs.js';
