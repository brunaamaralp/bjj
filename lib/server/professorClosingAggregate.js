/**
 * Agregação mensal do hub de fechamento de professores (somente leitura).
 */
import { Query } from 'node-appwrite';
import {
  buildClosingAmounts,
  CLOSING_STATUS_OPEN,
  CLOSING_STATUS_PAID,
  countLessonsForStaff,
} from '../professorClosing.js';
import {
  normalizeProfessorCompensation,
  resolveStaffRates,
} from '../professorCompensation.js';
import { readProfessorCompensationFromAcademy } from '../../src/lib/professorCompensationStorage.js';
import { fetchLessonStaffReportSlots } from './lessonStaffRegisterServer.js';
import {
  aggregateLessonStaffTotals,
  LESSON_STATUS_CONFIRMED,
  normalizeLessonStatus,
  parseLessonInstructors,
} from '../lessonStaffRegister.js';
import {
  countsAsAttendedExperimentalInPeriod,
  readExperimentalProfessor,
} from '../experimentalProfessor.js';
import {
  encodeStaffRef,
  mapStaffRosterDoc,
  normalizeStaffRosterRole,
  STAFF_ROLE_INSTRUCTOR,
  STAFF_ROLE_PROFESSOR,
} from '../staffRoster.js';
import { LEADS_COL } from './appwriteCollections.js';

const YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;

export const PROFESSOR_CLOSINGS_COL =
  process.env.VITE_APPWRITE_PROFESSOR_CLOSINGS_COLLECTION_ID ||
  process.env.APPWRITE_PROFESSOR_CLOSINGS_COLLECTION_ID ||
  'professor_closings';

const STOCK_MOVES_COL =
  process.env.STOCK_MOVES_COL ||
  process.env.VITE_APPWRITE_STOCK_MOVES_COLLECTION_ID ||
  process.env.APPWRITE_STOCK_MOVES_COLLECTION_ID ||
  '';

const INSTRUCTORS_COL =
  process.env.VITE_APPWRITE_INSTRUCTORS_COLLECTION_ID ||
  process.env.APPWRITE_INSTRUCTORS_COLLECTION_ID ||
  'instructors';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID ||
  process.env.APPWRITE_ACADEMIES_COLLECTION_ID ||
  '';

/**
 * @param {unknown} yearMonth
 * @returns {{ from: string, to: string } | null}
 */
export function monthBoundsFromYearMonth(yearMonth) {
  const m = YEAR_MONTH_RE.exec(String(yearMonth || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const dd = String(lastDay).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${dd}`,
  };
}

/**
 * Role for rates: roster role wins; login-only → instructor only if solely instructor slots.
 * @param {{ rosterRole?: string|null, asProfessor?: number, asInstructor?: number }} input
 */
export function inferClosingStaffRole({
  rosterRole = null,
  asProfessor = 0,
  asInstructor = 0,
} = {}) {
  const fromRoster = normalizeStaffRosterRole(rosterRole);
  if (fromRoster) return fromRoster;
  const asProf = Number(asProfessor) || 0;
  const asInst = Number(asInstructor) || 0;
  if (asInst > 0 && asProf === 0) return STAFF_ROLE_INSTRUCTOR;
  return STAFF_ROLE_PROFESSOR;
}

function parseJsonObject(raw, fallback = {}) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  if (typeof raw !== 'string' || !raw.trim()) return { ...fallback };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    void 0;
  }
  return { ...fallback };
}

/**
 * @param {{
 *   staff_ref: string,
 *   name?: string,
 *   role?: string,
 *   counts?: { lessons?: number, experimentals?: number, withdrawals?: number },
 *   productDebits?: number[],
 *   rates?: { lesson_amount?: number, experimental_amount?: number },
 *   closing?: object|null,
 *   post_paid_activity?: boolean,
 * }} input
 */
export function buildClosingHubRow({
  staff_ref,
  name = '',
  role = STAFF_ROLE_PROFESSOR,
  counts = {},
  productDebits = [],
  rates = {},
  closing = null,
  post_paid_activity = false,
} = {}) {
  const liveCounts = {
    lessons: Math.max(0, Math.trunc(Number(counts.lessons) || 0)),
    experimentals: Math.max(0, Math.trunc(Number(counts.experimentals) || 0)),
    withdrawals: Math.max(0, Math.trunc(Number(counts.withdrawals) || 0)),
  };
  const liveAmounts = buildClosingAmounts({
    lessonCount: liveCounts.lessons,
    experimentalCount: liveCounts.experimentals,
    productDebits,
    rates,
  });

  const closingStatus = String(closing?.status || '').trim().toLowerCase();
  const isPaid = closingStatus === CLOSING_STATUS_PAID;

  if (isPaid && closing) {
    const snapCountsRaw = parseJsonObject(closing.counts_json ?? closing.counts, liveCounts);
    const snapAmountsRaw = parseJsonObject(closing.amounts_json ?? closing.amounts, liveAmounts);
    const snapCounts = {
      lessons: Math.max(0, Math.trunc(Number(snapCountsRaw.lessons) || 0)),
      experimentals: Math.max(0, Math.trunc(Number(snapCountsRaw.experimentals) || 0)),
      withdrawals: Math.max(0, Math.trunc(Number(snapCountsRaw.withdrawals) || 0)),
    };
    const snapAmounts = {
      credits_lessons: Number(snapAmountsRaw.credits_lessons) || 0,
      credits_experimental: Number(snapAmountsRaw.credits_experimental) || 0,
      debits_products: Number(snapAmountsRaw.debits_products) || 0,
      net: Number(snapAmountsRaw.net) || 0,
    };
    const liveDiffersFromSnapshot =
      liveCounts.lessons !== snapCounts.lessons ||
      liveCounts.experimentals !== snapCounts.experimentals ||
      liveCounts.withdrawals !== snapCounts.withdrawals ||
      liveAmounts.credits_lessons !== snapAmounts.credits_lessons ||
      liveAmounts.credits_experimental !== snapAmounts.credits_experimental ||
      liveAmounts.debits_products !== snapAmounts.debits_products ||
      liveAmounts.net !== snapAmounts.net;
    return {
      staff_ref: String(staff_ref || '').trim(),
      name: String(closing.staff_name || name || staff_ref || '').trim() || String(staff_ref || ''),
      role: normalizeStaffRosterRole(closing.role) || role || STAFF_ROLE_PROFESSOR,
      counts: snapCounts,
      amounts: snapAmounts,
      status: CLOSING_STATUS_PAID,
      closing_id: String(closing.$id || closing.id || '').trim() || null,
      finance_tx_id: String(closing.finance_tx_id || '').trim() || null,
      post_paid_activity: Boolean(post_paid_activity) || liveDiffersFromSnapshot,
    };
  }

  return {
    staff_ref: String(staff_ref || '').trim(),
    name: String(name || staff_ref || '').trim() || String(staff_ref || ''),
    role: normalizeStaffRosterRole(role) || STAFF_ROLE_PROFESSOR,
    counts: liveCounts,
    amounts: liveAmounts,
    status: CLOSING_STATUS_OPEN,
    closing_id: closing?.$id || closing?.id ? String(closing.$id || closing.id) : null,
    finance_tx_id: closing?.finance_tx_id ? String(closing.finance_tx_id) : null,
    post_paid_activity: false,
  };
}

/**
 * Collect staff refs that appear as professor/instructor on confirmed slots.
 * @param {object[]} slots
 */
export function collectStaffRefsFromSlots(slots = []) {
  /** @type {Map<string, { name: string, asProfessor: number, asInstructor: number }>} */
  const map = new Map();
  const agg = aggregateLessonStaffTotals(slots);
  for (const row of agg.byUser.values()) {
    const ref = String(row.user_id || '').trim();
    if (!ref) continue;
    map.set(ref, {
      name: String(row.name || '').trim() || ref,
      asProfessor: row.as_professor || 0,
      asInstructor: row.as_instructor || 0,
    });
  }
  return map;
}

/**
 * @param {object[]} leads
 * @param {{ from: string, to: string }} bounds
 */
export function countExperimentalsByStaff(leads = [], bounds) {
  const fromTs = new Date(`${bounds.from}T00:00:00.000`);
  const toTs = new Date(`${bounds.to}T23:59:59.999`);
  /** @type {Map<string, { count: number, name: string }>} */
  const map = new Map();
  for (const lead of leads || []) {
    if (!countsAsAttendedExperimentalInPeriod(lead, fromTs, toTs)) continue;
    const { userId, name } = readExperimentalProfessor(lead);
    if (!userId) continue;
    const prev = map.get(userId) || { count: 0, name: name || userId };
    prev.count += 1;
    if (name) prev.name = name;
    map.set(userId, prev);
  }
  return map;
}

/**
 * @param {object[]} moves
 */
export function groupWithdrawalDebitsByStaff(moves = []) {
  /** @type {Map<string, { debits: number[], name: string }>} */
  const map = new Map();
  for (const move of moves || []) {
    const ref = String(
      move.staff_ref || move.referencia_id || move.referência_id || ''
    ).trim();
    if (!ref) continue;
    const debit = Number(move.line_total);
    if (!Number.isFinite(debit)) continue;
    const prev = map.get(ref) || { debits: [], name: '' };
    prev.debits.push(debit);
    const notesName = (() => {
      try {
        const n = typeof move.notes === 'string' ? JSON.parse(move.notes) : null;
        return String(n?.staff_name || '').trim();
      } catch {
        return '';
      }
    })();
    const name = String(move.staff_name || notesName || '').trim();
    if (name) prev.name = name;
    map.set(ref, prev);
  }
  return map;
}

function isCollectionMissingError(e) {
  const msg = String(e?.message || '').toLowerCase();
  const code = Number(e?.code ?? e?.status ?? 0);
  return (
    code === 404 ||
    (msg.includes('collection') &&
      (msg.includes('not found') || msg.includes('could not be found'))) ||
    msg.includes('unknown attribute')
  );
}

async function listAllDocuments(databases, dbId, collectionId, baseQueries) {
  const all = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const res = await databases.listDocuments(dbId, collectionId, [
      ...baseQueries,
      Query.limit(limit),
      Query.offset(offset),
    ]);
    const docs = res.documents || [];
    all.push(...docs);
    if (docs.length < limit) break;
    offset += limit;
    if (offset > 5000) break;
  }
  return all;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {{ from: string, to: string }} bounds
 */
export async function fetchExperimentalLeadsForMonth(databases, dbId, academyId, bounds) {
  if (!LEADS_COL || !dbId || !academyId) return [];
  try {
    const fromIso = new Date(`${bounds.from}T00:00:00.000`).toISOString();
    const toExclusive = new Date(`${bounds.to}T00:00:00.000`);
    toExclusive.setDate(toExclusive.getDate() + 1);
    const toIso = toExclusive.toISOString();

    let docs;
    try {
      docs = await listAllDocuments(databases, dbId, LEADS_COL, [
        Query.equal('academy_id', academyId),
        Query.greaterThanEqual('attended_at', fromIso),
        Query.lessThan('attended_at', toIso),
        Query.isNotNull('experimental_professor_user_id'),
        Query.orderAsc('attended_at'),
      ]);
    } catch (e) {
      if (!isCollectionMissingError(e)) throw e;
      // Fallback: academy filter only, filter in memory
      docs = await listAllDocuments(databases, dbId, LEADS_COL, [
        Query.equal('academy_id', academyId),
      ]);
    }

    const fromTs = new Date(`${bounds.from}T00:00:00.000`);
    const toTs = new Date(`${bounds.to}T23:59:59.999`);
    return (docs || []).filter((d) => {
      const { userId } = readExperimentalProfessor(d);
      if (!userId) return false;
      return countsAsAttendedExperimentalInPeriod(d, fromTs, toTs);
    });
  } catch (e) {
    if (isCollectionMissingError(e)) return [];
    throw e;
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {{ from: string, to: string }} bounds
 */
export async function fetchProfessorWithdrawalsForMonth(databases, dbId, academyId, bounds) {
  if (!STOCK_MOVES_COL || !dbId || !academyId) return [];
  try {
    const fromIso = new Date(`${bounds.from}T00:00:00.000`).toISOString();
    const toExclusive = new Date(`${bounds.to}T00:00:00.000`);
    toExclusive.setDate(toExclusive.getDate() + 1);
    const toIso = toExclusive.toISOString();

    let docs = [];
    try {
      docs = await listAllDocuments(databases, dbId, STOCK_MOVES_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('movement_kind', 'professor'),
        Query.greaterThanEqual('$createdAt', fromIso),
        Query.lessThan('$createdAt', toIso),
        Query.orderAsc('$createdAt'),
      ]);
    } catch (e) {
      if (!isCollectionMissingError(e)) throw e;
      try {
        const all = await listAllDocuments(databases, dbId, STOCK_MOVES_COL, [
          Query.equal('academy_id', academyId),
          Query.greaterThanEqual('$createdAt', fromIso),
          Query.lessThan('$createdAt', toIso),
        ]);
        docs = all.filter(
          (d) =>
            String(d.movement_kind || '').trim() === 'professor' ||
            String(d.tipo || '').trim() === 'saida_professor'
        );
      } catch (e2) {
        if (isCollectionMissingError(e2)) return [];
        throw e2;
      }
    }

    // Also include tipo=saida_professor if movement_kind query missed them
    const byId = new Map(docs.map((d) => [d.$id, d]));
    try {
      const byTipo = await listAllDocuments(databases, dbId, STOCK_MOVES_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('tipo', 'saida_professor'),
        Query.greaterThanEqual('$createdAt', fromIso),
        Query.lessThan('$createdAt', toIso),
      ]);
      for (const d of byTipo) {
        if (!byId.has(d.$id)) byId.set(d.$id, d);
      }
    } catch {
      // tipo may not be indexed / enum may not include saida_professor yet
      void 0;
    }

    return [...byId.values()];
  } catch (e) {
    if (isCollectionMissingError(e)) return [];
    throw e;
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 */
export async function fetchActiveStaffRoster(databases, dbId, academyId) {
  if (!INSTRUCTORS_COL || !dbId || !academyId) return [];
  try {
    const docs = await listAllDocuments(databases, dbId, INSTRUCTORS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('is_active', true),
    ]);
    return (docs || []).map(mapStaffRosterDoc).filter(Boolean);
  } catch (e) {
    if (isCollectionMissingError(e)) {
      try {
        const docs = await listAllDocuments(databases, dbId, INSTRUCTORS_COL, [
          Query.equal('academy_id', academyId),
        ]);
        return (docs || [])
          .map(mapStaffRosterDoc)
          .filter((r) => r && r.is_active !== false);
      } catch (e2) {
        if (isCollectionMissingError(e2)) return [];
        throw e2;
      }
    }
    throw e;
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {string} yearMonth
 */
export async function fetchClosingsForMonth(databases, dbId, academyId, yearMonth) {
  if (!PROFESSOR_CLOSINGS_COL || !dbId || !academyId || !yearMonth) return [];
  try {
    return await listAllDocuments(databases, dbId, PROFESSOR_CLOSINGS_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('year_month', yearMonth),
    ]);
  } catch (e) {
    if (isCollectionMissingError(e)) return [];
    throw e;
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} academyId
 * @param {string} yearMonth
 * @param {{ academyDoc?: object|null }} [opts]
 */
export async function aggregateProfessorClosingMonth(
  databases,
  dbId,
  academyId,
  yearMonth,
  { academyDoc: academyDocOpt = null } = {}
) {
  const bounds = monthBoundsFromYearMonth(yearMonth);
  if (!bounds) {
    const err = new Error('invalid_month');
    err.code = 'invalid_month';
    throw err;
  }

  let academyDoc = academyDocOpt || null;
  if (!academyDoc && ACADEMIES_COL) {
    try {
      academyDoc = await databases.getDocument(dbId, ACADEMIES_COL, academyId);
    } catch {
      academyDoc = null;
    }
  }

  const compensation = academyDoc
    ? readProfessorCompensationFromAcademy(academyDoc)
    : normalizeProfessorCompensation({});

  const [slots, leads, withdrawals, roster, closings] = await Promise.all([
    fetchLessonStaffReportSlots(databases, dbId, academyId, {
      from: bounds.from,
      to: bounds.to,
    }).catch((e) => {
      if (isCollectionMissingError(e)) return [];
      throw e;
    }),
    fetchExperimentalLeadsForMonth(databases, dbId, academyId, bounds),
    fetchProfessorWithdrawalsForMonth(databases, dbId, academyId, bounds),
    fetchActiveStaffRoster(databases, dbId, academyId),
    fetchClosingsForMonth(databases, dbId, academyId, yearMonth),
  ]);

  const confirmedSlots = (slots || []).filter(
    (s) => normalizeLessonStatus(s.lesson_status) === LESSON_STATUS_CONFIRMED
  );

  const fromSlots = collectStaffRefsFromSlots(confirmedSlots);
  const fromExp = countExperimentalsByStaff(leads, bounds);
  const fromWithdrawals = groupWithdrawalDebitsByStaff(withdrawals);

  /** @type {Map<string, object>} */
  const closingByRef = new Map();
  for (const c of closings || []) {
    const ref = String(c.staff_ref || '').trim();
    if (ref) closingByRef.set(ref, c);
  }

  /** @type {Map<string, { name: string, rosterRole: string|null, asProfessor: number, asInstructor: number }>} */
  const people = new Map();

  const ensure = (ref, patch = {}) => {
    const id = String(ref || '').trim();
    if (!id) return;
    const prev = people.get(id) || {
      name: id,
      rosterRole: null,
      asProfessor: 0,
      asInstructor: 0,
    };
    if (patch.name) prev.name = patch.name;
    if (patch.rosterRole) prev.rosterRole = patch.rosterRole;
    if (patch.asProfessor != null) prev.asProfessor = patch.asProfessor;
    if (patch.asInstructor != null) prev.asInstructor = patch.asInstructor;
    people.set(id, prev);
  };

  for (const r of roster || []) {
    const ref = encodeStaffRef({ kind: 'roster', id: r.id });
    ensure(ref, {
      name: r.name,
      rosterRole: r.role || STAFF_ROLE_INSTRUCTOR,
    });
  }

  for (const [ref, info] of fromSlots) {
    ensure(ref, {
      name: info.name,
      asProfessor: info.asProfessor,
      asInstructor: info.asInstructor,
    });
  }

  for (const [ref, info] of fromExp) {
    ensure(ref, { name: info.name });
  }

  for (const [ref, info] of fromWithdrawals) {
    ensure(ref, { name: info.name });
  }

  // Include anyone with a closing doc even if no live activity (paid snapshot)
  for (const [ref, c] of closingByRef) {
    ensure(ref, { name: String(c.staff_name || '').trim() });
  }

  const rows = [];
  for (const [staff_ref, person] of people) {
    const lessons = countLessonsForStaff(confirmedSlots, staff_ref);
    const experimentals = fromExp.get(staff_ref)?.count || 0;
    const withdrawInfo = fromWithdrawals.get(staff_ref);
    const productDebits = withdrawInfo?.debits || [];
    const withdrawalsCount = productDebits.length;

    // Refresh slot role counts if we only had roster
    let asProfessor = person.asProfessor;
    let asInstructor = person.asInstructor;
    if (!asProfessor && !asInstructor) {
      for (const slot of confirmedSlots) {
        const professorId = String(slot.professor_user_id || '').trim();
        const instructorIds = parseLessonInstructors(slot).map((e) => e.id);
        if (professorId === staff_ref) asProfessor += 1;
        if (instructorIds.includes(staff_ref)) asInstructor += 1;
      }
    }

    const role = inferClosingStaffRole({
      rosterRole: person.rosterRole,
      asProfessor,
      asInstructor,
    });
    const rates = resolveStaffRates(compensation, staff_ref, role);
    const closing = closingByRef.get(staff_ref) || null;

    rows.push(
      buildClosingHubRow({
        staff_ref,
        name: person.name,
        role,
        counts: {
          lessons,
          experimentals,
          withdrawals: withdrawalsCount,
        },
        productDebits,
        rates,
        closing,
        post_paid_activity: false,
      })
    );
  }

  rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  return {
    ok: true,
    month: yearMonth,
    compensation,
    rows,
  };
}
