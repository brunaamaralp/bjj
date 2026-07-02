import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';
import { fetchFinanceHubCached, financeHubCacheKey } from './financeHubCache.js';

async function financeHeaders(academyId) {
  const jwt = await createSessionJwt();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
    'x-academy-id': academyId,
  };
}

export async function listFinanceTx({ academyId, from, to, cursor, regime, limit }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (cursor) params.set('cursor', cursor);
  if (regime) params.set('regime', regime);
  if (limit != null && Number.isFinite(Number(limit))) params.set('limit', String(Math.floor(Number(limit))));
  const res = await authedFetch(`/api/finance-tx?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao listar lançamentos');
  return body;
}

export async function createFinanceTx({ academyId, payload }) {
  const res = await authedFetch('/api/finance-tx', {
    method: 'POST',
    headers: await financeHeaders(academyId),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao criar lançamento');
  return body.transaction;
}

export async function patchFinanceTx({ academyId, id, payload }) {
  const res = await authedFetch(`/api/finance-tx?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await financeHeaders(academyId),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao atualizar lançamento');
  return body.transaction;
}

/** Estorno pós-liquidação — cancela o original e cria lançamento espelho. */
export async function reverseFinanceTx({ academyId, id, reason }) {
  const res = await authedFetch(`/api/finance-tx?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await financeHeaders(academyId),
    body: JSON.stringify({ action: 'reverse', reason: reason || '' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao estornar lançamento');
  return body;
}

export async function fetchBankBalances({ academyId, asOf } = {}) {
  const params = new URLSearchParams({ route: 'bank-balances' });
  if (asOf) params.set('asOf', asOf);
  const res = await authedFetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar saldos das contas');
  return body;
}

export async function fetchFinanceOverview({
  academyId,
  month,
  regime,
  includeForecast = false,
  includeContracts = false,
  includePayables = false,
  bankCompareAsOf,
}) {
  const params = new URLSearchParams({ route: 'overview', month });
  if (regime) params.set('regime', regime);
  if (includeForecast) params.set('includeForecast', '1');
  if (includeContracts) params.set('includeContracts', '1');
  if (includePayables) params.set('includePayables', '1');
  if (bankCompareAsOf) params.set('bankCompareAsOf', bankCompareAsOf);
  const res = await authedFetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar visão geral');
  return body;
}

export function fetchFinanceOverviewCached({
  academyId,
  month,
  regime,
  includeForecast = false,
  includeContracts = false,
  includePayables = false,
  bankCompareAsOf,
  force = false,
}) {
  const key = financeHubCacheKey([
    'overview',
    academyId,
    month,
    regime,
    includeForecast ? 'forecast' : '',
    includeContracts ? 'contracts' : '',
    includePayables ? 'payables' : '',
    bankCompareAsOf || '',
  ]);
  return fetchFinanceHubCached(
    key,
    () =>
      fetchFinanceOverview({
        academyId,
        month,
        regime,
        includeForecast,
        includeContracts,
        includePayables,
        bankCompareAsOf,
      }),
    { force }
  );
}

export async function fetchFinanceSummary({ academyId, from, to, regime }) {
  const params = new URLSearchParams({ route: 'summary' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (regime) params.set('regime', regime);
  const res = await authedFetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar resumo');
  return body;
}

export async function fetchMonthlyClosing({ academyId, month, regime }) {
  const params = new URLSearchParams({ route: 'closing', month });
  if (regime) params.set('regime', regime);
  const res = await authedFetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar fechamento');
  return body;
}

export async function fetchReceivables({
  academyId,
  month,
  section,
  limit,
  offset,
  includeCobranca = false,
  refresh = false,
}) {
  const params = new URLSearchParams({ route: 'receivables', month });
  if (section) params.set('section', section);
  if (limit != null && Number.isFinite(Number(limit))) params.set('limit', String(Math.floor(Number(limit))));
  if (offset != null && Number.isFinite(Number(offset))) params.set('offset', String(Math.floor(Number(offset))));
  if (includeCobranca) params.set('includeCobranca', '1');
  if (refresh) params.set('refresh', '1');
  const res = await authedFetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar contas a receber');
  return body;
}

export function fetchReceivablesCached({
  academyId,
  month,
  section,
  limit,
  offset,
  includeCobranca = false,
  force = false,
}) {
  const key = financeHubCacheKey([
    'receivables',
    academyId,
    month,
    section || '',
    limit ?? '',
    offset ?? '',
    includeCobranca ? 'cobranca' : '',
  ]);
  return fetchFinanceHubCached(
    key,
    () =>
      fetchReceivables({
        academyId,
        month,
        section,
        limit,
        offset,
        includeCobranca,
        refresh: force,
      }),
    { force }
  );
}

export async function fetchPayables({ academyId, from, to, section, search, category, refresh = false }) {
  const params = new URLSearchParams({ route: 'payables' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (section) params.set('section', section);
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (refresh) params.set('refresh', '1');
  const res = await authedFetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar contas a pagar');
  return body;
}

export function fetchPayablesCached({
  academyId,
  from,
  to,
  section,
  search,
  category,
  force = false,
}) {
  const key = financeHubCacheKey([
    'payables',
    academyId,
    from,
    to,
    section || '',
    search || '',
    category || '',
  ]);
  return fetchFinanceHubCached(
    key,
    () =>
      fetchPayables({
        academyId,
        from,
        to,
        section,
        search,
        category,
        refresh: force,
      }),
    { force }
  );
}

export async function fetchFinanceForecast({ academyId, from, to, refresh = false }) {
  const params = new URLSearchParams({ route: 'forecast', from, to });
  if (refresh) params.set('_', String(Date.now()));
  const res = await authedFetch(`/api/finance/forecast?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar previsão');
  return body;
}

export async function recordCashClosing({ academyId, referenceMonth, snapshot, regime }) {
  const res = await authedFetch('/api/finance?route=closing', {
    method: 'POST',
    headers: await financeHeaders(academyId),
    body: JSON.stringify({
      reference_month: referenceMonth,
      snapshot,
      regime: regime || snapshot?.regime,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'Erro ao registrar conferência');
    err.code = body.error;
    err.snapshotMismatch = body.error === 'snapshot_mismatch' ? body : null;
    throw err;
  }
  return body;
}

export async function reconcileStudentPaymentMirrors(academyId) {
  const res = await authedFetch('/api/finance?route=payment-reconcile', {
    method: 'POST',
    headers: await financeHeaders(academyId),
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao verificar espelhos');
  return body;
}

/** Registra taxa de antecipação vinculada a um lançamento liquidado. */
export async function anticipateFinanceTx({ academyId, txId, feeAmount, settledAt, note }) {
  const res = await authedFetch('/api/finance?route=anticipate', {
    method: 'POST',
    headers: await financeHeaders(academyId),
    body: JSON.stringify({
      tx_id: txId,
      fee_amount: feeAmount,
      settled_at: settledAt,
      note,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao registrar antecipação');
  return body;
}
