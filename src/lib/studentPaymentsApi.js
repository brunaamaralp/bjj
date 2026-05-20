import { createSessionJwt } from './appwrite.js';

async function paymentsFetch(path, options = {}, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('academy_required');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${jwt}`);
  headers.set('x-academy-id', aid);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.erro || data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function apiListStudentPayments({ referenceMonth, page = 1, limit = 100, academyId }) {
  const qs = new URLSearchParams({
    reference_month: String(referenceMonth || ''),
    page: String(page),
    limit: String(limit),
  });
  const data = await paymentsFetch(`/api/student-payments?${qs}`, {}, academyId);
  return data.payments || [];
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
  return data.payment;
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
