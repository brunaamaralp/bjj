/**
 * Enriquecimento server-side de contexto NL (transações pendentes, mensalidades, etapas do funil).
 */
import { Query } from 'node-appwrite';
import { DB_ID, STUDENT_PAYMENTS_COL } from './appwriteCollections.js';
import { mapFinanceTxDoc, txDirection } from './financeTxFields.js';
import { listAcademyStudentsMapped } from './listAcademyStudents.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../../src/constants/pipeline.js';
import { LEAD_STATUS } from '../../src/lib/leadStatus.js';

const FINANCIAL_TX_COL =
  process.env.VITE_APPWRITE_FINANCIAL_TX_COLLECTION_ID || process.env.FINANCIAL_TX_COL || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const MAX_PENDING_TX = 40;
const MAX_PAYMENTS = 120;

const DEFAULT_PIPELINE_STAGES = [
  { id: 'Novo', label: 'Novo' },
  { id: 'Aula experimental', label: 'Experimental' },
  { id: LEAD_STATUS.MISSED, label: 'Não compareceu' },
  { id: PIPELINE_WAITING_DECISION_STAGE, label: 'Aguardando decisão' },
  { id: 'Matriculado', label: 'Matriculado' },
  { id: LEAD_STATUS.LOST, label: 'Perdidos' },
];

/** @param {object} t */
export function normalizePendingTxForNl(t) {
  return {
    id: String(t.id || t.$id || '').trim(),
    status: String(t.status || '').toLowerCase(),
    gross: Number(t.gross),
    fee: Number(t.fee),
    net: Number(t.net),
    method: String(t.method || ''),
    installments: Number(t.installments) || 1,
    type: String(t.type || ''),
    planName: String(t.planName || t.plan_name || ''),
    lead_id: String(t.lead_id || ''),
    note: String(t.note || ''),
    createdAt: String(t.createdAt || t.$createdAt || ''),
  };
}

/**
 * @param {object} p
 * @param {Map<string, string>} [nameByLeadId]
 */
export function normalizePaymentForNl(p, nameByLeadId = new Map()) {
  const leadId = String(p.student_id || p.lead_id || '').trim();
  const studentName =
    String(p.student_name || '').trim() ||
    (leadId ? String(nameByLeadId.get(leadId) || '').trim() : '');
  return {
    id: String(p.id || p.$id || '').trim(),
    lead_id: leadId,
    student_name: studentName,
    reference_month: String(p.reference_month || '').trim(),
    amount: Number(p.amount),
    status: String(p.status || '').toLowerCase(),
    method: String(p.method || ''),
    note: String(p.note || ''),
    plan_name: String(p.plan_name || '').trim(),
    account: String(p.account || '').trim(),
  };
}

/**
 * Mescla listas por id; entradas de `clientRows` sobrescrevem `serverRows`.
 * @template {{ id: string }} T
 * @param {T[]} clientRows
 * @param {T[]} serverRows
 * @returns {T[]}
 */
export function mergeNlRowsById(clientRows, serverRows) {
  const map = new Map();
  for (const row of serverRows || []) {
    const id = String(row?.id || '').trim();
    if (id) map.set(id, row);
  }
  for (const row of clientRows || []) {
    const id = String(row?.id || '').trim();
    if (id) map.set(id, row);
  }
  return [...map.values()];
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 */
export async function fetchPendingTransactionsForNl(databases, academyId) {
  if (!FINANCIAL_TX_COL || !DB_ID || !academyId) return [];
  const mapped = [];
  let cursor = null;
  for (let page = 0; page < 10 && mapped.length < MAX_PENDING_TX; page += 1) {
    const q = [
      Query.equal('academyId', academyId),
      Query.equal('status', ['pending']),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, q);
    const docs = res.documents || [];
    for (const doc of docs) {
      const row = mapFinanceTxDoc(doc);
      if (!row) continue;
      const dir = txDirection(row);
      const type = String(row.type || '').toLowerCase();
      if (dir === 'out' || type === 'expense') continue;
      mapped.push(normalizePendingTxForNl(row));
      if (mapped.length >= MAX_PENDING_TX) break;
    }
    if (docs.length < 100 || mapped.length >= MAX_PENDING_TX) break;
    cursor = docs[docs.length - 1]?.$id;
    if (!cursor) break;
  }
  return mapped;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {string} referenceMonth YYYY-MM
 */
export async function fetchRecentPaymentsForNl(databases, academyId, referenceMonth) {
  if (!STUDENT_PAYMENTS_COL || !DB_ID || !academyId) return [];
  const ym = String(referenceMonth || '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return [];

  const [listRes, students] = await Promise.all([
    databases.listDocuments(DB_ID, STUDENT_PAYMENTS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('reference_month', ym),
      Query.orderDesc('$createdAt'),
      Query.limit(MAX_PAYMENTS),
    ]),
    listAcademyStudentsMapped(academyId).catch(() => []),
  ]);

  const nameByLeadId = new Map(
    (students || []).map((s) => [String(s.id || '').trim(), String(s.name || '').trim()])
  );

  return (listRes.documents || [])
    .map((doc) =>
      normalizePaymentForNl(
        {
          ...doc,
          id: doc.$id,
          lead_id: doc.lead_id,
          student_id: doc.lead_id,
        },
        nameByLeadId
      )
    )
    .filter((p) => p.id);
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 */
export async function fetchPipelineStagesForNl(databases, academyId) {
  if (!ACADEMIES_COL || !DB_ID || !academyId) {
    return DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s }));
  }
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    let conf = doc?.stagesConfig;
    if (typeof conf === 'string') {
      try {
        conf = JSON.parse(conf);
      } catch {
        conf = null;
      }
    }
    if (Array.isArray(conf) && conf.length > 0) {
      return conf
        .filter((s) => s && String(s.id || '').trim())
        .slice(0, 48)
        .map((s) => ({
          id: String(s.id).trim(),
          label: String(s.label || s.id || '').trim(),
        }));
    }
  } catch {
    void 0;
  }
  return DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s }));
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {{
 *   academyId: string;
 *   showFinance?: boolean;
 *   showFunnel?: boolean;
 *   clientPending?: object[];
 *   clientPayments?: object[];
 *   clientStages?: object[];
 *   referenceMonth?: string;
 * }} opts
 */
export async function enrichNlActionContext(databases, opts = {}) {
  const academyId = String(opts.academyId || '').trim();
  const referenceMonth = String(opts.referenceMonth || new Date().toISOString().slice(0, 7)).slice(0, 7);

  const clientPendingNorm = (Array.isArray(opts.clientPending) ? opts.clientPending : [])
    .filter((t) => t && String(t.id || '').trim())
    .map(normalizePendingTxForNl)
    .filter((t) => t.status === 'pending');

  const clientPaymentsNorm = (Array.isArray(opts.clientPayments) ? opts.clientPayments : [])
    .filter((p) => p && String(p.id || p.$id || '').trim())
    .map((p) => normalizePaymentForNl(p));

  let clientStagesNorm = (Array.isArray(opts.clientStages) ? opts.clientStages : [])
    .filter((s) => s && String(s.id || '').trim())
    .slice(0, 48)
    .map((s) => ({
      id: String(s.id).trim(),
      label: String(s.label || s.id || '').trim(),
    }));

  let pendingForNl = clientPendingNorm;
  let recentPaymentsNorm = clientPaymentsNorm;

  if (opts.showFinance !== false) {
    const [serverPending, serverPayments] = await Promise.all([
      fetchPendingTransactionsForNl(databases, academyId).catch(() => []),
      fetchRecentPaymentsForNl(databases, academyId, referenceMonth).catch(() => []),
    ]);
    pendingForNl = mergeNlRowsById(clientPendingNorm, serverPending)
      .filter((t) => t.status === 'pending')
      .slice(0, MAX_PENDING_TX);
    recentPaymentsNorm = mergeNlRowsById(clientPaymentsNorm, serverPayments).slice(0, MAX_PAYMENTS);
  }

  if (opts.showFunnel !== false && clientStagesNorm.length === 0) {
    clientStagesNorm = await fetchPipelineStagesForNl(databases, academyId).catch(() =>
      DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s }))
    );
  }

  return {
    pendingForNl,
    recentPaymentsNorm,
    pipelineStages: clientStagesNorm,
  };
}
