/**
 * Agregação do funil em uma única passagem sobre allLeads.
 */
import {
  buildWeekBuckets,
  buildMonthBuckets,
  isRealLead,
  inRange,
  inRangeYmd,
  countsAsConvertedInPeriod,
  countsAsMissedExperimentalInPeriod,
  countsAsNewStudentInPeriod,
  isActiveStudentAtDate,
  countsAsDeactivationInPeriod,
} from '../reportsMetrics.js';

function toList(arr) {
  return arr.map((l) => ({
    id: l.$id,
    name: l.name,
    phone: l.phone,
    origin: l.origin,
    type: l.type,
  }));
}

function bumpBucket(buckets, ts, field) {
  if (!ts || !buckets?.length) return;
  const t = new Date(ts).getTime();
  for (const b of buckets) {
    if (t >= b.start.getTime() && t <= b.end.getTime()) {
      b[field] = (b[field] || 0) + 1;
      return;
    }
  }
}

function bumpBucketYmd(buckets, ymd, field) {
  if (!ymd || !buckets?.length) return;
  for (const b of buckets) {
    if (inRangeYmd(ymd, b.start, b.end)) {
      b[field] = (b[field] || 0) + 1;
      return;
    }
  }
}

/**
 * @param {object[]} allLeads
 * @param {{ from: string, to: string, prevFrom: string, prevTo: string, chartMode?: string }} opts
 */
export function aggregateLeadsReport(allLeads, { from, to, prevFrom, prevTo, chartMode = 'weekly' }) {
  const chartData =
    chartMode === 'monthly' ? buildMonthBuckets(from, to) : buildWeekBuckets(from, to);
  const prevChartData =
    chartMode === 'monthly'
      ? buildMonthBuckets(prevFrom, prevTo)
      : buildWeekBuckets(prevFrom, prevTo);

  const lists = {
    newLeads: [],
    newLeadsPrev: [],
    scheduled: [],
    scheduledPrev: [],
    completed: [],
    completedPrev: [],
    missed: [],
    missedPrev: [],
    converted: [],
    convertedPrev: [],
  };

  let activeAtStart = 0;
  let newStudents = 0;
  let deactivations = 0;

  const heatmapAcc = {};
  const timing = {
    createdToScheduled: [],
    scheduledToAttended: [],
    attendedToConverted: [],
    total: [],
  };

  const fromStart = new Date(from);
  const diffDays = (a, b) => {
    if (!(a instanceof Date) || Number.isNaN(a.getTime())) return null;
    if (!(b instanceof Date) || Number.isNaN(b.getTime())) return null;
    const v = (b.getTime() - a.getTime()) / 86400000;
    return v >= 0 ? v : null;
  };
  const toYmdTs = (ymd) => {
    if (!ymd) return null;
    const [Y, M, D] = String(ymd).split('-').map(Number);
    const dt = new Date(Y, M - 1, D, 0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  };
  const parseHour = (hhmm) => {
    const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = Number(m[1]);
    return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
  };

  for (const l of allLeads) {
    if (!isRealLead(l)) continue;

    const createdIn = inRange(l.$createdAt, from, to);
    const createdPrev = inRange(l.$createdAt, prevFrom, prevTo);
    const schedIn = inRangeYmd(l.scheduledDate, from, to);
    const schedPrev = inRangeYmd(l.scheduledDate, prevFrom, prevTo);
    const completedIn = l.attended_at && inRange(l.attended_at, from, to);
    const completedPrev = l.attended_at && inRange(l.attended_at, prevFrom, prevTo);
    const missedIn = countsAsMissedExperimentalInPeriod(l, from, to);
    const missedPrev = countsAsMissedExperimentalInPeriod(l, prevFrom, prevTo);
    const newStudentIn = countsAsNewStudentInPeriod(l, from, to);
    const newStudentPrev = countsAsNewStudentInPeriod(l, prevFrom, prevTo);

    if (createdIn) {
      lists.newLeads.push(l);
      bumpBucket(chartData, l.$createdAt, 'newLeads');
    }
    if (createdPrev) lists.newLeadsPrev.push(l);
    if (schedIn) {
      lists.scheduled.push(l);
      bumpBucketYmd(chartData, l.scheduledDate, 'scheduled');
      const dateObj = toYmdTs(l.scheduledDate);
      const hour = parseHour(l.scheduledTime);
      if (dateObj && hour !== null) {
        const day = dateObj.getDay();
        if (!heatmapAcc[day]) heatmapAcc[day] = {};
        heatmapAcc[day][hour] = Number(heatmapAcc[day][hour] || 0) + 1;
      }
    }
    if (schedPrev) lists.scheduledPrev.push(l);
    if (completedIn) lists.completed.push(l);
    if (completedPrev) lists.completedPrev.push(l);
    if (missedIn) lists.missed.push(l);
    if (missedPrev) lists.missedPrev.push(l);
    if (newStudentIn) {
      lists.converted.push(l);
      bumpBucket(chartData, l.converted_at, 'converted');
    }
    if (newStudentPrev) lists.convertedPrev.push(l);

    if (isActiveStudentAtDate(l, fromStart)) activeAtStart += 1;
    if (newStudentIn) newStudents += 1;
    if (countsAsDeactivationInPeriod(l, from, to)) deactivations += 1;

    if (newStudentIn) {
      const createdAt = l.$createdAt ? new Date(l.$createdAt) : null;
      const scheduledAt = toYmdTs(l.scheduledDate);
      const attendedAt = l.attended_at ? new Date(l.attended_at) : null;
      const convertedAt = l.converted_at ? new Date(l.converted_at) : null;
      const cts = diffDays(createdAt, scheduledAt);
      if (cts !== null) timing.createdToScheduled.push(cts);
      const sta = diffDays(scheduledAt, attendedAt);
      if (sta !== null) timing.scheduledToAttended.push(sta);
      const atc = diffDays(attendedAt, convertedAt);
      if (atc !== null) timing.attendedToConverted.push(atc);
      const total = diffDays(createdAt, convertedAt);
      if (total !== null) timing.total.push(total);
    }

    if (createdPrev) bumpBucket(prevChartData, l.$createdAt, 'newLeads');
    if (schedPrev) bumpBucketYmd(prevChartData, l.scheduledDate, 'scheduled');
    if (newStudentPrev) bumpBucket(prevChartData, l.converted_at, 'converted');
  }

  const avg1 = (arr) => {
    if (!arr.length) return null;
    return Number((arr.reduce((a, n) => a + n, 0) / arr.length).toFixed(1));
  };

  const churnRate =
    activeAtStart > 0 ? Math.round((deactivations / activeAtStart) * 1000) / 10 : 0;
  const retentionRate = Math.max(0, Math.round((100 - churnRate) * 10) / 10);

  const newLeadsLen = lists.newLeads.length;
  const newLeadsPrevLen = lists.newLeadsPrev.length;
  const convertedLen = lists.converted.length;
  const convertedPrevLen = lists.convertedPrev.length;

  const conversionSeries =
    chartData.length > 0
      ? chartData.map((bucket, idx) => {
          const curNew = Number(bucket.newLeads || 0);
          const curConverted = Number(bucket.converted || 0);
          const prevBucket = prevChartData[idx] || null;
          const prevNew = Number(prevBucket?.newLeads || 0);
          const prevConverted = Number(prevBucket?.converted || 0);
          return {
            date: bucket.label,
            rate: curNew > 0 ? Number(((curConverted / curNew) * 100).toFixed(1)) : 0,
            previousRate: prevNew > 0 ? Number(((prevConverted / prevNew) * 100).toFixed(1)) : 0,
          };
        })
      : null;

  const chartComparison = chartData.map((bucket, idx) => {
    const prev = prevChartData[idx] || {};
    return {
      label: bucket.label,
      newLeads: Number(bucket.newLeads || 0),
      scheduled: Number(bucket.scheduled || 0),
      converted: Number(bucket.converted || 0),
      prevNewLeads: Number(prev.newLeads || 0),
      prevScheduled: Number(prev.scheduled || 0),
      prevConverted: Number(prev.converted || 0),
    };
  });

  const funnelTimingCandidate = {
    createdToScheduled: avg1(timing.createdToScheduled),
    scheduledToAttended: avg1(timing.scheduledToAttended),
    attendedToConverted: avg1(timing.attendedToConverted),
    total: avg1(timing.total),
  };
  const funnelTiming = Object.values(funnelTimingCandidate).every((v) => v === null)
    ? null
    : funnelTimingCandidate;

  const heatmapData = Object.keys(heatmapAcc).length > 0 ? heatmapAcc : null;

  return {
    metrics: {
      newLeads: { current: newLeadsLen, previous: newLeadsPrevLen, list: toList(lists.newLeads) },
      scheduled: { current: lists.scheduled.length, previous: lists.scheduledPrev.length, list: toList(lists.scheduled) },
      completed: { current: lists.completed.length, previous: lists.completedPrev.length, list: toList(lists.completed) },
      missed: { current: lists.missed.length, previous: lists.missedPrev.length, list: toList(lists.missed) },
      converted: { current: convertedLen, previous: convertedPrevLen, list: toList(lists.converted) },
      conversionRate: {
        current: newLeadsLen > 0 ? Math.round((convertedLen / newLeadsLen) * 100) : 0,
        previous: newLeadsPrevLen > 0 ? Math.round((convertedPrevLen / newLeadsPrevLen) * 100) : 0,
        list: [],
      },
    },
    studentMetrics: {
      activeAtStart,
      newStudents,
      deactivations,
      churnRate,
      retentionRate,
    },
    chart: chartData,
    chartComparison,
    heatmapData,
    conversionSeries,
    funnelTiming,
    leadCount: allLeads.length,
  };
}
