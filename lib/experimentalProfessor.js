/**
 * Domínio puro — professor responsável pela aula experimental (1 por lead).
 */

import { countsAsMissedExperimentalInPeriod, countsAsNewStudentInPeriod, inRange, isRealLead } from './reportsMetrics.js';

export const EXPERIMENTAL_PROFESSOR_NONE_ID = '__none__';

/**
 * @param {{ experimentalProfessorUserId?: string, experimental_professor_user_id?: string, experimentalProfessorName?: string, experimental_professor_name?: string }} lead
 */
export function readExperimentalProfessor(lead = {}) {
  const userId = String(
    lead.experimentalProfessorUserId ?? lead.experimental_professor_user_id ?? ''
  ).trim();
  const name = String(
    lead.experimentalProfessorName ?? lead.experimental_professor_name ?? ''
  ).trim();
  return { userId, name };
}

/**
 * @param {{ userId?: string, name?: string } | null | undefined} selection
 * @returns {{ experimentalProfessorUserId: string|null, experimentalProfessorName: string|null }}
 */
export function buildExperimentalProfessorPatch(selection) {
  const userId = String(selection?.userId || '').trim();
  const name = String(selection?.name || '').trim();
  if (!userId) {
    return {
      experimentalProfessorUserId: null,
      experimentalProfessorName: null,
    };
  }
  return {
    experimentalProfessorUserId: userId.slice(0, 128),
    experimentalProfessorName: (name || userId).slice(0, 128),
  };
}

/**
 * @param {object} prevLead
 * @param {{ userId?: string, name?: string } | null | undefined} nextSelection
 */
export function experimentalProfessorChanged(prevLead, nextSelection) {
  const prev = readExperimentalProfessor(prevLead);
  const next = buildExperimentalProfessorPatch(nextSelection);
  const nextId = String(next.experimentalProfessorUserId || '').trim();
  return prev.userId !== nextId;
}

/**
 * @param {object} prevLead
 * @param {{ userId?: string, name?: string } | null | undefined} nextSelection
 */
export function buildExperimentalProfessorEvent({ prevLead, nextSelection, actorUserId = '' }) {
  const prev = readExperimentalProfessor(prevLead);
  const next = buildExperimentalProfessorPatch(nextSelection);
  const nextId = String(next.experimentalProfessorUserId || '').trim();
  const type = prev.userId ? 'experimental_professor_changed' : 'experimental_professor_set';
  return {
    type,
    text: nextId
      ? `Professor da experimental: ${next.experimentalProfessorName || nextId}`
      : 'Professor da experimental removido',
    payloadJson: {
      from_user_id: prev.userId || null,
      from_name: prev.name || null,
      to_user_id: nextId || null,
      to_name: next.experimentalProfessorName || null,
      actor_user_id: String(actorUserId || '').trim() || null,
    },
  };
}

/**
 * Compareceu no período (mesma regra do funil: attended_at).
 * @param {object} l
 * @param {string|Date} fromTs
 * @param {string|Date} toTs
 */
export function countsAsAttendedExperimentalInPeriod(l, fromTs, toTs) {
  if (!isRealLead(l)) return false;
  const attended = l.attended_at || l.attendedAt || null;
  return Boolean(attended && inRange(attended, fromTs, toTs));
}

/**
 * @param {object[]} people
 * @param {{ from: string|Date, to: string|Date }} range
 */
export function aggregateExperimentalByProfessor(people = [], { from, to } = {}) {
  /** @type {Map<string, { userId: string, name: string, attended: number, converted: number, missed: number }>} */
  const byId = new Map();

  const bump = (userId, name, field) => {
    const id = userId || EXPERIMENTAL_PROFESSOR_NONE_ID;
    const label =
      id === EXPERIMENTAL_PROFESSOR_NONE_ID
        ? 'Sem responsável'
        : String(name || userId || '').trim() || userId;
    const row = byId.get(id) || {
      userId: id,
      name: label,
      attended: 0,
      converted: 0,
      missed: 0,
    };
    if (id !== EXPERIMENTAL_PROFESSOR_NONE_ID && name && !row.name) row.name = name;
    if (id !== EXPERIMENTAL_PROFESSOR_NONE_ID && name) row.name = String(name).trim() || row.name;
    row[field] += 1;
    byId.set(id, row);
  };

  for (const l of people || []) {
    if (!isRealLead(l)) continue;
    const { userId, name } = readExperimentalProfessor(l);
    if (countsAsAttendedExperimentalInPeriod(l, from, to)) {
      bump(userId, name, 'attended');
    }
    if (countsAsNewStudentInPeriod(l, from, to)) {
      bump(userId, name, 'converted');
    }
    if (countsAsMissedExperimentalInPeriod(l, from, to)) {
      bump(userId, name, 'missed');
    }
  }

  const rows = [...byId.values()].sort((a, b) => {
    if (a.userId === EXPERIMENTAL_PROFESSOR_NONE_ID) return 1;
    if (b.userId === EXPERIMENTAL_PROFESSOR_NONE_ID) return -1;
    return String(a.name).localeCompare(String(b.name), 'pt-BR');
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.attended += r.attended;
      acc.converted += r.converted;
      acc.missed += r.missed;
      return acc;
    },
    { attended: 0, converted: 0, missed: 0 }
  );

  const none = byId.get(EXPERIMENTAL_PROFESSOR_NONE_ID) || {
    userId: EXPERIMENTAL_PROFESSOR_NONE_ID,
    name: 'Sem responsável',
    attended: 0,
    converted: 0,
    missed: 0,
  };

  return {
    rows,
    totals,
    withoutProfessor: {
      attended: none.attended,
      converted: none.converted,
      missed: none.missed,
    },
  };
}

/**
 * @param {{ rows?: { name: string, attended: number, converted: number, missed: number }[] }} report
 */
export function buildExperimentalProfessorCsvRows(report = {}) {
  const header = ['Professor', 'Compareceu', 'Matriculados', 'Não compareceu'];
  const body = (report.rows || []).map((r) => [
    r.name,
    String(r.attended || 0),
    String(r.converted || 0),
    String(r.missed || 0),
  ]);
  return [header, ...body];
}
