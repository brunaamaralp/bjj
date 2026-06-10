import { salesFetch } from './salesApi';

export async function fetchOpenCashShift() {
  return salesFetch('/api/sales?action=shift');
}

export async function openCashShift({ opening_balance }) {
  return salesFetch('/api/sales?action=shift_open', {
    method: 'POST',
    body: JSON.stringify({ opening_balance }),
  });
}

export async function closeCashShift({ counted_totals, closing_balance, notes }) {
  return salesFetch('/api/sales?action=shift_close', {
    method: 'PATCH',
    body: JSON.stringify({ counted_totals, closing_balance, notes }),
  });
}

export async function cashShiftMove({ type, amount, note }) {
  return salesFetch('/api/sales?action=shift_move', {
    method: 'POST',
    body: JSON.stringify({ type, amount, note }),
  });
}
