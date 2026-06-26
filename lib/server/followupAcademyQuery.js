import { LEAD_STATUS } from '../../src/lib/leadStatus.js';
import {
  enrichFollowUpLeads,
  FOLLOWUP_AGENDA_MAX_DAYS,
  buildActiveStudentIdSet,
  filterFollowupLeadCandidates,
} from '../../src/lib/followupState.js';
import { readFollowupPlaybook } from '../../src/lib/followupPlaybookDefaults.js';
import { listAcademyFollowupEvents } from './followupContactServer.js';
import { enrichInboundMapsFromFollowupLeads } from './followupInboundFromLeads.js';
import { listAcademyStudentDocs } from './listAcademyStudents.js';
import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';

function formatDateBr(ymd) {
  const s = String(ymd || '').slice(0, 10);
  const p = s.split('-');
  if (p.length !== 3) return s || '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function tempLabel(t) {
  if (t === 'critical') return 'crítico';
  if (t === 'cooling') return 'esfriando';
  return 'em dia';
}

function excludeImported(l) {
  return String(l?.origin || '').trim() !== 'Planilha';
}

/**
 * @param {object[]} leads
 * @param {object} eventBundle
 * @param {object} [academySettings]
 */
export function buildFollowupQueryContext(leads, eventBundle, academySettings) {
  return {
    playbook: readFollowupPlaybook(academySettings),
    followupDoneByLead: eventBundle?.doneByLead || {},
    followupContactByLead: eventBundle?.contactByLead || {},
    followupSnoozeUntilByLead: eventBundle?.snoozeUntilByLead || {},
  };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 * @param {object[]} leads
 * @param {unknown} academySettings
 */
export async function enrichLeadsForFollowupQuery(databases, academyId, leads, academySettings) {
  const bundle = await listAcademyFollowupEvents(databases, academyId, FOLLOWUP_AGENDA_MAX_DAYS + 7);
  const inboundMaps = {
    inboundAfterByLead: {},
    inboundAfterByPhone: {},
  };
  await enrichInboundMapsFromFollowupLeads(databases, academyId, inboundMaps);
  let enrolledStudentIds = new Set();
  try {
    const studentDocs = await listAcademyStudentDocs(academyId);
    enrolledStudentIds = buildActiveStudentIdSet(
      studentDocs.map((doc) => mapAppwriteDocToStudent(doc)).filter(Boolean)
    );
  } catch (err) {
    console.warn('[followupAcademyQuery] students list:', err?.message || err);
  }
  const ctx = {
    ...buildFollowupQueryContext(leads, bundle, academySettings),
    inboundAfterByLead: inboundMaps.inboundAfterByLead,
    inboundAfterByPhone: inboundMaps.inboundAfterByPhone,
  };
  return enrichFollowUpLeads(
    filterFollowupLeadCandidates((leads || []).filter(excludeImported), { enrolledStudentIds }),
    ctx
  );
}

/**
 * @param {object[]} enriched
 */
export function queryCoolingFollowupsRows(enriched) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return enriched
    .filter(
      (l) =>
        !l.doneForCurrentClass &&
        !l.isSnoozed &&
        l.daysAgo >= 0 &&
        l.daysAgo < FOLLOWUP_AGENDA_MAX_DAYS &&
        (l.temperature === 'cooling' || l.temperature === 'critical')
    )
    .sort((a, b) => {
      const order = { critical: 0, cooling: 1 };
      const ta = order[a.temperature] ?? 2;
      const tb = order[b.temperature] ?? 2;
      if (ta !== tb) return ta - tb;
      return (b.daysAgo ?? 0) - (a.daysAgo ?? 0);
    })
    .map((l) => ({
      id: l.id,
      linkKind: 'lead',
      name: String(l.name || '—').trim() || '—',
      phone: String(l.phone || '').trim(),
      temperature: l.temperature,
      daysAgo: l.daysAgo,
      nextAction: l.nextActionLabel || '',
      line: `${l.name} · ${tempLabel(l.temperature)} · há ${l.daysAgo} dia(s)${l.nextActionLabel ? ` · ${l.nextActionLabel}` : ''}`,
    }));
}

/**
 * Comparecidos com aula ontem (D+1) sem contato registrado.
 * @param {object[]} enriched
 * @param {Date} [now]
 */
export function queryAttendedNotContactedYesterdayRows(enriched, now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayYmd = yesterday.toISOString().slice(0, 10);

  return enriched
    .filter((l) => {
      if (l.status !== LEAD_STATUS.COMPLETED) return false;
      const classYmd = String(l.scheduledDate || '').slice(0, 10);
      if (classYmd !== yesterdayYmd) return false;
      return !l.hasContactInCycle && !l.doneForCurrentClass;
    })
    .map((l) => ({
      id: l.id,
      linkKind: 'lead',
      name: String(l.name || '—').trim() || '—',
      phone: String(l.phone || '').trim(),
      scheduledDate: String(l.scheduledDate || '').slice(0, 10),
      line: `${l.name} · experimental ${formatDateBr(l.scheduledDate)} · sem retorno no dia seguinte`,
    }));
}
