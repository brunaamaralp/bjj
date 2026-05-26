import { createSessionJwt } from './appwrite';
import { useLeadStore } from '../store/useLeadStore';

export async function fetchReportsByStudent(leadId, { academyId } = {}) {
  const id = String(leadId || '').trim();
  if (!id) throw new Error('lead_id_required');
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const aid = academyId || useLeadStore.getState().academyId;
  if (!aid) throw new Error('academy_required');

  const params = new URLSearchParams({ route: 'by-student', lead_id: id });
  const res = await fetch(`/api/reports/by-student?${params}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || data.error || `error_${res.status}`);
  return data;
}
