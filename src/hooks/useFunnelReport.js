import { useCallback, useEffect, useRef, useState } from 'react';
import { account } from '../lib/appwrite';
import { friendlyError } from '../lib/errorMessages.js';
import { endOfMonth, parseYMD, startOfMonth } from '../lib/reportsDateUtils.js';

export function useFunnelReport({
  enabled,
  academyId,
  preset,
  range,
  originFilter,
  profileFilter,
  chartMode,
  onDateError,
}) {
  const reportAbortRef = useRef(null);
  const filterDebounceSkip = useRef(true);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = useCallback(
    async (forceRefresh = false) => {
      if (!academyId || !enabled) return false;

      if (preset === 'custom') {
        const fa = parseYMD(range.from);
        const ta = parseYMD(range.to);
        if (fa && ta && fa.getTime() > ta.getTime()) {
          onDateError?.('A data inicial deve ser anterior à data final.');
          setError(null);
          return false;
        }
      }
      onDateError?.(null);

      reportAbortRef.current?.abort();
      const controller = new AbortController();
      reportAbortRef.current = controller;
      setLoading(true);
      setError(null);

      const fromDay = parseYMD(range.from);
      const toDay = parseYMD(range.to);
      const toDEndLocal = new Date(toDay);
      toDEndLocal.setHours(23, 59, 59, 999);

      const prevFromDLocal = (() => {
        if (preset === 'today') {
          const d = new Date(fromDay);
          d.setDate(d.getDate() - 1);
          return d;
        }
        if (preset === 'week') {
          const d = new Date(fromDay);
          d.setDate(d.getDate() - 7);
          return d;
        }
        if (preset === 'month' || preset === 'last_month') {
          const d = new Date(fromDay.getFullYear(), fromDay.getMonth() - 1, 1);
          return startOfMonth(d);
        }
        const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
        const d = new Date(fromDay);
        d.setDate(d.getDate() - span);
        return d;
      })();

      const prevToDLocal = (() => {
        if (preset === 'today') {
          const d = new Date(toDEndLocal);
          d.setDate(d.getDate() - 1);
          d.setHours(23, 59, 59, 999);
          return d;
        }
        if (preset === 'week') {
          const d = new Date(toDEndLocal);
          d.setDate(d.getDate() - 7);
          return d;
        }
        if (preset === 'month' || preset === 'last_month') {
          return endOfMonth(new Date(prevFromDLocal));
        }
        const span = Math.max(1, Math.ceil((toDEndLocal - fromDay) / 86400000));
        const d = new Date(toDEndLocal);
        d.setDate(d.getDate() - span);
        return d;
      })();

      try {
        const jwt = await account.createJWT();
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt.jwt}`,
            'x-academy-id': String(academyId || ''),
          },
          body: JSON.stringify({
            academyId,
            from: fromDay.toISOString(),
            to: toDEndLocal.toISOString(),
            prevFrom: prevFromDLocal.toISOString(),
            prevTo: prevToDLocal.toISOString(),
            filters: { origin: originFilter, type: profileFilter },
            chartMode,
            refresh: forceRefresh === true,
          }),
          signal: controller.signal,
        });
        if (res.status === 504) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || 'Muitos dados — tente um período menor');
        }
        if (!res.ok) throw new Error('Falha na resposta do servidor');
        const data = await res.json();
        if (!controller.signal.aborted) setReportData(data);
        return true;
      } catch (e) {
        if (e?.name === 'AbortError') return false;
        setError(friendlyError(e, 'load'));
        setReportData(null);
        console.error(e);
        return false;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [academyId, enabled, preset, range.from, range.to, originFilter, profileFilter, chartMode, onDateError]
  );

  useEffect(() => {
    if (!enabled) return;
    void fetchReport(false);
  }, [range, chartMode, academyId, preset, enabled, fetchReport]);

  useEffect(() => {
    if (!enabled) return;
    if (filterDebounceSkip.current) {
      filterDebounceSkip.current = false;
      return;
    }
    const t = window.setTimeout(() => void fetchReport(false), 300);
    return () => window.clearTimeout(t);
  }, [originFilter, profileFilter, enabled, fetchReport]);

  return {
    reportData,
    loading,
    error,
    fetchReport,
    showInitialLoad: loading && !reportData,
    showRefreshing: loading && Boolean(reportData),
  };
}
