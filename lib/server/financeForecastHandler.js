/**
 * GET /api/finance/forecast?from=&to=&academy_id=
 * Cache em memória: 5 min por academy + período.
 */
import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';
import { isMensalidadesGridPayment } from '../../src/lib/paymentCategories.js';
import {
  buildWeekRanges,
  finalizeWeeks,
  pushForecastItem,
  projectRecurrenceOccurrences,
  roundMoney,
  sumForecastFlows,
  todayYmdLocal,
  addDaysYmd,
} from '../../src/lib/financeForecastCore.js';
import {
  competenceMonthFromYmd,
  hasPendingInstanceForPeriod,
} from '../../src/lib/financeRecurrenceDedup.js';
import {
  buildForecastDeferredSaleItems,
  buildForecastMensalidadePayments,
  forecastMensalidadeStatus,
  forecastPaymentDueYmd,
  inForecastDateRange,
  mensalidadeForecastAmount,
} from '../../src/lib/financeForecastInflows.js';
import { expectedAmountForStudent } from '../../src/lib/paymentStatus.js';
import {
  listDeferredSales,
  listGridPaymentsForAcademy,
} from './financeReceivablesData.js';
import { computeBankBalancesPayload } from './financeBankBalancesData.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { filterBankAccountsWithBank } from '../../src/lib/bankAccounts.js';
import { listContractsAwaitingForecast } from './financeForecastContracts.js';
import { buildContractForecastItems } from '../../src/lib/financeForecastContracts.js';
import {
  buildForecastInstallmentItems,
  paymentHasInstallmentForecast,
} from '../../src/lib/installmentSchedule.js';
import { forecastInflowAmounts } from '../../src/lib/acquirerFees.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const PAYMENTS_COL =
  process.env.VITE_APPWRITE_STUDENT_PAYMENTS_COL_ID ||
  process.env.APPWRITE_STUDENT_PAYMENTS_COLLECTION_ID ||
  '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const CACHE_TTL_MS = 5 * 60 * 1000;
const forecastCache = new Map();

function isAppwriteQueryError(e) {
  const msg = String(e?.message || '').toLowerCase();
  return (
    msg.includes('unknown attribute') ||
    msg.includes('invalid query') ||
    msg.includes('attribute not found') ||
    msg.includes('not available') ||
    (msg.includes('index') && msg.includes('not found'))
  );
}

function json(res, status, body) {
  res.status(status).json(body);
}

function cacheKey(academyId, from, to) {
  return `${academyId}|${from}|${to}`;
}

function getCached(key) {
  const hit = forecastCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    forecastCache.delete(key);
    return null;
  }
  return hit.data;
}

function setCached(key, data) {
  forecastCache.set(key, { at: Date.now(), data });
  if (forecastCache.size > 200) {
    const first = forecastCache.keys().next().value;
    if (first) forecastCache.delete(first);
  }
}

export function invalidateFinanceForecastCache(academyId) {
  if (!academyId) {
    forecastCache.clear();
    return;
  }
  const prefix = `${academyId}|`;
  for (const k of forecastCache.keys()) {
    if (k.startsWith(prefix)) forecastCache.delete(k);
  }
}

async function fetchAllPages(col, queries, { maxPages = 40 } = {}) {
  const PAGE = 100;
  let all = [];
  let cursor = null;
  for (let i = 0; i < maxPages; i += 1) {
    const q = [...queries, Query.limit(PAGE)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, col, q);
    const batch = res.documents || [];
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1]?.$id;
    if (!cursor) break;
  }
  return all;
}

async function fetchStudentsForAcademy(academyId) {
  if (!STUDENTS_COL) return [];
  try {
    return await fetchAllPages(STUDENTS_COL, [Query.equal('academyId', academyId)]);
  } catch (e) {
    if (!isAppwriteQueryError(e)) throw e;
    return [];
  }
}

async function resolveOpeningBalance(academyId, financeConfig, todayYmd, preloadedOpeningBalance) {
  if (preloadedOpeningBalance != null && Number.isFinite(Number(preloadedOpeningBalance))) {
    return { balance: Number(preloadedOpeningBalance), source: 'bank' };
  }

  const accounts = filterBankAccountsWithBank(financeConfig?.bankAccounts || []);
  if (accounts.length > 0) {
    try {
      const payload = await computeBankBalancesPayload(academyId, todayYmd, financeConfig);
      if (Number.isFinite(Number(payload?.totalBalance))) {
        return { balance: roundMoney(payload.totalBalance), source: 'bank' };
      }
    } catch (e) {
      console.error(JSON.stringify({
        event: 'finance_forecast_bank_opening_balance_error',
        academyId,
        error: e?.message || String(e),
      }));
    }
  }

  const todayEndIso = `${todayYmd}T23:59:59.999Z`;
  const ledger = await computeOpeningBalance(academyId, todayEndIso);
  return { balance: ledger, source: 'ledger' };
}

async function computeOpeningBalance(academyId, todayEndIso) {
  if (!FINANCIAL_TX_COL) return 0;
  const todayYmd = String(todayEndIso || '').slice(0, 10);
  let docs = [];
  try {
    try {
      docs = await fetchAllPages(FINANCIAL_TX_COL, [
        Query.equal('academyId', academyId),
        Query.equal('status', ['settled']),
        Query.lessThanEqual('settledAt', todayEndIso),
      ]);
    } catch (e) {
      if (!isAppwriteQueryError(e) && !String(e?.message || '').toLowerCase().includes('settledat')) {
        throw e;
      }
      docs = await fetchAllPages(FINANCIAL_TX_COL, [
        Query.equal('academyId', academyId),
        Query.equal('status', ['settled']),
      ]);
      docs = docs.filter((d) => {
        const ref = d.settledAt || d.$updatedAt || d.$createdAt;
        if (!ref) return true;
        return String(ref).slice(0, 10) <= todayYmd;
      });
    }
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_forecast_opening_balance_error',
      academyId,
      error: e?.message || String(e),
    }));
    return 0;
  }

  let balance = 0;
  for (const doc of docs) {
    const row = mapFinanceTxDoc(doc);
    if (!row || String(row.status).toLowerCase() === 'cancelled') continue;
    const dir = txDirection(row);
    const gross = Math.abs(Number(row.gross) || 0);
    const net = Math.abs(Number(row.net) || gross);
    if (dir === 'out') balance -= gross;
    else balance += net;
  }
  return roundMoney(balance);
}

function txDueYmd(doc, mapped) {
  if (doc.due_date) return String(doc.due_date).slice(0, 10);
  if (mapped.competence_month && /^\d{4}-\d{2}$/.test(mapped.competence_month)) {
    return `${mapped.competence_month}-28`;
  }
  if (doc.$createdAt) return String(doc.$createdAt).slice(0, 10);
  return todayYmdLocal();
}

async function loadStudentsForLeads(academyId, leadIds, { preloadedStudents = null } = {}) {
  const names = new Map();
  const studentsByLead = new Map();
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!STUDENTS_COL || !ids.length) return { names, studentsByLead };

  const ingestDoc = (doc) => {
    const id = String(doc.$id || doc.id || '').trim();
    if (!id || String(doc.academyId || '') !== String(academyId)) return;
    names.set(id, String(doc.name || doc.nome || '').trim() || 'Aluno');
    studentsByLead.set(id, doc);
  };

  if (Array.isArray(preloadedStudents) && preloadedStudents.length) {
    const idSet = new Set(ids);
    for (const doc of preloadedStudents) {
      const id = String(doc.$id || '').trim();
      if (idSet.has(id)) ingestDoc(doc);
    }
    for (const id of ids) {
      if (!studentsByLead.has(id)) studentsByLead.set(id, null);
    }
    return { names, studentsByLead };
  }

  if (ids.length > 15) {
    try {
      const all = await fetchStudentsForAcademy(academyId);
      const idSet = new Set(ids);
      for (const doc of all) {
        const id = String(doc.$id || '').trim();
        if (idSet.has(id)) ingestDoc(doc);
      }
      for (const id of ids) {
        if (!studentsByLead.has(id)) studentsByLead.set(id, null);
      }
      return { names, studentsByLead };
    } catch {
      void 0;
    }
  }

  for (const id of ids) {
    try {
      const doc = await databases.getDocument(DB_ID, STUDENTS_COL, id);
      ingestDoc(doc);
    } catch {
      studentsByLead.set(id, null);
    }
  }
  return { names, studentsByLead };
}

async function fetchOpenGridPayments(academyId) {
  if (!PAYMENTS_COL) return [];
  const merged = new Map();
  for (const status of ['pending', 'awaiting', 'partial']) {
    try {
      const docs = await fetchAllPages(PAYMENTS_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('status', status),
      ]);
      for (const d of docs) {
        if (isMensalidadesGridPayment(d)) merged.set(d.$id, d);
      }
    } catch (e) {
      if (!isAppwriteQueryError(e)) throw e;
    }
  }
  return [...merged.values()];
}

async function listForecastPayments(academyId, fromYmd, toYmd, { students: preloadedStudents = null } = {}) {
  let students = preloadedStudents;
  if (!students && STUDENTS_COL) {
    students = await fetchStudentsForAcademy(academyId);
  }

  const [gridPayments, openPayments] = await Promise.all([
    listGridPaymentsForAcademy(academyId),
    fetchOpenGridPayments(academyId),
  ]);

  const byId = new Map();
  for (const p of gridPayments) byId.set(p.$id, p);
  for (const p of openPayments) byId.set(p.$id, p);

  const payments = buildForecastMensalidadePayments({
    students: students || [],
    gridPayments: [...byId.values()],
    academyId,
    fromYmd,
    toYmd,
  });

  return {
    payments,
    students: students || [],
    sourcePayments: [...byId.values()],
  };
}

async function listPendingFinancialTx(academyId) {
  if (!FINANCIAL_TX_COL) return [];
  try {
    return await fetchAllPages(FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('status', ['pending']),
    ]);
  } catch {
    return [];
  }
}

async function listRecurrenceTemplates(academyId) {
  if (!FINANCIAL_TX_COL) return [];
  try {
    return await fetchAllPages(FINANCIAL_TX_COL, [
      Query.equal('academyId', academyId),
      Query.equal('is_recurrence_template', true),
    ]);
  } catch (e) {
    if (isAppwriteQueryError(e)) return [];
    throw e;
  }
}

export async function buildFinanceForecast(
  academyId,
  fromYmd,
  toYmd,
  { financeConfig = {}, preloadedStudents = null, preloadedOpeningBalance = null } = {}
) {
  const today = todayYmdLocal();
  const from = fromYmd || today;
  const to = toYmd || from;
  const weeks = buildWeekRanges(from, to);

  const opening_balance_promise = resolveOpeningBalance(
    academyId,
    financeConfig,
    today,
    preloadedOpeningBalance
  );
  const payments_promise = listForecastPayments(academyId, from, to, {
    students: preloadedStudents,
  });
  const pendingTx_promise = listPendingFinancialTx(academyId);
  const templates_promise = listRecurrenceTemplates(academyId);
  const deferredSales_promise = listDeferredSales(academyId);
  const contracts_promise = listContractsAwaitingForecast(academyId);

  const [openingBalanceResult, paymentsResult, pendingTx, templates, deferredSales, contracts] =
    await Promise.all([
      opening_balance_promise,
      payments_promise,
      pendingTx_promise,
      templates_promise,
      deferredSales_promise,
      contracts_promise,
    ]);

  const opening_balance = openingBalanceResult.balance;
  const opening_balance_source = openingBalanceResult.source;

  const payments = paymentsResult.payments;
  const deferredItems = buildForecastDeferredSaleItems(deferredSales, from, to);
  const contractLeadIds = contracts.map((c) => String(c.leadId || ''));
  const leadIds = [
    ...payments.map((p) => String(p.lead_id || '')),
    ...deferredItems.map((s) => String(s.lead_id || '')),
    ...contractLeadIds,
  ];
  const { names: studentNames, studentsByLead } = await loadStudentsForLeads(academyId, leadIds, {
    preloadedStudents: paymentsResult.students,
  });

  for (const p of payments) {
    const st = String(p.status || '').toLowerCase();
    const leadId = String(p.lead_id || '');
    const student = studentsByLead.get(leadId) || null;
    if (paymentHasInstallmentForecast(p, student, financeConfig)) continue;

    const due = forecastPaymentDueYmd(p, student);
    if (!inForecastDateRange(due, from, to)) continue;

    const gross = roundMoney(mensalidadeForecastAmount(student, p, financeConfig));
    if (gross <= 0) continue;

    const method = p.method || 'pix';
    const installments = Math.min(12, Math.max(1, Number(p.installments) || 1));
    const planBase = expectedAmountForStudent(student, financeConfig, p);
    const amounts = forecastInflowAmounts(gross, method, installments, financeConfig, planBase);

    const name = studentNames.get(leadId) || 'Aluno';
    const plan = String(p.plan_name || student?.plan || 'Mensalidade').trim();

    pushForecastItem(weeks, {
      type: 'mensalidade',
      label: `${plan} — ${name}`,
      amount: amounts.amount,
      amount_gross: amounts.amount_gross,
      due_date: due,
      student_name: name,
      lead_id: leadId || undefined,
      status: forecastMensalidadeStatus(st),
      _flow: 'in',
    });
  }

  const installmentItems = buildForecastInstallmentItems({
    payments: paymentsResult.sourcePayments || payments,
    sales: deferredSales,
    studentsByLead,
    financeConfig,
    fromYmd: from,
    toYmd: to,
    studentNames,
  });
  for (const inst of installmentItems) {
    pushForecastItem(weeks, { ...inst, _flow: 'in' });
  }

  const contractItems = buildContractForecastItems(contracts, {
    studentsByLead,
    financeConfig,
    fromYmd: from,
    toYmd: to,
    todayYmd: today,
  });
  for (const contract of contractItems) {
    const gross = roundMoney(contract.amount);
    if (gross <= 0) continue;
    const amounts = forecastInflowAmounts(gross, 'pix', 1, financeConfig);
    pushForecastItem(weeks, {
      ...contract,
      amount: amounts.amount,
      amount_gross: amounts.amount_gross,
      _flow: 'in',
    });
  }

  for (const sale of deferredItems) {
    const due = String(sale.due_date || '').slice(0, 10) || addDaysYmd(today, 7);
    if (!inForecastDateRange(due, from, to)) continue;
    const gross = roundMoney(sale.amount);
    if (gross <= 0) continue;
    const saleId = String(sale.sale_id || '').trim();
    const saleDoc = saleId
      ? deferredSales.find((s) => String(s.$id || s.id || '').trim() === saleId)
      : null;
    const method = saleDoc?.forma_pagamento || saleDoc?.method || 'outro';
    const installments = Math.min(
      12,
      Math.max(1, Number(saleDoc?.installments) || 1)
    );
    const amounts = forecastInflowAmounts(gross, method, installments, financeConfig);
    pushForecastItem(weeks, {
      type: 'venda',
      label: String(sale.label || 'Venda a receber').trim(),
      amount: amounts.amount,
      amount_gross: amounts.amount_gross,
      due_date: due,
      lead_id: sale.lead_id || undefined,
      status: 'esperado',
      _flow: 'in',
    });
  }

  for (const doc of pendingTx) {
    const mapped = mapFinanceTxDoc(doc);
    if (!mapped) continue;
    const dir = txDirection(mapped);
    const due = txDueYmd(doc, mapped);
    if (!inForecastDateRange(due, from, to)) continue;

    const gross = roundMoney(Math.abs(Number(mapped.gross) || 0));
    if (gross <= 0) continue;

    const leadId = String(mapped.lead_id || '');
    if (dir === 'out') {
      pushForecastItem(weeks, {
        type: 'pendente',
        label: String(mapped.planName || mapped.category || mapped.note || 'Lançamento pendente').trim(),
        amount: gross,
        due_date: due,
        student_name: leadId ? studentNames.get(leadId) : undefined,
        lead_id: leadId || undefined,
        status: 'esperado',
        _flow: 'out',
      });
      continue;
    }

    const storedNet = roundMoney(Math.abs(Number(mapped.net) || 0));
    const storedFee = roundMoney(Math.abs(Number(mapped.fee) || 0));
    const amounts =
      storedFee > 0 && storedNet > 0 && storedNet <= gross
        ? { amount: storedNet, amount_gross: gross }
        : forecastInflowAmounts(
            gross,
            mapped.method || doc.method,
            mapped.installments,
            financeConfig
          );

    pushForecastItem(weeks, {
      type: 'pendente',
      label: String(mapped.planName || mapped.category || mapped.note || 'Lançamento pendente').trim(),
      amount: amounts.amount,
      amount_gross: amounts.amount_gross,
      due_date: due,
      student_name: leadId ? studentNames.get(leadId) : undefined,
      lead_id: leadId || undefined,
      status: 'esperado',
      _flow: 'in',
    });
  }

  for (const doc of templates) {
    const mapped = mapFinanceTxDoc(doc);
    if (!mapped) continue;
    const dir = txDirection(mapped);
    const templateId = String(doc.$id || '');
    const occurrences = projectRecurrenceOccurrences(
      {
        gross: mapped.gross,
        recurrence_type: doc.recurrence_type,
        recurrence_day: doc.recurrence_day,
        base_date: txDueYmd(doc, mapped),
        label: mapped.planName || mapped.category,
        planName: mapped.planName,
        category: mapped.category,
        lead_id: mapped.lead_id,
        _flow: dir === 'out' ? 'out' : 'in',
      },
      from,
      to
    );
    for (const occ of occurrences) {
      if (!inForecastDateRange(occ.due_date, from, to)) continue;
      if (templateId) {
        const cm = competenceMonthFromYmd(occ.due_date);
        if (cm && hasPendingInstanceForPeriod(pendingTx, templateId, cm)) continue;
      }
      pushForecastItem(weeks, occ);
    }
  }

  finalizeWeeks(weeks);
  const { inflow, inflow_gross, outflow } = sumForecastFlows(weeks);
  const closing_balance = roundMoney(opening_balance + inflow - outflow);

  const weeksOut = weeks.map((w) => ({
    week_start: w.week_start,
    week_end: w.week_end,
    expected_inflow: w.expected_inflow,
    expected_inflow_gross: w.expected_inflow_gross ?? w.expected_inflow,
    expected_outflow: w.expected_outflow,
    net: w.net,
    items: w.items.map(({ _flow, ...rest }) => ({ ...rest, flow: _flow === 'out' ? 'out' : 'in' })),
  }));

  return {
    weeks: weeksOut,
    opening_balance,
    opening_balance_source,
    closing_balance,
    summary: {
      expected_inflow: inflow,
      expected_inflow_gross: inflow_gross,
      expected_outflow: outflow,
      net: roundMoney(inflow - outflow),
    },
    from,
    to,
    cached_at: new Date().toISOString(),
  };
}

export default async function financeForecastHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  const bodyAid = String(req.query.academy_id || '').trim();
  if (bodyAid && bodyAid !== academyId) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const from = String(req.query.from || '').trim().slice(0, 10);
  const to = String(req.query.to || '').trim().slice(0, 10);
  if (!from || !to) {
    return json(res, 400, { ok: false, error: 'from_to_required' });
  }

  const bustCache = String(req.query._ || req.query.refresh || '').trim();
  const key = cacheKey(academyId, from, to);
  if (!bustCache) {
    const cached = getCached(key);
    if (cached) {
      return json(res, 200, { ok: true, cached: true, ...cached });
    }
  }

  let financeConfig = {};
  try {
    financeConfig = mergeFinanceConfigFromAcademyDoc(academyDoc || {});
  } catch {
    financeConfig = {};
  }

  try {
    const data = await buildFinanceForecast(academyId, from, to, { financeConfig });
    setCached(key, data);
    return json(res, 200, { ok: true, cached: false, ...data });
  } catch (e) {
    console.error(JSON.stringify({
      event: 'finance_forecast_error',
      academyId,
      from,
      to,
      error: e?.message || String(e),
      stack: e?.stack?.slice(0, 600),
    }));
    return json(res, 500, { ok: false, error: 'forecast_failed' });
  }
}
