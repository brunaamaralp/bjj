import { Client, Databases, Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import {
    buildWeekBuckets,
    buildMonthBuckets,
    isRealLead,
    inRange,
    inRangeYmd,
    countsAsConvertedInPeriod
} from '../lib/reportsMetrics.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) { res.status(status).json(obj); }

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
    if (filters?.type && filters.type !== 'all') baseQueries.push(Query.equal('type', filters.type));

    const allLeads = await fetchAll(baseQueries);

    const newLeads = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, from, to));
    const newLeadsPrev = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, prevFrom, prevTo));

    const scheduled = allLeads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, from, to));
    const scheduledPrev = allLeads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, prevFrom, prevTo));

    const completed = allLeads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, from, to));
    const completedPrev = allLeads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, prevFrom, prevTo));

    const missed = allLeads.filter((l) => isRealLead(l) && l.missed_at && inRange(l.missed_at, from, to));
    const missedPrev = allLeads.filter((l) => isRealLead(l) && l.missed_at && inRange(l.missed_at, prevFrom, prevTo));

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

    chartData.forEach(bucket => {
        bucket.newLeads = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, bucket.start, bucket.end)).length;
        bucket.scheduled = allLeads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, bucket.start, bucket.end)).length;
        bucket.converted = allLeads.filter(l => countsAsConvertedInPeriod(l, bucket.start, bucket.end)).length;
    });

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
      chart: chartData
    });
  } catch (e) {
      console.error(e);
      return json(res, 500, { error: 'Falha ao gerar relatório' });
  }
}
