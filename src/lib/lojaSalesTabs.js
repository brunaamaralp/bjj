const SALES_LEAF_TABS = new Set(['new', 'history']);

function normalizeLeafId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return id === 'historico' ? 'history' : id;
}

/** Aba interna de Vendas (Nova venda / Histórico) via ?subtab=; aceita legado ?tab=new|history. */
export function resolveSalesSubtab(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  const fromSub = normalizeLeafId(params.get('subtab'));
  if (SALES_LEAF_TABS.has(fromSub)) return fromSub;
  const fromTab = normalizeLeafId(params.get('tab'));
  if (SALES_LEAF_TABS.has(fromTab)) return fromTab;
  return 'new';
}

export function isLegacySalesLeafTab(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  return SALES_LEAF_TABS.has(normalizeLeafId(params.get('tab')));
}

/** Mantém ?tab=vendas no hub Loja e grava a subaba em ?subtab=. */
export function lojaVendasTabParams(subtab, prev) {
  const next = new URLSearchParams(prev);
  next.set('tab', 'vendas');
  next.set('subtab', subtab);
  return next;
}

export const SALES_PDV_STORAGE_KEY = 'sales:pdvMode:v1';

export function resolveSalesPdvMode(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  return String(params.get('pdv') || '').trim() === '1';
}

export function lojaVendasPdvParams(enabled, prev) {
  const next = new URLSearchParams(prev);
  next.set('tab', 'vendas');
  if (!next.get('subtab')) next.set('subtab', 'new');
  if (enabled) next.set('pdv', '1');
  else next.delete('pdv');
  return next;
}

export function readSalesPdvPreference() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SALES_PDV_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSalesPdvPreference(enabled) {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) window.localStorage.setItem(SALES_PDV_STORAGE_KEY, '1');
    else window.localStorage.removeItem(SALES_PDV_STORAGE_KEY);
  } catch {
    void 0;
  }
}

export function salesSubtabNeedsNormalize(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  const resolved = resolveSalesSubtab(params);
  const hubTab = String(params.get('tab') || '').trim().toLowerCase();
  const currentSub = normalizeLeafId(params.get('subtab'));
  const hubOk = hubTab === 'vendas';
  const subOk = currentSub === resolved;
  return !hubOk || !subOk || isLegacySalesLeafTab(params);
}

/** Deep link: ?report=1&date=YYYY-MM-DD */
export function resolveSalesDailyReportDeepLink(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(searchParams);
  const open = String(params.get('report') || '').trim() === '1';
  const dateRaw = String(params.get('date') || '').trim();
  const dateYmd = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  return { open, dateYmd };
}

export function lojaVendasDailyReportParams(dateYmd, prev) {
  const next = lojaVendasTabParams('history', prev);
  next.set('report', '1');
  if (dateYmd) next.set('date', dateYmd);
  else next.delete('date');
  return next;
}

export function clearSalesDailyReportDeepLink(prev) {
  const next = new URLSearchParams(prev);
  next.delete('report');
  next.delete('date');
  return next;
}
