import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

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
  const res = await authedFetch(`/api/reports-light?${params}`, { headers: await headers(academyId) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 403 && body?.error === 'permission_denied') {
    return { permissionDenied: true, message: body.message };
  }
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar resumo financeiro');
  return body;
}

/** Resultado estruturado para KPIs da Visão geral (não lança em permission_denied). */
export async function fetchReportsFinanceLightResult({ academyId, from, to, regime }) {
  try {
    const data = await fetchReportsFinanceLight({ academyId, from, to, regime });
    if (data?.permissionDenied) {
      return { ok: false, permissionDenied: true, message: data.message };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function fetchReportsSalesLight({ academyId, from, to }) {
  const params = new URLSearchParams({ type: 'sales', from, to });
  const res = await authedFetch(`/api/reports-light?${params}`, { headers: await headers(academyId) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao carregar resumo da loja');
  return body;
}
