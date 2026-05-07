import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import {
    buildWeekBuckets,
    buildMonthBuckets,
    isRealLead,
    inRange,
    inRangeYmd,
    countsAsConvertedInPeriod,
    countsAsMissedExperimentalInPeriod
} from '../lib/reportsMetrics.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) { res.status(status).json(obj); }
const toYmdTs = (ymd) => {
  if (!ymd) return null;
  const [Y, M, D] = String(ymd).split('-').map(Number);
  if (!Y || !M || !D) return null;
  const dt = new Date(Y, M - 1, D, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
const parseHour = (hhmm) => {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
};
const diffDays = (start, end) => {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return null;
  const v = (end.getTime() - start.getTime()) / 86400000;
  return v >= 0 ? v : null;
};
const avg1 = (arr) => {
  if (!arr.length) return null;
  const val = arr.reduce((acc, n) => acc + n, 0) / arr.length;
  return Number(val.toFixed(1));
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const authorizedAcademyId = access.academyId;
  const { academyId: bodyAcademyId, from, to, prevFrom, prevTo, filters, chartMode = 'weekly' } = req.body || {};

  if (!from || !to) {
    return json(res, 400, { error: 'Parâmetros obrigatórios faltando' });
  }

  const bodyAid = String(bodyAcademyId || '').trim();
  if (bodyAid && bodyAid !== authorizedAcademyId) {
    return json(res, 403, { error: 'Acesso negado à academia' });
  }

  const academyId = authorizedAcademyId;

  try {
    const fetchAll = async (queries) => {
      let all = [];
      let cursor = null;
      do {
        const q = cursor
          ? [...queries, Query.cursorAfter(cursor)]
          : queries;
        const res = await databases.listDocuments(DB_ID, LEADS_COL, [
          ...q,
          Query.limit(100)
        ]);
        all = [...all, ...res.documents];
        cursor = res.documents.length === 100
          ? res.documents[res.documents.length - 1].$id
          : null;
      } while (cursor);
      return all;
    };

    const baseQueries = [Query.equal('academyId', academyId)];
    if (filters?.origin && filters.origin !== 'all') baseQueries.push(Query.equal('origin', filters.origin));
    if (filters?.type && filters.type !== 'all') {
      if (filters.type === 'Criança') {
        baseQueries.push(Query.or([Query.equal('type', 'Criança'), Query.equal('type', 'Kids')]));
      } else {
        baseQueries.push(Query.equal('type', filters.type));
      }
    }

    const allLeads = await fetchAll(baseQueries);

    const newLeads = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, from, to));
    const newLeadsPrev = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, prevFrom, prevTo));

    const scheduled = allLeads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, from, to));
    const scheduledPrev = allLeads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, prevFrom, prevTo));

    const completed = allLeads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, from, to));
    const completedPrev = allLeads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, prevFrom, prevTo));

    const missed = allLeads.filter((l) => countsAsMissedExperimentalInPeriod(l, from, to));
    const missedPrev = allLeads.filter((l) => countsAsMissedExperimentalInPeriod(l, prevFrom, prevTo));

    const converted = allLeads.filter(l => countsAsConvertedInPeriod(l, from, to));
    const convertedPrev = allLeads.filter(l => countsAsConvertedInPeriod(l, prevFrom, prevTo));

    const conversionRate = newLeads.length > 0
      ? Math.round((converted.length / newLeads.length) * 100)
      : 0;
    const conversionRatePrev = newLeadsPrev.length > 0
      ? Math.round((convertedPrev.length / newLeadsPrev.length) * 100)
      : 0;

    const toList = (arr) => arr.map(l => ({
      id: l.$id,
      name: l.name,
      phone: l.phone,
      origin: l.origin,
      type: l.type,
    }));

    const chartData = chartMode === 'weekly' 
        ? buildWeekBuckets(from, to) 
        : buildMonthBuckets(from, to);
    const prevChartData = chartMode === 'weekly'
        ? buildWeekBuckets(prevFrom, prevTo)
        : buildMonthBuckets(prevFrom, prevTo);

    chartData.forEach(bucket => {
        bucket.newLeads = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, bucket.start, bucket.end)).length;
        bucket.scheduled = allLeads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, bucket.start, bucket.end)).length;
        bucket.converted = allLeads.filter(l => countsAsConvertedInPeriod(l, bucket.start, bucket.end)).length;
    });
    prevChartData.forEach(bucket => {
      bucket.newLeads = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, bucket.start, bucket.end)).length;
      bucket.scheduled = allLeads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, bucket.start, bucket.end)).length;
      bucket.converted = allLeads.filter(l => countsAsConvertedInPeriod(l, bucket.start, bucket.end)).length;
    });

    // Heatmap por dia da semana/hora para agendamentos do período.
    let heatmapData = null;
    const heatmapRows = allLeads
      .filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, from, to))
      .map((l) => {
        const dateObj = toYmdTs(l.scheduledDate);
        const hour = parseHour(l.scheduledTime);
        if (!dateObj || hour === null) return null;
        return { day: dateObj.getDay(), hour };
      })
      .filter(Boolean);
    if (heatmapRows.length > 0) {
      heatmapData = {};
      heatmapRows.forEach(({ day, hour }) => {
        if (!heatmapData[day]) heatmapData[day] = {};
        heatmapData[day][hour] = Number(heatmapData[day][hour] || 0) + 1;
      });
    }

    // Série de conversão por bucket (com comparativo do período anterior por índice).
    const conversionSeries = chartData.length > 0
      ? chartData.map((bucket, idx) => {
          const curNew = Number(bucket.newLeads || 0);
          const curConverted = Number(bucket.converted || 0);
          const prevBucket = prevChartData[idx] || null;
          const prevNew = Number(prevBucket?.newLeads || 0);
          const prevConverted = Number(prevBucket?.converted || 0);
          const rate = curNew > 0 ? Number(((curConverted / curNew) * 100).toFixed(1)) : 0;
          const previousRate = prevNew > 0 ? Number(((prevConverted / prevNew) * 100).toFixed(1)) : 0;
          return {
            date: bucket.label,
            rate,
            previousRate,
          };
      })
      : null;

    // Tempo médio no funil (somente para convertidos no período com dados suficientes).
    const convertedInPeriod = allLeads.filter((l) => countsAsConvertedInPeriod(l, from, to));
    const createdToScheduledVals = [];
    const scheduledToAttendedVals = [];
    const attendedToConvertedVals = [];
    const totalVals = [];
    convertedInPeriod.forEach((l) => {
      const createdAt = l.$createdAt ? new Date(l.$createdAt) : null;
      const scheduledAt = toYmdTs(l.scheduledDate);
      const attendedAt = l.attended_at ? new Date(l.attended_at) : null;
      const convertedAt = l.converted_at ? new Date(l.converted_at) : null;

      const cts = diffDays(createdAt, scheduledAt);
      if (cts !== null) createdToScheduledVals.push(cts);

      const sta = diffDays(scheduledAt, attendedAt);
      if (sta !== null) scheduledToAttendedVals.push(sta);

      const atc = diffDays(attendedAt, convertedAt);
      if (atc !== null) attendedToConvertedVals.push(atc);

      const total = diffDays(createdAt, convertedAt);
      if (total !== null) totalVals.push(total);
    });
    const funnelTimingCandidate = {
      createdToScheduled: avg1(createdToScheduledVals),
      scheduledToAttended: avg1(scheduledToAttendedVals),
      attendedToConverted: avg1(attendedToConvertedVals),
      total: avg1(totalVals),
    };
    const funnelTiming = Object.values(funnelTimingCandidate).every((v) => v === null)
      ? null
      : funnelTimingCandidate;

    return json(res, 200, {
      period: { from, to },
      metrics: {
        newLeads: { current: newLeads.length, previous: newLeadsPrev.length, list: toList(newLeads) },
        scheduled: { current: scheduled.length, previous: scheduledPrev.length, list: toList(scheduled) },
        completed: { current: completed.length, previous: completedPrev.length, list: toList(completed) },
        missed: { current: missed.length, previous: missedPrev.length, list: toList(missed) },
        converted: { current: converted.length, previous: convertedPrev.length, list: toList(converted) },
        conversionRate: { current: conversionRate, previous: conversionRatePrev, list: [] }
      },
      chart: chartData,
      heatmapData,
      conversionSeries,
      funnelTiming
    });
  } catch (e) {
      console.error(e);
      return json(res, 500, { error: 'Falha ao gerar relatório' });
  }
}
