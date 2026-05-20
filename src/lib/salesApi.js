import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';

export class SalesApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'SalesApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export async function salesFetch(path, options = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new SalesApiError('session_required');
  const academyId = useLeadStore.getState().academyId;
  if (!academyId) throw new SalesApiError('academy_required');

  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data.erro || data.error || `error_${res.status}`;
    throw new SalesApiError(code, { status: res.status, code, body: data });
  }
  return data;
}
