
function normalizeExpenseMethod(m) {
  const raw = String(m || '').trim().toLowerCase();
  if (!raw) return 'dinheiro';
  const map = {
    pix: 'pix',
    dinheiro: 'dinheiro',
    'cartão débito': 'cartão_débito',
    'cartao débito': 'cartão_débito',
    'cartão debito': 'cartão_débito',
    'cartão crédito': 'cartão_crédito',
    'cartao crédito': 'cartão_crédito',
    transferência: 'transferência',
    transferencia: 'transferência'
  };
  if (map[raw]) return map[raw];
  if (['cartão_débito', 'cartão_crédito', 'transferência', 'dinheiro', 'pix'].includes(raw)) return raw;
  return 'dinheiro';
}

import { createFinanceTx } from './financeTxApi.js';

/**
 * Registra despesa (saída) via API — valor positivo na UI, direction out, já liquidado.
 * @param {{ academyId: string, amount: number, description: string, method?: string, receive_now?: boolean }} p
 */
export async function createExpenseTransaction({ academyId, amount, description, method }) {
  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('academy_id_ausente');
  const abs = Math.abs(Number(amount) || 0);
  if (!Number.isFinite(abs) || abs <= 0) throw new Error('valor_invalido');
  const note = String(description || '').trim() || 'Despesa';
  return createFinanceTx({
    academyId: aid,
    payload: {
      type: 'expense',
      gross: abs,
      method: normalizeExpenseMethod(method),
      note,
      receive_now: true,
      status: 'settled',
    },
  });
}
