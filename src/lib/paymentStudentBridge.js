/**
 * Resolve pagamentos com lead_id órfão → aluno atual (telefone, conversa, financial_tx, plano do cadastro).
 */

import { mapLegacyPlanName, readStudentType } from './backfillStudentPlans.js';

function planNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizePersonName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function phoneLookupKeys(phone) {
  const keys = [phone];
  if (phone.length >= 11) keys.push(phone.slice(-11));
  if (phone.length >= 10) keys.push(phone.slice(-10));
  if (phone.length >= 8) keys.push(phone.slice(-8));
  return keys;
}

function lookupPhoneInMap(phoneToStudent, phone) {
  for (const key of phoneLookupKeys(phone)) {
    if (phoneToStudent.has(key)) return phoneToStudent.get(key);
  }
  return '';
}

export function normalizePhoneDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';

  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);

  // Celular BR sem o 9: DDD (2) + 8 dígitos → inserir 9 após o DDD
  if (d.length === 10 && /^[1-9]{2}[6-9]/.test(d)) {
    d = `${d.slice(0, 2)}9${d.slice(2)}`;
  }

  return d;
}

export function buildPhoneToStudentIdMap(students, conversations = []) {
  const map = new Map();
  const studentIds = new Set((students || []).map((s) => String(s.$id || '').trim()).filter(Boolean));

  for (const doc of students || []) {
    const sid = String(doc?.$id || '').trim();
    if (!sid) continue;
    const raw = normalizePhoneDigits(doc?.phone || doc?.phone_number);
    if (raw.length < 8) continue;
    for (const key of phoneLookupKeys(raw)) map.set(key, sid);
  }

  for (const doc of conversations || []) {
    const sid = String(doc?.lead_id || '').trim();
    if (!studentIds.has(sid)) continue;
    const raw = normalizePhoneDigits(doc?.phone_number);
    if (raw.length < 8) continue;
    for (const key of phoneLookupKeys(raw)) map.set(key, sid);
  }

  return map;
}

/**
 * @param {object[]} conversations
 */
export function buildLeadIdToPhoneMap(conversations) {
  const map = new Map();
  for (const doc of conversations || []) {
    const leadId = String(doc?.lead_id || '').trim();
    const phone = normalizePhoneDigits(doc?.phone_number);
    if (!leadId || phone.length < 8) continue;
    map.set(leadId, phone);
  }
  return map;
}

/**
 * @param {object} payment
 * @param {{ phoneToStudent: Map<string,string>, leadToPhone: Map<string,string>, studentIds: Set<string> }} ctx
 */
export function resolvePaymentToStudentId(payment, ctx) {
  const direct = String(payment?.student_id || payment?.lead_id || '').trim();
  if (!direct) return '';

  if (ctx.studentIds?.has(direct)) return direct;

  const phone = ctx.leadToPhone?.get(direct);
  if (!phone) return '';

  return lookupPhoneInMap(ctx.phoneToStudent, phone);
}

/**
 * @param {object[]} payments
 * @param {object[]} students
 * @param {Map<string,string>} leadToPhone
 */
export function indexPaymentsByResolvedStudentId(payments, students, leadToPhone) {
  const phoneToStudent = buildPhoneToStudentIdMap(students);
  const studentIds = new Set((students || []).map((s) => String(s.$id || '').trim()).filter(Boolean));
  const ctx = { phoneToStudent, leadToPhone, studentIds };
  const map = new Map();

  for (const doc of payments || []) {
    const sid = resolvePaymentToStudentId(doc, ctx);
    if (!sid) continue;
    const prev = map.get(sid) || [];
    prev.push(doc);
    map.set(sid, prev);
  }
  return map;
}

function findStudentByName(students, rawName) {
  const target = normalizePersonName(rawName);
  if (!target || target.length < 4) return '';

  for (const doc of students || []) {
    if (normalizePersonName(doc?.name) === target) return String(doc.$id || '').trim();
  }

  for (const doc of students || []) {
    const sn = normalizePersonName(doc?.name);
    if (!sn) continue;
    if (target.length >= 6 && sn.includes(target)) return String(doc.$id || '').trim();
    if (sn.length >= 6 && target.includes(sn)) return String(doc.$id || '').trim();
  }
  return '';
}

export function findStudentIdByPhone(students, rawPhone) {
  const phone = normalizePhoneDigits(rawPhone);
  if (phone.length < 8) return '';
  const map = buildPhoneToStudentIdMap(students);
  return lookupPhoneInMap(map, phone);
}

export const ORPHAN_LEAD_CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

const ORPHAN_CONFIDENCE_RANK = {
  [ORPHAN_LEAD_CONFIDENCE.HIGH]: 3,
  [ORPHAN_LEAD_CONFIDENCE.MEDIUM]: 2,
  [ORPHAN_LEAD_CONFIDENCE.LOW]: 1,
};

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
 * CSV: orphan_lead_id + student_id | student_phone | student_name
 * @param {string} content
 */
export function parseOrphanLeadMapCsv(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.includes('orphan_lead_id') || header.includes('lead_id');
  const start = hasHeader ? 1 : 0;

  const idx = (key, fallback) => {
    const i = header.indexOf(key);
    return i >= 0 ? i : fallback;
  };

  const orphanIdx = hasHeader
    ? (() => {
        const a = header.indexOf('orphan_lead_id');
        if (a >= 0) return a;
        return header.indexOf('lead_id');
      })()
    : 0;
  const studentIdx = hasHeader ? idx('student_id', 1) : 1;
  const phoneIdx = hasHeader ? idx('student_phone', -1) : -1;
  const nameIdx = hasHeader ? idx('student_name', -1) : -1;

  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const orphan_lead_id = String(cols[orphanIdx] || '').trim();
    if (!orphan_lead_id) continue;
    rows.push({
      orphan_lead_id,
      student_id: String(cols[studentIdx] || '').trim(),
      student_phone: phoneIdx >= 0 ? String(cols[phoneIdx] || '').trim() : '',
      student_name: nameIdx >= 0 ? String(cols[nameIdx] || '').trim() : '',
      source: 'manual',
      confidence: ORPHAN_LEAD_CONFIDENCE.HIGH,
    });
  }
  return rows;
}

function collectOrphanLeadIds(docs, studentIds, field = 'lead_id') {
  const set = new Set();
  for (const doc of docs || []) {
    const lid = String(doc?.[field] || '').trim();
    if (!lid || studentIds.has(lid)) continue;
    set.add(lid);
  }
  return set;
}

function addRepairCandidate(bucket, leadId, candidate) {
  if (!leadId || !candidate?.student_id) return;
  const prev = bucket.get(leadId) || [];
  prev.push(candidate);
  bucket.set(leadId, prev);
}

function pickRepairMappings(candidateBucket, paymentsByLead, finByLead) {
  const mappings = [];
  const conflicts = [];

  for (const [orphan_lead_id, list] of candidateBucket.entries()) {
    const ranked = [...list].sort(
      (a, b) => (ORPHAN_CONFIDENCE_RANK[b.confidence] || 0) - (ORPHAN_CONFIDENCE_RANK[a.confidence] || 0)
    );
    const best = ranked[0];
    if (!best) continue;

    const rival = ranked.find((row, i) => i > 0 && row.student_id !== best.student_id);
    if (rival && (ORPHAN_CONFIDENCE_RANK[rival.confidence] || 0) >= (ORPHAN_CONFIDENCE_RANK[best.confidence] || 0)) {
      conflicts.push({
        orphan_lead_id,
        student_id: best.student_id,
        rival_student_id: rival.student_id,
        source: best.source,
        rival_source: rival.source,
        confidence: best.confidence,
      });
      continue;
    }

    mappings.push({
      orphan_lead_id,
      student_id: best.student_id,
      student_name: best.student_name || '',
      source: best.source,
      confidence: best.confidence,
      detail: best.detail || '',
      payment_count: (paymentsByLead.get(orphan_lead_id) || []).length,
      financial_tx_count: (finByLead.get(orphan_lead_id) || []).length,
    });
  }

  return { mappings, conflicts };
}

/**
 * @param {object} opts
 */
/**
 * Compara plan_name do pagamento com plan do cadastro do aluno (inclui aliases legados).
 */
export function paymentPlanMatchesStudentPlan(paymentPlanName, studentDoc, legacyPlanRules = []) {
  const paymentPlan = String(paymentPlanName || '').trim();
  const studentPlan = String(studentDoc?.plan || '').trim();
  if (!paymentPlan || !studentPlan) return false;

  if (planNameKey(paymentPlan) === planNameKey(studentPlan)) return true;

  const studentType = readStudentType(studentDoc);
  const mappedPayment = mapLegacyPlanName(paymentPlan, studentType, legacyPlanRules);
  if (mappedPayment && planNameKey(mappedPayment) === planNameKey(studentPlan)) return true;

  const mappedStudent = mapLegacyPlanName(studentPlan, studentType, legacyPlanRules);
  if (mappedStudent && planNameKey(paymentPlan) === planNameKey(mappedStudent)) return true;

  return false;
}

function uniquePaymentPlanNames(payments) {
  const names = new Set(
    (payments || [])
      .map((p) => String(p?.plan_name || '').trim())
      .filter(Boolean)
  );
  return names.size === 1 ? [...names][0] : '';
}

/**
 * Pagamentos já ligados a aluno: alinhar plan_name ao campo plan do cadastro.
 * @param {object[]} payments
 * @param {object[]} students
 * @param {{ onlyIfEmpty?: boolean }} [opts]
 */
export function buildPaymentPlanNameSyncPlan(payments, students, opts = {}) {
  const onlyIfEmpty = opts.onlyIfEmpty !== false;
  const studentById = new Map(
    (students || []).map((s) => [String(s.$id || '').trim(), s]).filter(([id]) => id)
  );
  const studentIds = new Set(studentById.keys());
  const rows = [];

  for (const doc of payments || []) {
    const sid = String(doc?.student_id || doc?.lead_id || '').trim();
    if (!sid || !studentIds.has(sid)) continue;
    const student = studentById.get(sid);
    const targetPlan = String(student?.plan || '').trim();
    if (!targetPlan) continue;
    const current = String(doc?.plan_name || '').trim();
    if (onlyIfEmpty && current) continue;
    if (current === targetPlan) continue;
    rows.push({
      payment_id: String(doc.$id || '').trim(),
      student_id: sid,
      student_name: String(student?.name || '').trim(),
      plan_name_before: current,
      plan_name_after: targetPlan,
    });
  }

  return rows;
}

export function buildOrphanLeadRepairPlan(opts) {
  const {
    students = [],
    payments = [],
    conversations = [],
    financialTx = [],
    manualRows = [],
    legacyPlanRules = [],
  } = opts;

  const studentIds = new Set((students || []).map((s) => String(s.$id || '').trim()).filter(Boolean));
  const studentById = new Map((students || []).map((s) => [String(s.$id || '').trim(), s]));

  const orphanLeadIds = new Set([
    ...collectOrphanLeadIds(payments, studentIds, 'lead_id'),
    ...collectOrphanLeadIds(financialTx, studentIds, 'lead_id'),
  ]);

  const paymentsByLead = new Map();
  for (const doc of payments || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (!lid) continue;
    const prev = paymentsByLead.get(lid) || [];
    prev.push(doc);
    paymentsByLead.set(lid, prev);
  }

  const convByLead = new Map();
  for (const doc of conversations || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (lid) convByLead.set(lid, doc);
  }

  const finByLead = new Map();
  for (const doc of financialTx || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (!lid) continue;
    const prev = finByLead.get(lid) || [];
    prev.push(doc);
    finByLead.set(lid, prev);
  }

  const candidates = new Map();

  for (const row of manualRows || []) {
    let sid = String(row.student_id || '').trim();
    if (!sid && row.student_phone) sid = findStudentIdByPhone(students, row.student_phone);
    if (!sid && row.student_name) sid = findStudentByName(students, row.student_name);
    const student = studentById.get(sid);
    if (!sid || !student) continue;
    addRepairCandidate(candidates, row.orphan_lead_id, {
      student_id: sid,
      student_name: String(student.name || '').trim(),
      source: 'manual',
      confidence: ORPHAN_LEAD_CONFIDENCE.HIGH,
      detail: 'csv',
    });
  }

  for (const doc of financialTx || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (!lid || !orphanLeadIds.has(lid)) continue;

    const pn = String(doc?.planName || '');
    if (pn.includes(' — ')) {
      const sid = findStudentByName(students, pn.split(' — ')[0]);
      const student = studentById.get(sid);
      if (sid && student) {
        addRepairCandidate(candidates, lid, {
          student_id: sid,
          student_name: String(student.name || '').trim(),
          source: 'financial_tx_plan_name',
          confidence: ORPHAN_LEAD_CONFIDENCE.HIGH,
          detail: pn,
        });
      }
    }

    const note = normalizePersonName(doc?.note);
    if (note) {
      for (const student of students || []) {
        const sn = normalizePersonName(student?.name);
        if (sn.length < 6 || !note.includes(sn)) continue;
        addRepairCandidate(candidates, lid, {
          student_id: String(student.$id || '').trim(),
          student_name: String(student.name || '').trim(),
          source: 'financial_tx_note',
          confidence: ORPHAN_LEAD_CONFIDENCE.MEDIUM,
          detail: String(doc.note || '').slice(0, 120),
        });
        break;
      }
    }
  }

  for (const orphan_lead_id of orphanLeadIds) {
    const pays = paymentsByLead.get(orphan_lead_id) || [];
    const paymentPlan = uniquePaymentPlanNames(pays);
    if (!paymentPlan) continue;

    const planMatches = (students || []).filter((student) =>
      paymentPlanMatchesStudentPlan(paymentPlan, student, legacyPlanRules)
    );
    if (!planMatches.length) continue;

    const conv = convByLead.get(orphan_lead_id);
    const convNames = [conv?.lead_name, conv?.contact_name, conv?.whatsapp_profile_name].filter(Boolean);

    if (planMatches.length === 1 && convNames.length === 0) {
      const fins = finByLead.get(orphan_lead_id) || [];
      for (const doc of fins) {
        const pn = String(doc?.planName || '').trim();
        if (!pn) continue;
        const sid = findStudentByName(planMatches, pn);
        if (!sid) continue;
        const student = studentById.get(sid);
        if (!student) continue;
        addRepairCandidate(candidates, orphan_lead_id, {
          student_id: sid,
          student_name: String(student.name || '').trim(),
          source: 'student_plan_and_financial_tx',
          confidence: ORPHAN_LEAD_CONFIDENCE.HIGH,
          detail: `${paymentPlan} · ${pn.slice(0, 80)}`,
        });
        break;
      }
    }

    for (const nm of convNames) {
      const sid = findStudentByName(planMatches, nm);
      if (!sid) continue;
      const student = studentById.get(sid);
      if (!student) continue;
      addRepairCandidate(candidates, orphan_lead_id, {
        student_id: sid,
        student_name: String(student.name || '').trim(),
        source: 'student_plan_and_name',
        confidence: ORPHAN_LEAD_CONFIDENCE.HIGH,
        detail: `${paymentPlan} · ${String(nm || '').trim()}`,
      });
      break;
    }
  }

  for (const doc of conversations || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (!lid || !orphanLeadIds.has(lid)) continue;

    for (const nm of [doc.lead_name, doc.contact_name, doc.whatsapp_profile_name]) {
      const sid = findStudentByName(students, nm);
      const student = studentById.get(sid);
      if (!sid || !student) continue;
      addRepairCandidate(candidates, lid, {
        student_id: sid,
        student_name: String(student.name || '').trim(),
        source: 'conversation_name',
        confidence: ORPHAN_LEAD_CONFIDENCE.MEDIUM,
        detail: String(nm || '').trim(),
      });
      break;
    }

    const phone = normalizePhoneDigits(doc?.phone_number);
    const sid = lookupPhoneInMap(buildPhoneToStudentIdMap(students, conversations), phone);
    const student = studentById.get(sid);
    if (sid && student) {
      addRepairCandidate(candidates, lid, {
        student_id: sid,
        student_name: String(student.name || '').trim(),
        source: 'conversation_phone',
        confidence: ORPHAN_LEAD_CONFIDENCE.MEDIUM,
        detail: String(doc.phone_number || '').trim(),
      });
    }
  }

  const { mappings, conflicts } = pickRepairMappings(candidates, paymentsByLead, finByLead);
  const mappedIds = new Set(mappings.map((m) => m.orphan_lead_id));

  const unmapped = [...orphanLeadIds]
    .filter((id) => !mappedIds.has(id))
    .map((orphan_lead_id) => {
      const pays = paymentsByLead.get(orphan_lead_id) || [];
      const fins = finByLead.get(orphan_lead_id) || [];
      const conv = convByLead.get(orphan_lead_id);
      const samplePay = pays[0];
      return {
        orphan_lead_id,
        payment_count: pays.length,
        financial_tx_count: fins.length,
        sample_amount: samplePay?.amount ?? '',
        sample_note: String(samplePay?.note || '').slice(0, 120),
        sample_plan_name: String(samplePay?.plan_name || '').slice(0, 80),
        conversation_name: String(conv?.lead_name || conv?.contact_name || '').trim(),
        financial_tx_plan: String(fins[0]?.planName || '').slice(0, 120),
      };
    })
    .sort((a, b) => b.payment_count - a.payment_count);

  let paymentsToRepair = 0;
  let financialTxToRepair = 0;
  for (const row of mappings) {
    paymentsToRepair += (paymentsByLead.get(row.orphan_lead_id) || []).length;
    financialTxToRepair += (finByLead.get(row.orphan_lead_id) || []).length;
  }

  return {
    mappings: mappings.sort((a, b) => a.orphan_lead_id.localeCompare(b.orphan_lead_id)),
    conflicts,
    unmapped,
    stats: {
      orphan_lead_ids: orphanLeadIds.size,
      mapped_lead_ids: mappings.length,
      conflict_lead_ids: conflicts.length,
      unmapped_lead_ids: unmapped.length,
      payments_to_repair: paymentsToRepair,
      financial_tx_to_repair: financialTxToRepair,
      students_covered: new Set(mappings.map((m) => m.student_id)).size,
    },
  };
}

export function formatOrphanLeadRepairCsv(rows) {
  const header = [
    'orphan_lead_id',
    'student_id',
    'student_name',
    'source',
    'confidence',
    'payment_count',
    'detail',
  ];
  const lines = [header.join(',')];
  for (const row of rows || []) {
    lines.push(
      [
        row.orphan_lead_id,
        row.student_id,
        `"${String(row.student_name || '').replace(/"/g, '""')}"`,
        row.source,
        row.confidence,
        row.payment_count ?? '',
        `"${String(row.detail || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

export function formatOrphanLeadUnmappedCsv(rows) {
  const header = [
    'orphan_lead_id',
    'payment_count',
    'financial_tx_count',
    'sample_amount',
    'sample_note',
    'sample_plan_name',
    'conversation_name',
    'financial_tx_plan',
    'student_id',
    'student_phone',
    'student_name',
  ];
  const lines = [header.join(',')];
  for (const row of rows || []) {
    lines.push(
      [
        row.orphan_lead_id,
        row.payment_count,
        row.financial_tx_count,
        row.sample_amount,
        `"${String(row.sample_note || '').replace(/"/g, '""')}"`,
        `"${String(row.sample_plan_name || '').replace(/"/g, '""')}"`,
        `"${String(row.conversation_name || '').replace(/"/g, '""')}"`,
        `"${String(row.financial_tx_plan || '').replace(/"/g, '""')}"`,
        '',
        '',
        '',
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

function resolveStudentFromFinancialTx(tx, students, convByLead) {
  const pn = String(tx?.planName || '');
  if (pn.includes(' — ')) {
    const sid = findStudentByName(students, pn.split(' — ')[0]);
    if (sid) return sid;
  }

  const note = normalizePersonName(tx?.note);
  if (note) {
    for (const doc of students || []) {
      const sn = normalizePersonName(doc?.name);
      if (sn.length >= 6 && note.includes(sn)) return String(doc.$id || '').trim();
    }
  }

  const lid = String(tx?.lead_id || '').trim();
  const conv = convByLead?.get(lid);
  if (conv) {
    for (const nm of [conv.lead_name, conv.contact_name, conv.whatsapp_profile_name]) {
      const sid = findStudentByName(students, nm);
      if (sid) return sid;
    }
  }
  return '';
}

/**
 * @param {object[]} students
 * @param {object[]} conversations
 * @param {object[]} financialTx
 */
export function buildLeadToStudentMap(students, conversations = [], financialTx = []) {
  const studentIds = new Set((students || []).map((s) => String(s.$id || '').trim()).filter(Boolean));
  const convByLead = new Map();
  for (const doc of conversations || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (lid) convByLead.set(lid, doc);
  }

  const leadToStudent = new Map();

  for (const lid of studentIds) leadToStudent.set(lid, lid);

  for (const doc of financialTx || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (!lid || leadToStudent.has(lid)) continue;
    const sid = resolveStudentFromFinancialTx(doc, students, convByLead);
    if (sid) leadToStudent.set(lid, sid);
  }

  for (const doc of conversations || []) {
    const lid = String(doc?.lead_id || '').trim();
    if (!lid || leadToStudent.has(lid)) continue;
    for (const nm of [doc.lead_name, doc.contact_name, doc.whatsapp_profile_name]) {
      const sid = findStudentByName(students, nm);
      if (sid) {
        leadToStudent.set(lid, sid);
        break;
      }
    }
  }

  const phoneToStudent = buildPhoneToStudentIdMap(students, conversations);
  const leadToPhone = buildLeadIdToPhoneMap(conversations);
  for (const [lid, phone] of leadToPhone.entries()) {
    if (leadToStudent.has(lid)) continue;
    const sid = lookupPhoneInMap(phoneToStudent, phone);
    if (sid) leadToStudent.set(lid, sid);
  }

  return leadToStudent;
}

/**
 * @param {object[]} payments
 * @param {object[]} financialTx
 */
export function enrichPaymentsFromFinancialTx(payments, financialTx = []) {
  const finById = new Map((financialTx || []).map((doc) => [String(doc.$id || '').trim(), doc]));
  return (payments || []).map((payment) => {
    const txId = String(payment?.financial_tx_id || '').trim();
    if (!txId) return payment;
    const tx = finById.get(txId);
    if (!tx) return payment;

    const next = { ...payment };
    if (!String(next.plan_name || '').trim() && String(tx.planName || '').trim()) {
      const pn = String(tx.planName || '').trim();
      next.plan_name = pn.includes(' — ') ? pn.split(' — ').slice(1).join(' — ').trim() : pn;
    }
    if (!String(next.note || '').trim() && String(tx.note || '').trim()) {
      next.note = String(tx.note || '').trim();
    }
    return next;
  });
}

/**
 * @param {object[]} payments
 * @param {object[]} students
 * @param {object[]} conversations
 * @param {object[]} financialTx
 */
export function indexPaymentsWithBridge(payments, students, conversations = [], financialTx = []) {
  const enriched = enrichPaymentsFromFinancialTx(payments, financialTx);
  const leadToStudent = buildLeadToStudentMap(students, conversations, financialTx);
  const studentIds = new Set((students || []).map((s) => String(s.$id || '').trim()).filter(Boolean));
  const map = new Map();

  const assign = (studentId, payment) => {
    if (!studentId) return;
    const prev = map.get(studentId) || [];
    prev.push(payment);
    map.set(studentId, prev);
  };

  for (const doc of enriched) {
    const direct = String(doc?.student_id || doc?.lead_id || '').trim();
    if (direct && studentIds.has(direct)) {
      assign(direct, doc);
      continue;
    }
    if (direct && leadToStudent.has(direct)) {
      assign(leadToStudent.get(direct), doc);
    }
  }

  return { map, leadToStudent, enriched };
}
