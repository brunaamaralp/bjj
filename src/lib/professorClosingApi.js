import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';

/**
 * Hub mensal de fechamento de professores.
 * GET /api/finance?route=professor-closing&month=YYYY-MM
 * @param {string} month YYYY-MM
 * @param {string} [academyId]
 */
export async function fetchProfessorClosingMonth(month, academyId) {
  const ym = String(month || '').trim();
  if (!ym) throw new Error('month_required');

  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const params = new URLSearchParams({
    route: 'professor-closing',
    month: ym,
  });

  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${jwt}`,
  };
  const aid = String(academyId || '').trim();
  if (aid) headers['x-academy-id'] = aid;

  const res = await authedFetch(`/api/finance?${params}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || 'Erro ao carregar fechamento de professores');
  }
  return body;
}

async function professorClosingPost(payload, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };
  const aid = String(academyId || '').trim();
  if (aid) headers['x-academy-id'] = aid;

  const res = await authedFetch('/api/finance?route=professor-closing', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || body.message || 'Erro no fechamento de professores');
  }
  return body;
}

/**
 * Marca fechamento do mês como pago e cria despesa liquidada (titular/admin).
 * @param {{ month: string, staff_ref: string, payment_method?: string, bank_account_id?: string, academyId?: string }} opts
 */
export async function markProfessorClosingPaid({
  month,
  staff_ref,
  payment_method = 'pix',
  bank_account_id,
  academyId,
} = {}) {
  const ym = String(month || '').trim();
  const ref = String(staff_ref || '').trim();
  if (!ym) throw new Error('month_required');
  if (!ref) throw new Error('staff_ref_required');

  return professorClosingPost(
    {
      action: 'mark-paid',
      month: ym,
      staff_ref: ref,
      payment_method: String(payment_method || 'pix').trim() || 'pix',
      ...(bank_account_id ? { bank_account_id: String(bank_account_id).trim() } : {}),
    },
    academyId
  );
}

/**
 * Reabre fechamento pago e estorna/cancela o lançamento financeiro vinculado.
 * @param {{ month: string, staff_ref: string, closing_id?: string, academyId?: string }} opts
 */
export async function reopenProfessorClosing({
  month,
  staff_ref,
  closing_id,
  academyId,
} = {}) {
  const ym = String(month || '').trim();
  const ref = String(staff_ref || '').trim();
  const cid = String(closing_id || '').trim();
  if (!cid && !ym) throw new Error('month_required');
  if (!cid && !ref) throw new Error('staff_ref_required');

  return professorClosingPost(
    {
      action: 'reopen',
      ...(ym ? { month: ym } : {}),
      ...(ref ? { staff_ref: ref } : {}),
      ...(cid ? { closing_id: cid } : {}),
    },
    academyId
  );
}
