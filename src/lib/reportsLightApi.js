import { createSessionJwt } from './appwrite.js';

async function headers(academyId) {
  const jwt = await createSessionJwt();
  return {
    Authorization: `Bearer ${jwt}`,
    'x-academy-id': academyId,
  };
}

export async function fetchReportsFinanceLight({ academyId, from, to, regime }) {
  const params = new URLSearchParams({ type: 'finance', from, to });
  if (regime) params.set('regime', regime);
  const res = await fetch(`/api/reports-light?${params}`, { headers: await headers(academyId) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar resumo financeiro');
  return body;
}

export async function fetchReportsSalesLight({ academyId, from, to }) {
  const params = new URLSearchParams({ type: 'sales', from, to });
  const res = await fetch(`/api/reports-light?${params}`, { headers: await headers(academyId) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar resumo da loja');
  return body;
}
