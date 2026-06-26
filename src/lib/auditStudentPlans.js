/**
 * Auditoria e inferência de plano por aluno (campo plan + histórico de pagamentos).
 */

export const STUDENT_PLAN_CONFIDENCE = {
  CURRENT: 'current',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  NONE: 'none',
};

function planNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function paymentPlanName(doc) {
  const named = String(doc?.plan_name || doc?.planName || '').trim();
  if (named) return named;
  return extractLegacyPlanHintFromNote(doc?.note);
}

function extractLegacyPlanHintFromNote(note) {
  const n = String(note || '').trim().toLowerCase();
  if (!n) return '';
  if (n.includes('anual')) return 'Anual';
  if (n.includes('trimestral')) return 'Mensal'; // legacy bucket; canonicalized by type
  if (n.includes('semestral')) return 'Mensal';
  if (n.includes('recorrente')) return 'Recorrente';
  if (n.includes('mensal')) return 'Mensal';
  if (n.includes('diária') || n.includes('diaria')) return 'Diária';
  return '';
}

function paymentSortKey(doc) {
  const ref = String(doc?.reference_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(ref)) return `${ref}-15`;
  const paid = String(doc?.paid_at || doc?.paidAt || doc?.payment_date || doc?.$createdAt || '');
  return paid.slice(0, 10) || '0000-00-00';
}

/**
 * @param {object[]} paymentDocs
 */
export function inferPlanFromPayments(paymentDocs) {
  const list = Array.isArray(paymentDocs) ? paymentDocs : [];
  const withPlan = list
    .map((doc) => ({ doc, name: paymentPlanName(doc) }))
    .filter((row) => row.name);

  if (!withPlan.length) {
    return { plan: '', source: 'none', confidence: STUDENT_PLAN_CONFIDENCE.NONE };
  }

  const sorted = [...withPlan].sort((a, b) => paymentSortKey(b.doc).localeCompare(paymentSortKey(a.doc)));
  const latestName = sorted[0].name;

  const counts = new Map();
  for (const row of withPlan) {
    const key = planNameKey(row.name);
    const prev = counts.get(key);
    if (!prev) counts.set(key, { name: row.name, count: 1 });
    else prev.count += 1;
  }

  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  if (ranked.length === 1) {
    return {
      plan: ranked[0].name,
      source: 'payments',
      confidence: STUDENT_PLAN_CONFIDENCE.HIGH,
    };
  }

  const top = ranked[0];
  const second = ranked[1];
  const latestKey = planNameKey(latestName);

  if (top.count > second.count && planNameKey(top.name) === latestKey) {
    return {
      plan: latestName,
      source: 'payments_latest',
      confidence: STUDENT_PLAN_CONFIDENCE.HIGH,
    };
  }

  if (top.count > second.count) {
    return {
      plan: top.name,
      source: 'payments_mode',
      confidence: STUDENT_PLAN_CONFIDENCE.MEDIUM,
    };
  }

  return {
    plan: latestName,
    source: 'payments_latest',
    confidence: STUDENT_PLAN_CONFIDENCE.LOW,
  };
}

export function isActiveStudentDoc(doc) {
  const status = String(doc?.student_status || doc?.studentStatus || '').trim().toLowerCase();
  return status !== 'inactive';
}

export function readStudentPlan(doc) {
  return String(doc?.plan || doc?.plan_name || doc?.planName || '').trim();
}

export function readStudentDisplayName(doc) {
  return String(doc?.name || doc?.student_name || doc?.$id || '').trim();
}

/**
 * @param {Map<string, object[]>} paymentsByStudentId
 * @param {Set<string>} registeredPlanKeys lowercased plan names from financeConfig
 */
export function buildStudentPlanAuditRow(studentDoc, paymentsByStudentId, registeredPlanKeys) {
  const studentId = String(studentDoc?.$id || '').trim();
  const planCurrent = readStudentPlan(studentDoc);
  const payments = paymentsByStudentId.get(studentId) || [];

  if (planCurrent) {
    const inCatalog = registeredPlanKeys.has(planNameKey(planCurrent));
    return {
      student_id: studentId,
      name: readStudentDisplayName(studentDoc),
      student_status: String(studentDoc?.student_status || studentDoc?.studentStatus || '').trim(),
      plan_current: planCurrent,
      plan_inferred: planCurrent,
      plan_final: planCurrent,
      source: 'current',
      confidence: STUDENT_PLAN_CONFIDENCE.CURRENT,
      in_catalog: inCatalog,
      payment_count: payments.length,
    };
  }

  const inferred = inferPlanFromPayments(payments);
  const inCatalog = inferred.plan ? registeredPlanKeys.has(planNameKey(inferred.plan)) : false;

  return {
    student_id: studentId,
    name: readStudentDisplayName(studentDoc),
    student_status: String(studentDoc?.student_status || studentDoc?.studentStatus || '').trim(),
    plan_current: '',
    plan_inferred: inferred.plan,
    plan_final: inferred.plan,
    source: inferred.source,
    confidence: inferred.confidence,
    in_catalog: inCatalog,
    payment_count: payments.length,
  };
}

/**
 * @param {object[]} rows
 */
export function summarizeStudentPlanAudit(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const active = list.filter((r) => String(r.student_status || '').toLowerCase() !== 'inactive');
  const withCurrent = active.filter((r) => r.plan_current).length;
  const inferrable = active.filter(
    (r) => !r.plan_current && r.plan_inferred && r.confidence !== STUDENT_PLAN_CONFIDENCE.NONE
  ).length;
  const manual = active.filter(
    (r) => !r.plan_current && (!r.plan_inferred || r.confidence === STUDENT_PLAN_CONFIDENCE.LOW)
  ).length;
  const orphan = active.filter((r) => r.plan_inferred && r.in_catalog === false).length;

  return {
    total: list.length,
    active: active.length,
    with_current_plan: withCurrent,
    inferrable,
    needs_manual_review: manual,
    orphan_plan_names: orphan,
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {object[]} rows
 */
export function formatStudentPlansAuditCsv(rows) {
  const header = [
    'student_id',
    'name',
    'student_status',
    'plan_current',
    'plan_inferred',
    'plan_final',
    'source',
    'confidence',
    'in_catalog',
    'payment_count',
  ];
  const lines = [header.join(',')];
  for (const row of rows || []) {
    lines.push(
      header.map((key) => csvEscape(row[key])).join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Agrupa pagamentos por student_id / lead_id.
 * @param {object[]} paymentDocs
 */
export function indexPaymentsByStudentId(paymentDocs) {
  const map = new Map();
  for (const doc of paymentDocs || []) {
    const sid = String(doc?.student_id || doc?.lead_id || doc?.studentId || doc?.leadId || '').trim();
    if (!sid) continue;
    const prev = map.get(sid) || [];
    prev.push(doc);
    map.set(sid, prev);
  }
  return map;
}

export function registeredPlanNameKeys(plans) {
  const keys = new Set();
  for (const p of plans || []) {
    const key = planNameKey(p?.name);
    if (key) keys.add(key);
  }
  return keys;
}
