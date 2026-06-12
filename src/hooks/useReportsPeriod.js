import { useMemo, useState } from 'react';
import {
  REPORT_PRESETS,
  endOfMonth,
  formatRangeLongPt,
  parseYMD,
  resolveReportsRange,
  startOfMonth,
  ymd,
} from '../lib/reportsDateUtils.js';

export function useReportsPeriod() {
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(() => ymd(startOfMonth(new Date())));
  const [to, setTo] = useState(() => ymd(endOfMonth(new Date())));
  const [dateError, setDateError] = useState(null);

  const range = useMemo(
    () => resolveReportsRange(preset, from, to),
    [preset, from, to]
  );

  const prettyRange = useMemo(
    () => formatRangeLongPt(range.from, range.to),
    [range.from, range.to]
  );

  const rangeSlug = `${range.from}_${range.to}`;

  const validateCustomRange = () => {
    if (preset !== 'custom') {
      setDateError(null);
      return true;
    }
    const fa = parseYMD(range.from);
    const ta = parseYMD(range.to);
    if (fa && ta && fa.getTime() > ta.getTime()) {
      setDateError('A data inicial deve ser anterior à data final.');
      return false;
    }
    setDateError(null);
    return true;
  };

  return {
    presets: REPORT_PRESETS,
    preset,
    setPreset,
    from,
    setFrom,
    to,
    setTo,
    range,
    prettyRange,
    rangeSlug,
    dateError,
    setDateError,
    validateCustomRange,
  };
}
