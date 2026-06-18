import { currentCompetenceMonth } from './financeCompetence.js';
import { todayYmdLocal } from './financeForecastCore.js';
import {
  defaultCategoryForDirection,
  resolveFinanceCategory,
} from './financeCategories.js';
import { defaultRecurrenceForm } from './financeRecurrence.js';

export function competenceMonthFromDueDate(dueDate) {
  const ymd = String(dueDate || '').slice(0, 10);
  const m = ymd.match(/^(\d{4})-(\d{2})/);
  if (!m) return '';
  return `${m[1]}-${m[2]}`;
}

/** Saída pendente: competência segue o mês do vencimento (espelha o servidor). */
export function shouldSyncCompetenceFromDueDate({ direction, receiveNow, editingTxId }) {
  if (editingTxId) return false;
  if (String(direction || '').toLowerCase() !== 'out') return false;
  return !receiveNow;
}

/** Ocultar aluno em saídas, exceto categoria tipo plano (improvável em despesa). */
export function shouldShowFinanceTxStudentField(direction, categoryType) {
  const isOut = String(direction || '').toLowerCase() === 'out';
  if (!isOut) return true;
  return categoryType === 'plan';
}

export function buildInitialTxForm(direction = 'in', { bankAccount = '' } = {}) {
  const isOut = String(direction).toLowerCase() === 'out';
  const cat = defaultCategoryForDirection(isOut ? 'out' : 'in');
  const due_date = todayYmdLocal();
  const competence_month = isOut
    ? competenceMonthFromDueDate(due_date) || currentCompetenceMonth()
    : currentCompetenceMonth();

  return {
    direction: isOut ? 'out' : 'in',
    type: cat.type,
    planName: '',
    method: 'pix',
    gross: '',
    fee: '',
    installments: 1,
    note: '',
    lead_id: '',
    competence_month,
    category: cat.label,
    bankAccount,
    due_date,
    ...defaultRecurrenceForm(),
  };
}

export function applyDirectionChangeToTxForm(prev, dir, { chartAccounts, receiveNow, editingTxId }) {
  const nextDir = dir === 'out' ? 'out' : 'in';
  const cat = defaultCategoryForDirection(nextDir);
  const prevCat = resolveFinanceCategory(prev.category, chartAccounts, {
    direction: prev.direction === 'out' ? 'out' : 'in',
  });
  const isPlan = cat.type === 'plan';
  const wasPlan = prevCat?.type === 'plan';
  const due_date = prev.due_date || todayYmdLocal();

  let competence_month = prev.competence_month;
  if (shouldSyncCompetenceFromDueDate({ direction: nextDir, receiveNow, editingTxId })) {
    competence_month = competenceMonthFromDueDate(due_date) || currentCompetenceMonth();
  }

  const keepStudent = shouldShowFinanceTxStudentField(nextDir, cat.type);

  return {
    ...prev,
    direction: nextDir,
    category: cat.label,
    type: cat.type,
    fee: nextDir === 'out' ? '' : prev.fee,
    installments: nextDir === 'out' ? 1 : prev.installments,
    planName: wasPlan !== isPlan ? '' : prev.planName,
    lead_id: keepStudent ? prev.lead_id : '',
    competence_month,
    due_date,
  };
}
