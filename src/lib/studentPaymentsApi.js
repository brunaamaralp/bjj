import { createSessionJwt } from './appwrite.js';
import { authedFetch } from './authInterceptor.js';
import { useUiStore } from '../store/useUiStore.js';

export class StudentPaymentsApiError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'StudentPaymentsApiError';
    this.status = status;
  }
}

async function paymentsFetch(path, options = {}, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new StudentPaymentsApiError('session_required', { status: 401 });

  const aid = String(academyId || '').trim();
  if (!aid) throw new StudentPaymentsApiError('academy_required', { status: 400 });

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${jwt}`);
  headers.set('x-academy-id', aid);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await authedFetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new StudentPaymentsApiError(data.erro || data.error || `HTTP ${res.status}`, {
      status: res.status,
    });
  }
  return data;
}

function notifyMirrorWarning(mirrorWarning) {
  if (!mirrorWarning) return;
  useUiStore.getState().addToast({
    type: 'warning',
    message:
      'Pagamento salvo, mas o espelho no Caixa falhou. Use "Verificar espelhos" na conciliação bancária.',
  });
}

export async function apiListStudentPayments({ referenceMonth, page = 1, limit = 100, cursor, academyId }) {
  const qs = new URLSearchParams({
    reference_month: String(referenceMonth || ''),
    page: String(page),
    limit: String(Math.min(200, Math.max(1, limit))),
  });
  if (cursor) qs.set('cursor', String(cursor));
  const data = await paymentsFetch(`/api/student-payments?${qs}`, {}, academyId);
  return {
    payments: data.payments || [],
    next_cursor: data.next_cursor || null,
  };
}

function dispatchPaymentUpdated(payload) {
  if (typeof window === 'undefined') return;
  const leadId = String(payload?.lead_id || '').trim();
  const referenceMonth = String(payload?.reference_month || '').trim();
  window.dispatchEvent(
    new CustomEvent('navi-student-payment-updated', {
      detail: { leadId, referenceMonth },
    })
  );
  window.dispatchEvent(new CustomEvent('navi-financial-tx-settled'));
}

export async function apiCreateStudentPayment(payload) {
  const data = await paymentsFetch(
    '/api/student-payments',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    payload?.academy_id
  );
  dispatchPaymentUpdated(payload);
  if (data.mirror_warning) notifyMirrorWarning(data.mirror_warning);
  return data.payment;
}

export async function apiUpdateStudentPayment(paymentId, patch) {
  const data = await paymentsFetch(
    `/api/student-payments?id=${encodeURIComponent(paymentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    patch?.academy_id
  );
  dispatchPaymentUpdated(patch);
  if (data.mirror_warning) notifyMirrorWarning(data.mirror_warning);
  return data.payment;
}

export async function apiDeleteStudentPayment(paymentId, academyId) {
  const data = await paymentsFetch(
    `/api/student-payments?id=${encodeURIComponent(paymentId)}`,
    { method: 'DELETE' },
    academyId
  );
  return data;
}

export async function apiSnoozeCollectionRegua(studentId, referenceMonth, academyId) {
  return paymentsFetch(
    '/api/students?action=collection-snooze',
    {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, reference_month: referenceMonth }),
    },
    academyId
  );
}
