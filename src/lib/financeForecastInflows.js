/**
 * Montagem de entradas de mensalidade para Previsão (cliente + servidor).
 */
import { isActiveStudent } from './studentStatus.js';
import {
  buildPaidBundleCoveredMonthsByLead,
  isMonthCoveredByPaidBundle,
} from './bundleCoverage.js';
import { isMensalidadesGridPayment } from './paymentCategories.js';
import { dueDateInMonth, studentDueDay } from './collectionOverdue.js';
import { formatYmd } from './financeForecastCore.js';
import { openMensalidadeAmount, buildDeferredSaleReceivableItems } from './receivablesAggregate.js';
import { expectedAmountForStudent } from './paymentStatus.js';
import { saleHasInstallmentForecast } from './installmentSchedule.js';
import { forecastInflowAmounts } from './acquirerFees.js';

const OPEN_STATUSES = new Set(['pending', 'awaiting', 'partial']);

export function studentEnrollmentMonthYm(student) {
  const raw = String(
    student?.converted_at || student?.enrollmentDate || student?.createdAt || ''
  ).trim();
  const iso = raw.match(/^(\d{4}-\d{2})/);
  if (iso) return iso[1];
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}`;
  return null;
}

export function monthsBetweenYm(fromYmd, toYmd) {
  const out = [];
  const from = String(fromYmd || '').slice(0, 7);
  const to = String(toYmd || '').slice(0, 7);
  const mFrom = from.match(/^(\d{4})-(\d{2})$/);
  const mTo = to.match(/^(\d{4})-(\d{2})$/);
  if (!mFrom || !mTo) return out;
  const cur = new Date(Number(mFrom[1]), Number(mFrom[2]) - 1, 1, 12, 0, 0, 0);
  const end = new Date(Number(mTo[1]), Number(mTo[2]) - 1, 1, 12, 0, 0, 0);
  while (cur <= end) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
    if (out.length > 36) break;
  }
  return out;
}

export function paymentRecordKey(leadId, ym) {
  return `${leadId}|${ym}`;
}

/** Índice lead+mês com qualquer registro na grade. */
export function buildPaymentsByLeadMonth(payments = []) {
  const map = new Map();
  for (const p of payments) {
    if (!isMensalidadesGridPayment(p)) continue;
    const lid = String(p.lead_id || '').trim();
    const ym = String(p.reference_month || '').trim().slice(0, 7);
    if (!lid || !/^\d{4}-\d{2}$/.test(ym)) continue;
    map.set(paymentRecordKey(lid, ym), p);
  }
  return map;
}

export function forecastPaymentDueYmd(payment, student) {
  if (payment?.due_date) return String(payment.due_date).slice(0, 10);
  const ref = String(payment?.reference_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(ref)) {
    const day = studentDueDay(student) || 10;
    const d = dueDateInMonth(ref, day);
    return d ? formatYmd(d) : null;
  }
  return null;
}

export function inForecastDateRange(ymd, from, to) {
  return ymd && ymd >= from && ymd <= to;
}

export function forecastMensalidadeStatus(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'awaiting') return 'awaiting';
  if (s === 'projetado') return 'projetado';
  if (s === 'partial') return 'partial';
  return 'esperado';
}

/**
 * Pagamentos abertos + projeções futuras (sem duplicar bundle ou meses com registro).
 */
export function buildForecastMensalidadePayments({
  students = [],
  gridPayments = [],
  academyId,
  fromYmd,
  toYmd,
}) {
  const monthSet = new Set(monthsBetweenYm(fromYmd, toYmd));
  const bundleCoveredByLead = buildPaidBundleCoveredMonthsByLead(gridPayments);
  const payByLeadMonth = buildPaymentsByLeadMonth(gridPayments);
  const byDocId = new Map();

  for (const p of gridPayments) {
    if (!isMensalidadesGridPayment(p)) continue;
    const st = String(p.status || '').toLowerCase();
    if (!OPEN_STATUSES.has(st)) continue;
    const id = String(p.$id || p.id || '').trim();
    if (id) byDocId.set(id, p);
  }

  for (const s of students) {
    if (!isActiveStudent(s) || !String(s.plan || '').trim()) continue;
    const leadId = String(s.$id || s.id || '').trim();
    if (!leadId) continue;
    const enrollYm = studentEnrollmentMonthYm(s);

    for (const ym of monthSet) {
      if (enrollYm && ym < enrollYm) continue;
      if (isMonthCoveredByPaidBundle(ym, bundleCoveredByLead.get(leadId))) continue;
      if (payByLeadMonth.has(paymentRecordKey(leadId, ym))) continue;

      const syntheticId = `projected:${leadId}:${ym}`;
      if (byDocId.has(syntheticId)) continue;
      byDocId.set(syntheticId, {
        $id: syntheticId,
        academy_id: academyId,
        lead_id: leadId,
        reference_month: ym,
        status: 'projetado',
        type: 'mensalidade',
        plan_name: String(s.plan || '').trim(),
        amount: 0,
        _projected: true,
      });
    }
  }

  return [...byDocId.values()];
}

export function buildForecastDeferredSaleItems(deferredSales = [], fromYmd, toYmd) {
  return buildDeferredSaleReceivableItems(deferredSales)
    .filter((item) => {
      const saleId = String(item.sale_id || '').trim();
      const sale = saleId
        ? deferredSales.find((s) => String(s.$id || s.id || '').trim() === saleId)
        : null;
      if (sale && saleHasInstallmentForecast(sale)) return false;
      const due = String(item.due_date || '').slice(0, 10);
      if (!due) return true;
      return inForecastDateRange(due, fromYmd, toYmd);
    });
}

export function mensalidadeForecastAmount(student, payment, financeConfig) {
  return openMensalidadeAmount(student, payment, financeConfig);
}

/** Valor líquido estimado (MDR) para previsão de mensalidade. */
export function mensalidadeForecastNetAmount(student, payment, financeConfig) {
  const gross = mensalidadeForecastAmount(student, payment, financeConfig);
  const method = payment?.method || 'pix';
  const installments = Math.min(12, Math.max(1, Number(payment?.installments) || 1));
  const planBase = expectedAmountForStudent(student, financeConfig, payment);
  return forecastInflowAmounts(gross, method, installments, financeConfig, planBase);
}
