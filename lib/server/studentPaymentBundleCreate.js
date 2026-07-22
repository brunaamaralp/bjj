/**
 * Criação e reparo de pagamentos com cobertura (plano anual / pacote) no servidor.
 */
import { ID, Permission, Query, Role } from 'node-appwrite';
import {
  PAYMENT_CATEGORY,
  normalizePaymentCategory,
  isMensalidadesGridPayment,
  isBundleAnchorPayment,
  enumerateCoverageMonths,
} from '../../src/lib/paymentCategories.js';
import {
  buildCoverageMonthSpecs,
  buildHistoricalCoverageMonthSpecs,
  resolveBundleMonthAction,
  HISTORICAL_COVERAGE_MIN_MONTHS,
  HISTORICAL_COVERAGE_MAX_MONTHS,
  HISTORICAL_COVERED_REASON,
} from '../../src/lib/bundleCoverage.js';

const PAYMENT_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.update(Role.users()),
];

const OPTIONAL_ATTRS = [
  'paid_amount',
  'expected_amount',
  'payment_category',
  'bundle_months',
  'bundle_origin_id',
  'financial_tx_id',
  'covered_reason',
];

async function writePaymentDocument(databases, dbId, col, payload, existingId = null) {
  let current = { ...payload };
  for (let attempt = 0; attempt < OPTIONAL_ATTRS.length + 1; attempt += 1) {
    try {
      if (existingId) {
        return await databases.updateDocument(dbId, col, existingId, current);
      }
      return await databases.createDocument(dbId, col, ID.unique(), current, PAYMENT_PERMISSIONS);
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('Unknown attribute')) throw e;
      const next = { ...current };
      let stripped = false;
      for (const key of OPTIONAL_ATTRS) {
        if (key in next) {
          delete next[key];
          stripped = true;
        }
      }
      if (!stripped) throw e;
      current = next;
    }
  }
  throw new Error('payment_write_failed');
}

async function findPaymentForMonthUpsert(databases, dbId, col, leadId, referenceMonth) {
  const res = await databases.listDocuments(dbId, col, [
    Query.equal('lead_id', String(leadId)),
    Query.equal('reference_month', String(referenceMonth)),
    Query.limit(25),
  ]);
  for (const doc of res.documents || []) {
    if (isMensalidadesGridPayment(doc)) return doc;
  }
  return null;
}

function resolveAnchorBundleMonths(anchor) {
  const n = Number(anchor?.bundle_months);
  if (Number.isFinite(n) && n >= 1) return Math.trunc(n);
  if (normalizePaymentCategory(anchor) === PAYMENT_CATEGORY.BUNDLE) return 12;
  return 0;
}

/**
 * Plano com cobertura: âncora (paid + valor total + Caixa) + meses covered.
 */
export async function createBundlePaymentServer({
  databases,
  dbId,
  paymentsCol,
  data,
  mirrorAnchorFn,
}) {
  const bundleMonths = Number(data.bundle_months);
  const startYm = String(data.coverage_start_month || data.reference_month || '').trim();
  if (!bundleMonths || bundleMonths < 1 || !/^\d{4}-\d{2}$/.test(startYm)) {
    throw new Error('bundle_coverage_invalid');
  }

  const totalAmount = Number(data.amount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error('bundle_amount_invalid');
  }

  const base = {
    lead_id: String(data.lead_id),
    academy_id: String(data.academy_id),
    method: data.method || 'pix',
    account: String(data.account || ''),
    plan_name: String(data.plan_name || ''),
    paid_at: data.paid_at || null,
    registered_by: String(data.registered_by || ''),
    registered_by_name: String(data.registered_by_name || ''),
    note: String(data.note || ''),
    status: String(data.status || 'paid').toLowerCase(),
    payment_category: PAYMENT_CATEGORY.BUNDLE,
  };

  const specs = buildCoverageMonthSpecs({
    startYm,
    bundleMonths,
    totalAmount,
    base,
  });

  let anchorId = null;
  let anchor = null;
  let monthsCreated = 0;
  let monthsSkipped = 0;

  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const existing = await findPaymentForMonthUpsert(
      databases,
      dbId,
      paymentsCol,
      data.lead_id,
      spec.reference_month
    );
    const action = resolveBundleMonthAction(existing);

    if (action === 'skip') {
      monthsSkipped += 1;
      if (i === 0 && existing?.$id) {
        anchorId = existing.$id;
        anchor = existing;
      }
      continue;
    }

    const payload = {
      ...spec,
      bundle_origin_id: i === 0 ? undefined : anchorId,
      bundle_months: i === 0 ? bundleMonths : null,
    };

    const doc = await writePaymentDocument(
      databases,
      dbId,
      paymentsCol,
      payload,
      action === 'upsert' ? existing?.$id : null
    );

    monthsCreated += 1;

    if (i === 0) {
      anchor = doc;
      anchorId = doc.$id;
      if (String(doc.bundle_origin_id || '') !== anchorId) {
        try {
          anchor = await databases.updateDocument(dbId, paymentsCol, anchorId, {
            bundle_origin_id: anchorId,
          });
        } catch (e) {
          const msg = String(e?.message || '');
          if (!msg.includes('Unknown attribute')) throw e;
        }
      }
      if (typeof mirrorAnchorFn === 'function') {
        await mirrorAnchorFn(anchor, { ...data, ...spec, bundle_months: bundleMonths });
      }
    }
  }

  if (!anchorId) {
    throw new Error('bundle_anchor_not_created');
  }

  return {
    anchor: anchor || { $id: anchorId },
    monthsCreated,
    monthsSkipped,
    coverageMonths: enumerateCoverageMonths(startYm, bundleMonths),
  };
}

/**
 * Cobertura histórica: todos os meses `covered`, amount 0, sem espelho no Caixa.
 * Âncora = primeiro mês efetivamente escrito (pula paid/partial).
 */
export async function createHistoricalCoveragePaymentServer({
  databases,
  dbId,
  paymentsCol,
  data,
}) {
  const bundleMonths = Math.trunc(Number(data.bundle_months));
  const startYm = String(data.coverage_start_month || data.reference_month || '').trim();
  if (
    !Number.isFinite(bundleMonths) ||
    bundleMonths < HISTORICAL_COVERAGE_MIN_MONTHS ||
    bundleMonths > HISTORICAL_COVERAGE_MAX_MONTHS ||
    !/^\d{4}-\d{2}$/.test(startYm)
  ) {
    throw new Error('historical_coverage_invalid');
  }

  const specs = buildHistoricalCoverageMonthSpecs({
    startYm,
    bundleMonths,
    note: data.note,
  });
  if (specs.length === 0) {
    throw new Error('historical_coverage_invalid');
  }

  const baseMeta = {
    lead_id: String(data.lead_id),
    academy_id: String(data.academy_id),
    method: 'pix',
    account: '',
    plan_name: String(data.plan_name || ''),
    registered_by: String(data.registered_by || ''),
    registered_by_name: String(data.registered_by_name || ''),
  };

  let anchorId = null;
  let anchor = null;
  let monthsCreated = 0;
  let monthsSkipped = 0;

  for (const spec of specs) {
    const existing = await findPaymentForMonthUpsert(
      databases,
      dbId,
      paymentsCol,
      data.lead_id,
      spec.reference_month
    );
    const action = resolveBundleMonthAction(existing);

    if (action === 'skip') {
      monthsSkipped += 1;
      continue;
    }

    const isAnchor = !anchorId;
    const payload = {
      ...baseMeta,
      ...spec,
      payment_category: PAYMENT_CATEGORY.BUNDLE,
      covered_reason: HISTORICAL_COVERED_REASON,
      amount: 0,
      status: 'covered',
      paid_at: null,
      bundle_months: isAnchor ? bundleMonths : null,
      bundle_origin_id: isAnchor ? undefined : anchorId,
    };

    const doc = await writePaymentDocument(
      databases,
      dbId,
      paymentsCol,
      payload,
      action === 'upsert' ? existing?.$id : null
    );

    monthsCreated += 1;

    if (isAnchor) {
      anchor = doc;
      anchorId = doc.$id;
      if (String(doc.bundle_origin_id || '') !== anchorId) {
        try {
          anchor = await databases.updateDocument(dbId, paymentsCol, anchorId, {
            bundle_origin_id: anchorId,
          });
        } catch (e) {
          const msg = String(e?.message || '');
          if (!msg.includes('Unknown attribute')) throw e;
        }
      }
    }
  }

  if (!anchorId) {
    throw new Error('historical_coverage_nothing_to_write');
  }

  return {
    anchor: anchor || { $id: anchorId },
    monthsCreated,
    monthsSkipped,
    coverageMonths: enumerateCoverageMonths(startYm, bundleMonths),
  };
}

/**
 * Repara meses cobertos ausentes (ex.: bundle criado antes da correção da API).
 */
export async function repairBundleCoverageForMonth({
  databases,
  dbId,
  paymentsCol,
  academyId,
  referenceMonth,
}) {
  const ym = String(referenceMonth || '').trim();
  if (!ym || !/^\d{4}-\d{2}$/.test(ym) || !paymentsCol || !academyId) {
    return { repaired: [] };
  }

  const PAGE = 100;
  let cursor = null;
  const anchors = [];

  for (;;) {
    const queries = [
      Query.equal('academy_id', String(academyId)),
      Query.equal('payment_category', PAYMENT_CATEGORY.BUNDLE),
      Query.limit(PAGE),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(dbId, paymentsCol, queries);
    const batch = res.documents || [];
    for (const doc of batch) {
      if (!isBundleAnchorPayment(doc)) continue;
      const st = String(doc.status || '').toLowerCase();
      if (st !== 'paid') continue;
      const months = resolveAnchorBundleMonths(doc);
      if (!months) continue;
      const coverage = enumerateCoverageMonths(String(doc.reference_month || ''), months);
      if (coverage.includes(ym)) anchors.push({ anchor: doc, months });
    }
    if (batch.length < PAGE) break;
    cursor = batch[batch.length - 1].$id;
  }

  const repaired = [];
  for (const { anchor, months } of anchors) {
    const leadId = String(anchor.lead_id || '').trim();
    if (!leadId) continue;

    const startYm = String(anchor.reference_month || '').trim();
    if (!startYm) continue;

    const anchorId = String(anchor.$id || '').trim();
    const existing = await findPaymentForMonthUpsert(databases, dbId, paymentsCol, leadId, ym);

    if (existing) {
      if (ym === startYm && isBundleAnchorPayment(anchor) && !Number(anchor.bundle_months)) {
        const updated = await writePaymentDocument(
          databases,
          dbId,
          paymentsCol,
          {
            bundle_months: months,
            bundle_origin_id: anchorId,
            payment_category: PAYMENT_CATEGORY.BUNDLE,
          },
          anchorId
        );
        repaired.push(updated);
      }
      continue;
    }

    const totalAmount = Number(anchor.amount) || Number(anchor.paid_amount) || 0;
    if (!(totalAmount > 0)) continue;

    const specs = buildCoverageMonthSpecs({
      startYm,
      bundleMonths: months,
      totalAmount,
      base: {
        lead_id: leadId,
        academy_id: String(anchor.academy_id || academyId),
        method: anchor.method || 'pix',
        account: String(anchor.account || ''),
        plan_name: String(anchor.plan_name || ''),
        paid_at: anchor.paid_at || null,
        registered_by: String(anchor.registered_by || ''),
        registered_by_name: String(anchor.registered_by_name || ''),
        note: String(anchor.note || ''),
        status: 'paid',
        payment_category: PAYMENT_CATEGORY.BUNDLE,
      },
    });

    const spec = specs.find((s) => s.reference_month === ym);
    if (!spec) continue;

    const payload = {
      ...spec,
      bundle_origin_id: anchorId,
      bundle_months: ym === startYm ? months : null,
    };

    const doc = await writePaymentDocument(databases, dbId, paymentsCol, payload);
    repaired.push(doc);
  }

  return { repaired };
}
