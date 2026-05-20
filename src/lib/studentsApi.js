import { createSessionJwt } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';

async function studentsFetch(path, options = {}) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const academyId = useLeadStore.getState().academyId;
  if (!academyId) throw new Error('academy_required');

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
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}

export async function fetchStudentProfileBundle(studentId) {
  const id = encodeURIComponent(String(studentId || '').trim());
  return studentsFetch(`/api/students/${id}/profile`);
}

export async function deactivateStudentApi(payload) {
  return studentsFetch('/api/students/deactivate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function freezeStudentApi(payload) {
  return studentsFetch('/api/students/freeze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
