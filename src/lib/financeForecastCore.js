/**
 * Previsão de caixa — agregação por semana (compartilhado cliente/servidor).
 */

export function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export const FINANCE_TIMEZONE = 'America/Sao_Paulo';

/** Partes da data no fuso das academias (Brasil). */
export function financeDateParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FINANCE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday || '',
  };
}

export function todayYmdFinance(date = new Date()) {
  const { year, month, day } = financeDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function currentYmFinance(date = new Date()) {
  const { year, month } = financeDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function todayYmdLocal() {
  return todayYmdFinance();
}

export function parseYmd(s) {
  const raw = String(s || '').trim().slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysYmd(ymd, days) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + Number(days) || 0);
  return formatYmd(d);
}

/** Segunda-feira da semana que contém `ymd`. */
export function weekStartMonday(ymd) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatYmd(d);
}

export function weekEndSunday(weekStartYmd) {
  return addDaysYmd(weekStartYmd, 6);
}

/** Semanas (seg–dom) que intersectam [from, to]. */
export function buildWeekRanges(fromYmd, toYmd) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (!from || !to || from > to) return [];

  let cursor = weekStartMonday(fromYmd);
  const end = formatYmd(to);
  const seen = new Set();
  const weeks = [];

  while (cursor <= end) {
    if (!seen.has(cursor)) {
      seen.add(cursor);
      const wEnd = weekEndSunday(cursor);
      weeks.push({
        week_start: cursor,
        week_end: wEnd > end ? end : wEnd,
        expected_inflow: 0,
        expected_inflow_gross: 0,
        expected_outflow: 0,
        net: 0,
        items: [],
      });
    }
    cursor = addDaysYmd(cursor, 7);
    if (weeks.length > 60) break;
  }
  return weeks;
}

export function findWeekIndex(weeks, dueYmd) {
  const ymd = String(dueYmd || '').slice(0, 10);
  if (!ymd) return -1;
  for (let i = 0; i < weeks.length; i += 1) {
    const w = weeks[i];
    if (ymd >= w.week_start && ymd <= w.week_end) return i;
  }
  return -1;
}

export function pushForecastItem(weeks, item) {
  const idx = findWeekIndex(weeks, item.due_date);
  if (idx < 0) return;
  const w = weeks[idx];
  const grossAmt = roundMoney(item.amount_gross ?? item.amount);
  const netAmt = roundMoney(item.amount);
  if (netAmt <= 0 && grossAmt <= 0) return;
  w.items.push({
    ...item,
    amount: netAmt,
    amount_gross: grossAmt,
  });
  if (item._flow === 'out') {
    w.expected_outflow += netAmt;
  } else {
    w.expected_inflow += netAmt;
    w.expected_inflow_gross = roundMoney((w.expected_inflow_gross || 0) + grossAmt);
  }
}

export function finalizeWeeks(weeks) {
  for (const w of weeks) {
    w.expected_inflow = roundMoney(w.expected_inflow);
    w.expected_inflow_gross = roundMoney(w.expected_inflow_gross || w.expected_inflow);
    w.expected_outflow = roundMoney(w.expected_outflow);
    w.net = roundMoney(w.expected_inflow - w.expected_outflow);
    w.items.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  }
  return weeks;
}

export function sumForecastFlows(weeks) {
  let inflow = 0;
  let inflowGross = 0;
  let outflow = 0;
  for (const w of weeks) {
    inflow += w.expected_inflow;
    inflowGross += w.expected_inflow_gross || w.expected_inflow;
    outflow += w.expected_outflow;
  }
  return {
    inflow: roundMoney(inflow),
    inflow_gross: roundMoney(inflowGross),
    outflow: roundMoney(outflow),
  };
}

function buildRecurrenceItem(template, ymd, gross) {
  return {
    type: 'recorrencia',
    label: String(template.label || template.planName || template.category || 'Recorrente').trim(),
    amount: gross,
    due_date: ymd,
    status: 'recorrente',
    _flow: template._flow || 'out',
    lead_id: template.lead_id || undefined,
    student_name: template.student_name || undefined,
  };
}

/** Projeta ocorrências de recorrência entre from e to. */
export function projectRecurrenceOccurrences(template, fromYmd, toYmd) {
  const recurrenceType = String(template.recurrence_type || 'monthly').trim().toLowerCase();
  const day = Math.min(31, Math.max(1, Math.trunc(Number(template.recurrence_day) || 1)));
  const gross = Math.abs(Number(template.gross) || 0);
  if (gross < 0.01) return [];

  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (!from || !to) return [];

  const out = [];
  if (recurrenceType === 'weekly' || recurrenceType === 'biweekly') {
    const sourceDate = parseYmd(template.base_date || template.due_date || template.created_at || fromYmd) || from;
    const weekday = sourceDate.getDay();
    const stepDays = recurrenceType === 'biweekly' ? 14 : 7;
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12, 0, 0, 0);
    const delta = (weekday - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + delta);
    while (cursor <= to) {
      const ymd = formatYmd(cursor);
      if (cursor >= from && ymd >= fromYmd) {
        out.push(buildRecurrenceItem(template, ymd, gross));
      }
      cursor.setDate(cursor.getDate() + stepDays);
      if (out.length > 240) break;
    }
    return out;
  }

  let y = from.getFullYear();
  let m = from.getMonth();
  const endY = to.getFullYear();
  const endM = to.getMonth();

  while (y < endY || (y === endY && m <= endM)) {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const dom = Math.min(day, lastDay);
    const occ = new Date(y, m, dom, 12, 0, 0, 0);
    const ymd = formatYmd(occ);
    if (occ >= from && occ <= to && ymd >= fromYmd) {
      out.push(buildRecurrenceItem(template, ymd, gross));
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (out.length > 120) break;
  }
  return out;
}

export function buildForecastChartRows(weeks, openingBalance) {
  let cumulative = roundMoney(openingBalance);
  return weeks.map((w) => {
    cumulative = roundMoney(cumulative + w.net);
    const start = w.week_start.slice(5).replace('-', '/');
    return {
      week_start: w.week_start,
      week_end: w.week_end,
      label: start,
      inflow: w.expected_inflow_gross ?? w.expected_inflow,
      inflow_net: w.expected_inflow,
      outflow: w.expected_outflow,
      net: w.net,
      balance: cumulative,
    };
  });
}

export function forecast30DaysRange(from = todayYmdLocal()) {
  return { from, to: addDaysYmd(from, 30) };
}

/**
 * Data de vencimento/previsão de um lançamento no Caixa para a previsão de fluxo.
 * Prioriza liquidação bancária agendada (`expected_settlement_at`).
 */
export function forecastTxDueYmd(doc, mapped = null) {
  const m = mapped || {};
  const expected = String(doc?.expected_settlement_at || m.expected_settlement_at || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(expected)) return expected;

  const dueRaw = doc?.due_date != null ? doc.due_date : m.due_date;
  if (dueRaw) {
    const due = String(dueRaw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  }

  const cm = String(m.competence_month || doc?.competence_month || '').trim();
  if (/^\d{4}-\d{2}$/.test(cm)) return `${cm}-28`;

  if (doc?.$createdAt) return String(doc.$createdAt).slice(0, 10);
  return todayYmdLocal();
}

export const FORECAST_PERIOD_PRESETS = {
  '30d': (from = todayYmdLocal()) => forecast30DaysRange(from),
  '4w': (from = todayYmdLocal()) => ({ from, to: addDaysYmd(from, 27) }),
  '1m': () => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 2, 0, 12, 0, 0, 0);
    return { from: formatYmd(start), to: formatYmd(end) };
  },
  '3m': (from = todayYmdLocal()) => ({ from, to: addDaysYmd(from, 89) }),
};
