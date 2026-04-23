/**
 * Extrai lista de valores de horário (ex.: "18:00", "19:00-20:00") a partir do documento
 * da academia — mesmo critério usado antes em Pipeline.jsx (quickTimes).
 */

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const normalizeDayToken = (t) => t.toLowerCase().trim().replace(/á/g, 'a').slice(0, 3);
const dayTokenToIndex = (tok) => {
  const n = normalizeDayToken(tok);
  return WEEK.findIndex((x) => x === n);
};

function parseQuickItems(arr) {
  return arr
    .map((entry) => {
      const raw = String(entry).trim();
      if (!raw) return { days: null, label: '', value: '' };
      const firstSpace = raw.indexOf(' ');
      let days = null;
      let timePart = raw;
      if (firstSpace > 0) {
        const possibleDays = raw.slice(0, firstSpace);
        const rest = raw.slice(firstSpace + 1).trim();
        const looksLikeDays = /^[A-Za-zçÇáÁéÉíÍóÓúÚãÃõÕêÊôÔàÀ,\s]+$/.test(possibleDays);
        if (looksLikeDays && rest) {
          const tokens = possibleDays.split(',').map((t) => t.trim()).filter(Boolean);
          const idxs = tokens.map(dayTokenToIndex).filter((i) => i >= 0);
          if (idxs.length > 0) {
            days = Array.from(new Set(idxs));
            timePart = rest;
          }
        }
      }
      const label = timePart;
      return { days, label, value: timePart };
    })
    .filter((it) => it.label);
}

const parseTimeToMinutes = (t) => {
  const parts = String(t || '').split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) || 0;
  if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
  return Number.MAX_SAFE_INTEGER;
};

const timeStartMinutes = (timePart) => {
  const norm = String(timePart || '').replace('–', '-');
  const start = norm.split('-')[0].trim();
  return parseTimeToMinutes(start);
};

/**
 * @param {object | null | undefined} doc — documento Appwrite da academia
 * @returns {string[]}
 */
export function getAcademyQuickTimeChipValues(doc) {
  let raw = [];
  if (Array.isArray(doc?.quickTimes)) raw = doc.quickTimes;
  else if (typeof doc?.quickTimes === 'string' && doc.quickTimes.trim()) {
    raw = doc.quickTimes.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const parsed = parseQuickItems(raw);
  const vals = [...new Set(parsed.map((p) => p.value).filter(Boolean))];
  vals.sort((a, b) => timeStartMinutes(a) - timeStartMinutes(b));
  if (vals.length > 0) return vals;
  return ['18:00', '19:00'];
}
