import { useMemo } from 'react';
import { buildFunnelStages } from '../lib/reportsFunnelUtils.js';

export function useFunnelDerived({ reportData, chartMetric, terms, contactsPlural }) {
  const funnelStages = useMemo(
    () => buildFunnelStages(reportData, terms, contactsPlural),
    [reportData, terms, contactsPlural]
  );

  const chartDataComparison = useMemo(() => {
    const rows = reportData?.chartComparison;
    if (!rows?.length) return [];
    const metricMap = chartMetric === 'new' ? 'newLeads' : chartMetric === 'scheduled' ? 'scheduled' : 'converted';
    const prevMap =
      chartMetric === 'new' ? 'prevNewLeads' : chartMetric === 'scheduled' ? 'prevScheduled' : 'prevConverted';
    return rows.map((bucket) => ({
      label: bucket.label,
      current: Number(bucket[metricMap] || 0),
      previous: Number(bucket[prevMap] || 0),
    }));
  }, [reportData, chartMetric]);

  const conversionChartData = useMemo(
    () => (Array.isArray(reportData?.conversionSeries) ? reportData.conversionSeries : []),
    [reportData]
  );

  const lastConversionPoint =
    conversionChartData.length > 0 ? conversionChartData[conversionChartData.length - 1] : null;

  return {
    funnelStages,
    chartDataComparison,
    conversionChartData,
    lastConversionPoint,
  };
}
