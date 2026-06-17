import { useEffect, useMemo, useState } from 'react';
import { fetchAttendanceRetention } from '../lib/attendanceRetentionApi.js';

/**
 * KPIs de retenção (sem carregar a fila completa na UI além do summary).
 * @param {string} academyId
 * @param {{ enabled?: boolean }} [opts]
 */
export function useAttendanceRetentionSummary(academyId, { enabled = true } = {}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !academyId) {
      setSummary(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    void fetchAttendanceRetention({ academyId })
      .then((data) => {
        if (!cancelled) setSummary(data?.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academyId, enabled]);

  const atRiskCount = useMemo(() => {
    if (!summary) return 0;
    return (
      (Number(summary.at_risk) || 0) +
      (Number(summary.absent) || 0) +
      (Number(summary.newcomer_at_risk) || 0)
    );
  }, [summary]);

  return { summary, atRiskCount, loading };
}
