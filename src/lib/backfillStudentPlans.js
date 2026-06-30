/**
 * Backfill do campo plan em alunos/leads.
 */

import { findPlanByName } from './academyPlans.js';
import {
  STUDENT_PLAN_CONFIDENCE,
  buildStudentPlanAuditRow,
  inferPlanFromPayments,
  readStudentPlan,
  registeredPlanNameKeys,
} from './auditStudentPlans.js';

function planNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * CSV de atribuição: student_id + plan_final (ou plan).
 * @param {string} content
 */
export function parseAssignCsv(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.includes('student_id');
  const start = hasHeader ? 1 : 0;

  const idx = (key, fallback) => {
    const i = header.indexOf(key);
    return i >= 0 ? i : fallback;
  };

  const idIdx = hasHeader ? idx('student_id', 0) : 0;
  const planIdx = hasHeader
    ? (() => {
        const finalIdx = header.indexOf('plan_final');
        if (finalIdx >= 0) return finalIdx;
        const planOnly = header.indexOf('plan');
        return planOnly >= 0 ? planOnly : 1;
      })()
    : 1;

  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const student_id = String(cols[idIdx] || '').trim();
    const plan = String(cols[planIdx] || '').trim();
    if (!student_id || !plan) continue;
    rows.push({ student_id, plan_final: plan, source: 'csv' });
  }
  return rows;
}

/**
 * CSV legacy map: legacy_name, student_type, canonical_plan
 * @param {string} content
 */
export function parseLegacyPlanMapCsv(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (!lines.length) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.includes('legacy_name');
  const start = hasHeader ? 1 : 0;

  const legacyIdx = hasHeader ? header.indexOf('legacy_name') : 0;
  const typeIdx = hasHeader ? header.indexOf('student_type') : 1;
  const canonIdx = hasHeader ? header.indexOf('canonical_plan') : 2;

  const rules = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const legacy_name = String(cols[legacyIdx] || '').trim();
    const canonical_plan = String(cols[canonIdx] || '').trim();
    if (!legacy_name || !canonical_plan) continue;
    const student_type =
      typeIdx >= 0 && cols[typeIdx] !== undefined ? String(cols[typeIdx] || '').trim() : '';
    rules.push({ legacy_name, student_type, canonical_plan });
  }
  return rules;
}

export function isInfantilStudentType(type) {
  const t = String(type || '').trim().toLowerCase();
  return t === 'criança' || t === 'crianca' || t === 'juniores' || t === 'infantil';
}

export function readStudentType(doc) {
  return String(doc?.type || doc?.student_type || '').trim();
}

export function readStudentTurma(doc) {
  return String(doc?.turma || doc?.className || doc?.class_name || '').trim();
}

export function isInfantilStudent(doc) {
  if (isInfantilStudentType(readStudentType(doc))) return true;
  const turma = readStudentTurma(doc).toLowerCase();
  return turma === 'kids' || turma === 'juniores' || turma.includes('infantil');
}

/**
 * @param {string} legacyName
 * @param {string} studentType
 * @param {Array<{ legacy_name: string, student_type: string, canonical_plan: string }>} rules
 */
export function mapLegacyPlanName(legacyName, studentType, rules) {
  const legacy = String(legacyName || '').trim();
  if (!legacy) return '';
  const type = String(studentType || '').trim();
  const key = planNameKey(legacy);

  const typed = rules.filter(
    (r) => planNameKey(r.legacy_name) === key && String(r.student_type || '').trim() === type
  );
  if (typed.length === 1) return typed[0].canonical_plan;

  const generic = rules.filter(
    (r) => planNameKey(r.legacy_name) === key && !String(r.student_type || '').trim()
  );
  if (generic.length === 1) return generic[0].canonical_plan;

  return legacy;
}

/**
 * @param {string} name
 * @param {object[]} plans financeConfig.plans
 */
export function canonicalizePlanName(name, studentDoc, legacyRules, plans) {
  const raw = String(name || '').trim();
  if (!raw) return { plan: '', mapped: false };

  const registered = findPlanByName({ plans }, raw);
  if (registered) return { plan: registered.name, mapped: false };

  const mapped = mapLegacyPlanName(raw, readStudentType(studentDoc), legacyRules);
  const match = findPlanByName({ plans }, mapped);
  if (match) return { plan: match.name, mapped: mapped !== raw };

  if (registeredPlanNameKeys(plans).has(planNameKey(mapped))) {
    return { plan: mapped, mapped: mapped !== raw };
  }

  return { plan: raw, mapped: false };
}

/** Totais de pacote GBLP (parcela × meses) — anual costuma vir no valor cheio, ex. 12×289=3468. */
const GBLP_BUNDLE_TOTALS_INFANTIL = {
  2868: 'Plano Anual Infantil', // 12×239
  1674: 'Plano Semestral Infantil', // 6×279
  897: 'Plano Trimestral Infantil', // 3×299
};
const GBLP_BUNDLE_TOTALS_ADULTO = {
  3468: 'Plano Anual Adulto', // 12×289
  1980: 'Plano Semestral Adulto', // 6×330
  1080: 'Plano Trimestral Adulto', // 3×360
};

function isAnnualPaymentHint(options = {}) {
  const note = String(options.note || '').toLowerCase();
  const category = String(options.paymentCategory || '').toLowerCase();
  const months = Number(options.bundleMonths);
  return (
    months === 12 ||
    note.includes('anual') ||
    note.includes('plano anual') ||
    category === 'bundle'
  );
}

/** Valor mensal ou pacote (anual/semestral/trimestral) → plano canônico GBLP. */
export function inferPlanFromPaymentAmount(amount, studentDoc, options = {}) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { plan: '', confidence: STUDENT_PLAN_CONFIDENCE.NONE, ambiguous: false };
  }

  const rounded = Math.round(value * 100) / 100;
  const infantil = isInfantilStudent(studentDoc);
  const bundleTotals = infantil ? GBLP_BUNDLE_TOTALS_INFANTIL : GBLP_BUNDLE_TOTALS_ADULTO;
  const exactBundle = bundleTotals[rounded];
  if (exactBundle) {
    return { plan: exactBundle, confidence: STUDENT_PLAN_CONFIDENCE.HIGH, ambiguous: false };
  }

  const monthsList = [];
  const bundleMonths = Number(options.bundleMonths);
  if (bundleMonths >= 2 && bundleMonths <= 12) monthsList.push(bundleMonths);
  if (isAnnualPaymentHint(options) && !monthsList.includes(12)) monthsList.unshift(12);
  for (const months of [12, 6, 3]) {
    if (!monthsList.includes(months)) monthsList.push(months);
  }

  for (const months of monthsList) {
    const monthly = Math.round((rounded / months) * 100) / 100;
    const fromBundle = inferMonthlyPlanAmount(monthly, studentDoc);
    if (fromBundle.plan) {
      return {
        ...fromBundle,
        confidence:
          months === 12 ? STUDENT_PLAN_CONFIDENCE.HIGH : STUDENT_PLAN_CONFIDENCE.MEDIUM,
        ambiguous: fromBundle.ambiguous || months !== 12,
      };
    }
  }

  return inferMonthlyPlanAmount(rounded, studentDoc);
}

function inferMonthlyPlanAmount(rounded, studentDoc) {

  const infantil = isInfantilStudent(studentDoc);

  const infantilMap = {
    239: 'Plano Anual Infantil',
    279: ['Plano Recorrente Infantil', 'Plano Semestral Infantil'],
    299: 'Plano Trimestral Infantil',
    319: 'Plano Mensal Infantil',
  };
  const adultoMap = {
    289: 'Plano Anual Adulto',
    330: ['Plano Recorrente Adulto', 'Plano Semestral Adulto'],
    360: 'Plano Trimestral Adulto',
    390: 'Plano Mensal Adulto',
  };

  const table = infantil ? infantilMap : adultoMap;
  const hit = table[rounded];
  if (!hit) return { plan: '', confidence: STUDENT_PLAN_CONFIDENCE.NONE, ambiguous: false };

  if (Array.isArray(hit)) {
    return {
      plan: hit[0],
      confidence: STUDENT_PLAN_CONFIDENCE.MEDIUM,
      ambiguous: true,
      alternatives: hit,
    };
  }

  return { plan: hit, confidence: STUDENT_PLAN_CONFIDENCE.HIGH, ambiguous: false };
}

function paymentAmount(doc) {
  const raw = doc?.amount ?? doc?.paid_amount ?? doc?.value ?? 0;
  return Number(raw) || 0;
}

function paymentAmountSortKey(doc) {
  const bundleMonths = Number(doc?.bundle_months) || 0;
  const amount = paymentAmount(doc);
  const annualHint = bundleMonths >= 12 || /anual/i.test(String(doc?.note || '')) ? 1 : 0;
  return annualHint * 1_000_000 + amount;
}

function paymentSortKey(doc) {
  const ref = String(doc?.reference_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(ref)) return `${ref}-15`;
  const paid = String(doc?.paid_at || doc?.paidAt || doc?.payment_date || doc?.$createdAt || '');
  return paid.slice(0, 10) || '0000-00-00';
}

/**
 * @param {object[]} payments
 * @param {object} studentDoc
 * @param {object[]} legacyRules
 * @param {object[]} registeredPlans
 */
export function inferPlanForStudent(studentDoc, payments, legacyRules, registeredPlans) {
  const current = readStudentPlan(studentDoc);
  if (current) {
    const canon = canonicalizePlanName(current, studentDoc, legacyRules, registeredPlans);
    return {
      plan: canon.plan,
      source: 'current',
      confidence: STUDENT_PLAN_CONFIDENCE.CURRENT,
      mapped: canon.mapped,
    };
  }

  const named = inferPlanFromPayments(payments);
  if (named.plan) {
    const canon = canonicalizePlanName(named.plan, studentDoc, legacyRules, registeredPlans);
    return {
      plan: canon.plan,
      source: named.source,
      confidence: named.confidence,
      mapped: canon.mapped,
    };
  }

  const sorted = [...(payments || [])].sort((a, b) => {
    const byAmount = paymentAmountSortKey(b) - paymentAmountSortKey(a);
    if (byAmount !== 0) return byAmount;
    return paymentSortKey(b).localeCompare(paymentSortKey(a));
  });
  for (const pay of sorted) {
    const amt = paymentAmount(pay);
    if (amt <= 0) continue;
    const byAmount = inferPlanFromPaymentAmount(amt, studentDoc, {
      bundleMonths: pay.bundle_months,
      note: pay.note,
      paymentCategory: pay.payment_category,
    });
    if (byAmount.plan) {
      const canon = canonicalizePlanName(byAmount.plan, studentDoc, legacyRules, registeredPlans);
      return {
        plan: canon.plan,
        source: 'payment_amount',
        confidence: byAmount.confidence,
        mapped: canon.mapped,
        ambiguous: byAmount.ambiguous,
      };
    }
  }

  return { plan: '', source: 'none', confidence: STUDENT_PLAN_CONFIDENCE.NONE, mapped: false };
}

const CONFIDENCE_RANK = {
  [STUDENT_PLAN_CONFIDENCE.CURRENT]: 5,
  [STUDENT_PLAN_CONFIDENCE.HIGH]: 4,
  [STUDENT_PLAN_CONFIDENCE.MEDIUM]: 3,
  [STUDENT_PLAN_CONFIDENCE.LOW]: 2,
  [STUDENT_PLAN_CONFIDENCE.NONE]: 0,
};

export function confidenceMeetsMinimum(confidence, minConfidence) {
  const min = String(minConfidence || STUDENT_PLAN_CONFIDENCE.MEDIUM).toLowerCase();
  const need = CONFIDENCE_RANK[min] ?? CONFIDENCE_RANK[STUDENT_PLAN_CONFIDENCE.MEDIUM];
  const got = CONFIDENCE_RANK[String(confidence || '').toLowerCase()] ?? 0;
  return got >= need;
}

/**
 * @param {object} opts
 */
export function buildBackfillPlanUpdates(opts) {
  const {
    students = [],
    assignRows = [],
    paymentsByStudent = new Map(),
    legacyRules = [],
    registeredPlans = [],
    minConfidence = STUDENT_PLAN_CONFIDENCE.MEDIUM,
    skipUnregistered = true,
  } = opts;

  const assignById = new Map(assignRows.map((r) => [String(r.student_id), r]));
  const registeredKeys = registeredPlanNameKeys(registeredPlans);
  const toUpdate = [];
  const skipped = [];

  for (const doc of students) {
    const student_id = String(doc.$id || '').trim();
    if (!student_id) continue;

    const current = readStudentPlan(doc);
    const assigned = assignById.get(student_id);

    let target = '';
    let source = 'none';
    let confidence = STUDENT_PLAN_CONFIDENCE.NONE;

    if (assigned?.plan_final) {
      const canon = canonicalizePlanName(assigned.plan_final, doc, legacyRules, registeredPlans);
      target = canon.plan;
      source = assigned.source || 'csv';
      confidence = STUDENT_PLAN_CONFIDENCE.HIGH;
    } else {
      const payments = paymentsByStudent.get(student_id) || [];
      const inferred = inferPlanForStudent(doc, payments, legacyRules, registeredPlans);
      target = inferred.plan;
      source = inferred.source;
      confidence = inferred.confidence;
    }

    if (!target) {
      skipped.push({ student_id, reason: 'no_target', name: doc.name });
      continue;
    }

    if (!confidenceMeetsMinimum(confidence, minConfidence)) {
      skipped.push({ student_id, reason: 'low_confidence', name: doc.name, confidence, target });
      continue;
    }

    if (skipUnregistered && !registeredKeys.has(planNameKey(target))) {
      skipped.push({ student_id, reason: 'not_in_catalog', name: doc.name, target });
      continue;
    }

    if (planNameKey(current) === planNameKey(target)) {
      skipped.push({ student_id, reason: 'unchanged', name: doc.name, target });
      continue;
    }

    toUpdate.push({
      student_id,
      name: String(doc.name || '').trim(),
      plan_from: current,
      plan_to: target,
      source,
      confidence,
    });
  }

  return { toUpdate, skipped };
}

export function summarizeBackfillUpdates(result) {
  const toUpdate = result?.toUpdate || [];
  return {
    will_update: toUpdate.length,
    skipped: (result?.skipped || []).length,
    by_source: toUpdate.reduce((acc, row) => {
      const k = row.source || 'unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  };
}

/**
 * Gera linhas de inferência automática (para export / revisão).
 */
export function buildInferredAssignRows(students, paymentsByStudent, legacyRules, registeredPlans) {
  return students.map((doc) => {
    const student_id = String(doc.$id || '');
    const payments = paymentsByStudent.get(student_id) || [];
    const inferred = inferPlanForStudent(doc, payments, legacyRules, registeredPlans);
    const audit = buildStudentPlanAuditRow(
      doc,
      paymentsByStudent,
      registeredPlanNameKeys(registeredPlans)
    );
    return {
      ...audit,
      plan_inferred: inferred.plan || audit.plan_inferred,
      plan_final: inferred.plan || audit.plan_final,
      source: inferred.source,
      confidence: inferred.confidence,
    };
  });
}
