/**
 * Projeção de receita pós-assinatura de contratos (cliente + servidor).
 */
import { addDaysYmd, todayYmdLocal } from './financeForecastCore.js';
import { inForecastDateRange } from './financeForecastInflows.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function estimateContractFirstPaymentYmd(contract, todayYmd = todayYmdLocal()) {
  const today = String(todayYmd || todayYmdLocal()).slice(0, 10);
  const expires = String(contract?.expiresAt || contract?.expires_at || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    const afterExpiry = addDaysYmd(expires, 1);
    return afterExpiry >= today ? afterExpiry : addDaysYmd(today, 7);
  }
  return addDaysYmd(today, 14);
}

export function resolveContractForecastAmount(contract, student, financeConfig) {
  const planName = String(student?.plan || contract?.planName || '').trim();
  if (!planName) return 0;
  const plan = (financeConfig?.plans || []).find((p) => String(p?.name || '').trim() === planName);
  const price = Number(plan?.price);
  return Number.isFinite(price) && price > 0 ? roundMoney(price) : 0;
}

/**
 * @param {Array<object>} contracts — aguardando assinatura (sent/viewed)
 */
export function buildContractForecastItems(
  contracts = [],
  {
    studentsByLead = new Map(),
    financeConfig = {},
    fromYmd,
    toYmd,
    todayYmd = todayYmdLocal(),
  } = {}
) {
  const items = [];
  for (const contract of contracts) {
    const leadId = String(contract?.leadId || contract?.lead_id || '').trim();
    const student = leadId ? studentsByLead.get(leadId) || null : null;
    const amount = resolveContractForecastAmount(contract, student, financeConfig);
    if (amount < 0.01) continue;

    const due = estimateContractFirstPaymentYmd(contract, todayYmd);
    if (!inForecastDateRange(due, fromYmd, toYmd)) continue;

    const name =
      String(student?.name || student?.nome || contract?.name || '').trim() || 'Contrato';
    items.push({
      type: 'contrato',
      label: `1ª mensalidade estimada — ${name}`,
      amount,
      due_date: due,
      lead_id: leadId || undefined,
      student_name: student?.name || student?.nome || undefined,
      status: 'projetado',
      contract_id: String(contract?.$id || contract?.id || '').trim() || undefined,
    });
  }
  return items;
}
