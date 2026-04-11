import { Client, Databases, Query, Account } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

async function getMe(jwt) {
  try {
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new Account(userClient);
    return await account.get();
  } catch { return null; }
}

const startOfWeek = (d) => {
    const dd = new Date(d);
    const day = dd.getDay();
    const diff = (day + 6) % 7;
    dd.setDate(dd.getDate() - diff);
    dd.setHours(0, 0, 0, 0);
    return dd;
};

const endOfWeek = (d) => {
    const dd = startOfWeek(d);
    dd.setDate(dd.getDate() + 6);
    dd.setHours(23, 59, 59, 999);
    return dd;
};

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

function buildWeekBuckets(fromD, toDEnd) {
    const out = [];
    let s = startOfWeek(new Date(fromD));
    let guard = 0;
    while (s <= toDEnd && guard++ < 60) {
        const e = endOfWeek(s);
        const clipEnd = e.getTime() > toDEnd.getTime() ? toDEnd : e;
        out.push({
            start: new Date(s),
            end: clipEnd,
            label: `${String(s.getDate()).padStart(2, '0')}/${String(s.getMonth() + 1).padStart(2, '0')}`,
            newLeads: 0,
            scheduled: 0,
            converted: 0
        });
        const next = new Date(e);
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
        s = startOfWeek(next);
    }
    return out;
}

function buildMonthBuckets(fromD, toDEnd) {
    const out = [];
    let s = startOfMonth(new Date(fromD));
    let guard = 0;
    while (s <= toDEnd && guard++ < 36) {
        const e = endOfMonth(s);
        const clipEnd = e.getTime() > toDEnd.getTime() ? toDEnd : e;
        out.push({
            start: new Date(s),
            end: clipEnd,
            label: `${String(s.getMonth() + 1).padStart(2, '0')}/${String(s.getFullYear()).slice(-2)}`,
            newLeads: 0,
            scheduled: 0,
            converted: 0
        });
        s = startOfMonth(new Date(s.getFullYear(), s.getMonth() + 1, 1));
    }
    return out;
}

export const config = {
  runtime: 'edge',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method Not Allowed' }, 405);

  const auth = String(req.headers.get('authorization') || '');
  const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  const me = await getMe(jwt);
  if (!me) return jsonResponse({ error: 'Não autorizado' }, 401);

  const body = await req.json().catch(() => ({}));
  const { academyId, from, to, prevFrom, prevTo, filters, chartMode = 'weekly' } = body;

  if (!academyId || !from || !to) {
      return jsonResponse({ error: 'Parâmetros obrigatórios faltando' }, 400);
  }

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

    const isRealLead = (l) => l.origin !== 'Planilha';
    const inRange = (ts, fromTs, toTs) => {
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return t >= new Date(fromTs).getTime() && t <= new Date(toTs).getTime();
    };

    const parseNotes = (notesStr) => {
        if (!notesStr) return [];
        try {
            const parsed = JSON.parse(notesStr);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && Array.isArray(parsed.history)) return parsed.history;
            return [];
        } catch {
            return [];
        }
    };

    const stageEventWithin = (lead, toStatus, fromTs, toTs) => {
      const notes = parseNotes(lead.notes);
      const hit = notes.find(e =>
        e?.type === 'stage_change' &&
        e?.to === toStatus &&
        inRange(e?.at || e?.date, fromTs, toTs)
      );
      if (hit) return true;
      if (lead.status === toStatus && lead.statusChangedAt && inRange(lead.statusChangedAt, fromTs, toTs)) return true;
      return false;
    };

    const newLeads = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, from, to));
    const newLeadsPrev = allLeads.filter(l => isRealLead(l) && inRange(l.$createdAt, prevFrom, prevTo));

    const scheduled = allLeads.filter(l => stageEventWithin(l, 'Agendado', from, to) || stageEventWithin(l, 'Aula experimental', from, to));
    const scheduledPrev = allLeads.filter(l => stageEventWithin(l, 'Agendado', prevFrom, prevTo) || stageEventWithin(l, 'Aula experimental', prevFrom, prevTo));

    const completed = allLeads.filter(l => stageEventWithin(l, 'Compareceu', from, to) || stageEventWithin(l, 'COMPLETED', from, to));
    const completedPrev = allLeads.filter(l => stageEventWithin(l, 'Compareceu', prevFrom, prevTo) || stageEventWithin(l, 'COMPLETED', prevFrom, prevTo));

    const missed = allLeads.filter(l => stageEventWithin(l, 'Não compareceu', from, to) || stageEventWithin(l, 'Não Compareceu', from, to) || stageEventWithin(l, 'MISSED', from, to));
    const missedPrev = allLeads.filter(l => stageEventWithin(l, 'Não compareceu', prevFrom, prevTo) || stageEventWithin(l, 'Não Compareceu', prevFrom, prevTo) || stageEventWithin(l, 'MISSED', prevFrom, prevTo));

    const converted = allLeads.filter(l => (l.contact_type === 'student' && inRange(l.$updatedAt, from, to)) || stageEventWithin(l, 'Matriculado', from, to) || stageEventWithin(l, 'CONVERTED', from, to));
    const convertedPrev = allLeads.filter(l => (l.contact_type === 'student' && inRange(l.$updatedAt, prevFrom, prevTo)) || stageEventWithin(l, 'Matriculado', prevFrom, prevTo) || stageEventWithin(l, 'CONVERTED', prevFrom, prevTo));

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
        bucket.scheduled = allLeads.filter(l => stageEventWithin(l, 'Agendado', bucket.start, bucket.end) || stageEventWithin(l, 'Aula experimental', bucket.start, bucket.end)).length;
        bucket.converted = allLeads.filter(l => (l.contact_type === 'student' && inRange(l.$updatedAt, bucket.start, bucket.end)) || stageEventWithin(l, 'Matriculado', bucket.start, bucket.end) || stageEventWithin(l, 'CONVERTED', bucket.start, bucket.end)).length;
    });

    return jsonResponse({
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
    }, 200);
  } catch (e) {
      console.error(e);
      return jsonResponse({ error: 'Falha ao gerar relatório' }, 500);
  }
}
