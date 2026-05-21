
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
import { applyAccountingSideEffectsAuto } from './financeJournal.js';
import { competenceMonthFromIso, currentCompetenceMonth } from './financeCompetence.js';
import {
  FINANCE_CATEGORIES,
  normalizeFinanceCategory,
  resolveFinanceCategory,
} from './financeCategories.js';

/**
 * Registra despesa (saída) via API — valor positivo na UI, direction out, já liquidado.
 * @param {{ academyId: string, amount: number, description: string, method?: string, category?: string, competence_month?: string, settledAt?: string }} p
 */
export async function createExpenseTransaction({
  academyId,
  amount,
  description,
  method,
  category = FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
  competence_month,
  settledAt,
}) {
  const aid = String(academyId || '').trim();
  if (!aid) throw new Error('academy_id_ausente');
  const abs = Math.abs(Number(amount) || 0);
  if (!Number.isFinite(abs) || abs <= 0) throw new Error('valor_invalido');
  const note = String(description || '').trim() || 'Despesa';
  const settledIso = settledAt || new Date().toISOString();
  const cm =
    String(competence_month || '').trim().match(/^\d{4}-\d{2}$/)
      ? String(competence_month).trim()
      : competenceMonthFromIso(settledIso) || currentCompetenceMonth();

  const cat = resolveFinanceCategory(category) || FINANCE_CATEGORIES.OUTRAS_DESPESAS;
  const catLabel = normalizeFinanceCategory(cat.label);

  const tx = await createFinanceTx({
    academyId: aid,
    payload: {
      type: cat.type,
      category: catLabel,
      competence_month: cm,
      gross: abs,
      method: normalizeExpenseMethod(method),
      note,
      receive_now: true,
      status: 'settled',
      settledAt: settledIso,
    },
  });

  if (tx) {
    applyAccountingSideEffectsAuto(
      { ...tx, type: cat.type, category: catLabel, competence_month: cm, status: 'settled' },
      aid
    );
  }
  return tx;
}
