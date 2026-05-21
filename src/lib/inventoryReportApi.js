import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';

export async function fetchInventoryReport({ from, to, academyId }) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const aid = academyId || useLeadStore.getState().academyId;
  if (!aid) throw new Error('academy_required');

  const params = new URLSearchParams({ report: '1', from, to });
  const res = await fetch(`/api/inventory/report?${params}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}
