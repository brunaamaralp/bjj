/**
 * Cronograma de parcelas para previsão de caixa (cliente + servidor).
 */
import { parseYmd, formatYmd } from './financeForecastCore.js';
import { forecastPaymentDueYmd } from './financeForecastInflows.js';
import { openMensalidadeAmount } from './receivablesAggregate.js';
import { usesInstallmentCardFee, canonicalPaymentMethodKey } from './paymentMethods.js';
import { forecastInflowAmounts } from './acquirerFees.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function addMonthsYmd(ymd, months) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setMonth(d.getMonth() + Number(months) || 0);
  return formatYmd(d);
}

/**
 * @param {unknown} raw
 * @returns {Array<{ installment_number: number, due_date: string, amount: number, status: string }>}
 */
export function parseInstallmentScheduleJson(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row, idx) => {
        const due = String(row?.due_date || '').slice(0, 10);
        const amount = roundMoney(row?.amount);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || amount < 0.01) return null;
        return {
          installment_number: Math.trunc(Number(row?.installment_number) || idx + 1),
          due_date: due,
          amount,
          status: String(row?.status || 'pending').toLowerCase(),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.installment_number - b.installment_number);
  } catch {
    return [];
  }
}

export function buildEqualInstallmentSchedule(total, count, firstDueYmd) {
  const n = Math.max(1, Math.trunc(Number(count) || 1));
  const firstDue = String(firstDueYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return [];

  const t = roundMoney(total);
  if (t < 0.01) return [];

  const base = roundMoney(t / n);
  const out = [];
  let allocated = 0;
  for (let i = 0; i < n; i += 1) {
    const amt = i === n - 1 ? roundMoney(t - allocated) : base;
    allocated += amt;
    out.push({
      installment_number: i + 1,
      due_date: addMonthsYmd(firstDue, i),
      amount: amt,
      status: 'pending',
    });
  }
  return out;
}

const OPEN_PAYMENT_STATUSES = new Set(['pending', 'awaiting', 'partial']);

/** Parcelas em aberto cobradas do aluno (boleto/carnê/parcelamento manual). */
export function resolvePaymentInstallmentSchedule(payment, student, financeConfig) {
  const stored = parseInstallmentScheduleJson(payment?.installment_schedule_json);
  if (stored.length) {
    return stored.filter((row) => row.status !== 'received' && row.status !== 'paid');
  }

  const installments = Math.trunc(Number(payment?.installments) || 1);
  if (installments <= 1) return [];

  const st = String(payment?.status || '').toLowerCase();
  if (!OPEN_PAYMENT_STATUSES.has(st)) return [];

  const openTotal = openMensalidadeAmount(student, payment, financeConfig);
  if (openTotal < 0.01) return [];

  const firstDue = forecastPaymentDueYmd(payment, student);
  if (!firstDue) return [];

  return buildEqualInstallmentSchedule(openTotal, installments, firstDue);
}

/** Parcelas futuras de venda a prazo (JSON explícito ou total ÷ N). */
export function resolveSaleInstallmentSchedule(sale) {
  const stored = parseInstallmentScheduleJson(sale?.installment_schedule_json);
  if (stored.length) {
    return stored.filter((row) => row.status !== 'received' && row.status !== 'paid');
  }

  if (!(sale?.deferred === true || String(sale?.status || '').toLowerCase() === 'pendente')) {
    return [];
  }

  const installments = Math.trunc(Number(sale?.installments) || 1);
  if (installments <= 1) return [];

  const total = roundMoney(Number(sale?.total) || 0);
  const firstDue = String(sale?.due_date || '').slice(0, 10);
  if (total < 0.01 || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return [];

  return buildEqualInstallmentSchedule(total, installments, firstDue);
}

/**
 * Liquidação futura na conta (operadora): só quando há cronograma explícito
 * e o pagamento já foi registrado como pago no Nave.
 */
export function resolveAcquirerSettlementSchedule(payment) {
  const st = String(payment?.status || '').toLowerCase();
  if (st !== 'paid') return [];

  const installments = Math.trunc(Number(payment?.installments) || 1);
  if (installments <= 1) return [];

  const method = canonicalPaymentMethodKey(payment?.method);
  if (!usesInstallmentCardFee(method, installments)) return [];

  const stored = parseInstallmentScheduleJson(payment?.installment_schedule_json);
  if (!stored.length) return [];

  return stored.filter((row) => row.status !== 'received' && row.status !== 'paid');
}

export function paymentHasInstallmentForecast(payment, student, financeConfig) {
  return resolvePaymentInstallmentSchedule(payment, student, financeConfig).length > 0;
}

export function saleHasInstallmentForecast(sale) {
  return resolveSaleInstallmentSchedule(sale).length > 0;
}

/**
 * @returns {Array<{ type: string, label: string, amount: number, due_date: string, lead_id?: string, student_name?: string, status: string }>}
 */
export function buildForecastInstallmentItems({
  payments = [],
  sales = [],
  studentsByLead = new Map(),
  financeConfig = {},
  fromYmd,
  toYmd,
  studentNames = new Map(),
}) {
  const items = [];
  const inRange = (due) => {
    const ymd = String(due || '').slice(0, 10);
    return ymd && ymd >= fromYmd && ymd <= toYmd;
  };

  for (const p of payments) {
    const leadId = String(p.lead_id || '').trim();
    const student = studentsByLead.get(leadId) || null;
    const name = studentNames.get(leadId) || 'Aluno';

    const customerSchedule = resolvePaymentInstallmentSchedule(p, student, financeConfig);
    const acquirerSchedule = resolveAcquirerSettlementSchedule(p);
    const schedule = customerSchedule.length ? customerSchedule : acquirerSchedule;
    if (!schedule.length) continue;

    const plan = String(p.plan_name || student?.plan || 'Mensalidade').trim();
    const totalN = schedule.length;

    for (const inst of schedule) {
      if (!inRange(inst.due_date)) continue;
      const grossClient = roundMoney(inst.gross ?? inst.amount);
      const method = p.method || 'pix';
      const installments = Math.min(12, Math.max(1, Number(p.installments) || totalN));
      const amounts =
        Number.isFinite(Number(inst.net)) && Number(inst.net) > 0 && inst.gross != null
          ? { amount: roundMoney(inst.net), amount_gross: grossClient }
          : forecastInflowAmounts(grossClient, method, installments, financeConfig);
      const amt = roundMoney(amounts.amount);
      if (amt < 0.01) continue;
      const kind = customerSchedule.length ? 'parcela' : 'liquidacao';
      items.push({
        type: kind,
        label:
          kind === 'liquidacao'
            ? `Liquidação ${inst.installment_number}/${totalN} — ${plan} — ${name}`
            : `Parcela ${inst.installment_number}/${totalN} — ${plan} — ${name}`,
        amount: amt,
        amount_gross: roundMoney(amounts.amount_gross ?? grossClient),
        due_date: inst.due_date,
        lead_id: leadId || undefined,
        student_name: name,
        status: 'esperado',
      });
    }
  }

  for (const sale of sales) {
    const schedule = resolveSaleInstallmentSchedule(sale);
    if (!schedule.length) continue;
    const labelBase = String(sale.cliente_nome || sale.client_name || 'Venda').trim() || 'Venda';
    const leadId = String(sale.aluno_id || sale.lead_id || '').trim();
    const totalN = schedule.length;

    for (const inst of schedule) {
      if (!inRange(inst.due_date)) continue;
      const grossClient = roundMoney(inst.gross ?? inst.amount);
      const method = sale.forma_pagamento || sale.method || 'outro';
      const installments = Math.min(12, Math.max(1, Number(sale.installments) || totalN));
      const amounts =
        Number.isFinite(Number(inst.net)) && Number(inst.net) > 0 && inst.gross != null
          ? { amount: roundMoney(inst.net), amount_gross: grossClient }
          : forecastInflowAmounts(grossClient, method, installments, financeConfig);
      const amt = roundMoney(amounts.amount);
      if (amt < 0.01) continue;
      items.push({
        type: 'parcela',
        label: `Parcela ${inst.installment_number}/${totalN} — ${labelBase}`,
        amount: amt,
        amount_gross: roundMoney(amounts.amount_gross ?? grossClient),
        due_date: inst.due_date,
        lead_id: leadId || undefined,
        status: 'esperado',
      });
    }
  }

  return items;
}
