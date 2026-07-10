import { createSessionJwt } from './appwrite.js';
import { useLeadStore } from '../store/useLeadStore.js';

async function kimonoLoanFetch(path, options = {}) {
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
  if (!res.ok || data.sucesso === false) {
    const err = new Error(data.erro || data.error || `error_${res.status}`);
    err.code = data.erro || data.error;
    err.payload = data;
    throw err;
  }
  return data;
}

export async function fetchKimonoLoanBoard() {
  return kimonoLoanFetch('/api/inventory?kimono_loans=1');
}

export async function lendKimonoApi(payload) {
  return kimonoLoanFetch('/api/inventory', {
    method: 'POST',
    body: JSON.stringify({ action: 'kimono_loan_lend', ...payload }),
  });
}

export async function returnKimonoApi(loanId) {
  return kimonoLoanFetch('/api/inventory', {
    method: 'POST',
    body: JSON.stringify({ action: 'kimono_loan_return', loan_id: loanId }),
  });
}

export async function saveKimonoLoanSettingsApi(overdueHours) {
  return kimonoLoanFetch('/api/inventory', {
    method: 'POST',
    body: JSON.stringify({ action: 'kimono_loan_settings', overdue_hours: overdueHours }),
  });
}
