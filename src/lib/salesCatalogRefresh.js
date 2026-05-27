/** Dispara recarga do catálogo de vendas (useSalesCatalog) após mutação de produtos/variantes. */
export const REFRESH_SALES_CATALOG_EVENT = 'navi:refresh-sales-catalog';

export function dispatchRefreshSalesCatalog() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REFRESH_SALES_CATALOG_EVENT));
}
