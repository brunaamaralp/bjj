import { createSessionJwt } from './appwrite.js';

async function financeHeaders(academyId) {
  const jwt = await createSessionJwt();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt}`,
    'x-academy-id': academyId,
  };
}

export async function listFinanceTx({ academyId, from, to, cursor, regime }) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (cursor) params.set('cursor', cursor);
  if (regime) params.set('regime', regime);
  const res = await fetch(`/api/finance-tx?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao listar lançamentos');
  return body;
}

export async function createFinanceTx({ academyId, payload }) {
  const res = await fetch('/api/finance-tx', {
    method: 'POST',
    headers: await financeHeaders(academyId),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao criar lançamento');
  return body.transaction;
}

export async function patchFinanceTx({ academyId, id, payload }) {
  const res = await fetch(`/api/finance-tx?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await financeHeaders(academyId),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao atualizar lançamento');
  return body.transaction;
}

export async function fetchFinanceSummary({ academyId, from, to, regime }) {
  const params = new URLSearchParams({ route: 'summary' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (regime) params.set('regime', regime);
  const res = await fetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar resumo');
  return body;
}

export async function fetchMonthlyClosing({ academyId, month, regime }) {
  const params = new URLSearchParams({ route: 'closing', month });
  if (regime) params.set('regime', regime);
  const res = await fetch(`/api/finance?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar fechamento');
  return body;
}

export async function fetchFinanceForecast({ academyId, from, to, refresh = false }) {
  const params = new URLSearchParams({ route: 'forecast', from, to });
  if (refresh) params.set('_', String(Date.now()));
  const res = await fetch(`/api/finance/forecast?${params}`, {
    headers: await financeHeaders(academyId),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar previsão');
  return body;
}

export async function recordCashClosing({ academyId, referenceMonth, snapshot }) {
  const res = await fetch('/api/finance?route=closing', {
    method: 'POST',
    headers: await financeHeaders(academyId),
    body: JSON.stringify({ reference_month: referenceMonth, snapshot }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao registrar conferência');
  return body;
}
