import { useEffect, useState } from 'react';
import { fetchInventoryReport } from '../lib/inventoryReportApi.js';
import { fetchReportsFinanceLightResult, fetchReportsSalesLight } from '../lib/reportsLightApi.js';
import { getFinanceRegime } from '../lib/financeCompetence.js';
import { previousPeriodRange } from '../lib/reportsPeriod.js';

export function useReportsOverviewKpis({
  active,
  academyId,
  range,
  preset,
  hasFinance,
  canViewFinance,
  hasSales,
  hasInventory,
}) {
  const [financeKpi, setFinanceKpi] = useState(null);
  const [financeKpiPrev, setFinanceKpiPrev] = useState(null);
  const [financeKpiLoading, setFinanceKpiLoading] = useState(false);
  const [financeKpiError, setFinanceKpiError] = useState(null);
  const [salesKpi, setSalesKpi] = useState(null);
  const [salesKpiLoading, setSalesKpiLoading] = useState(false);
  const [inventoryKpi, setInventoryKpi] = useState(null);
  const [inventoryKpiLoading, setInventoryKpiLoading] = useState(false);

  const prevRangeYmd = previousPeriodRange(preset, range);

  useEffect(() => {
    let alive = true;
    if (!active || !academyId || !hasFinance || !canViewFinance) {
      setFinanceKpi(null);
      setFinanceKpiPrev(null);
      setFinanceKpiLoading(false);
      setFinanceKpiError(null);
      return undefined;
    }
    const regime = getFinanceRegime(academyId);
    setFinanceKpiLoading(true);
    setFinanceKpiError(null);
    Promise.all([
      fetchReportsFinanceLightResult({ academyId, from: range.from, to: range.to, regime }),
      fetchReportsFinanceLightResult({
        academyId,
        from: prevRangeYmd.from,
        to: prevRangeYmd.to,
        regime,
      }),
    ])
      .then(([cur, prev]) => {
        if (!alive) return;
        setFinanceKpi(cur.ok && !cur.permissionDenied ? cur.data : null);
        setFinanceKpiPrev(prev.ok && !prev.permissionDenied ? prev.data : null);
      })
      .catch(() => {
        if (alive) {
          setFinanceKpi(null);
          setFinanceKpiPrev(null);
          setFinanceKpiError('Não foi possível carregar o resumo financeiro.');
        }
      })
      .finally(() => {
        if (alive) setFinanceKpiLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, academyId, hasFinance, canViewFinance, range.from, range.to, prevRangeYmd.from, prevRangeYmd.to]);

  useEffect(() => {
    let alive = true;
    if (!active || !academyId || !hasSales) {
      setSalesKpi(null);
      setSalesKpiLoading(false);
      return undefined;
    }
    setSalesKpiLoading(true);
    fetchReportsSalesLight({ academyId, from: range.from, to: range.to })
      .then((data) => {
        if (alive) setSalesKpi(data);
      })
      .catch(() => {
        if (alive) setSalesKpi(null);
      })
      .finally(() => {
        if (alive) setSalesKpiLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, academyId, hasSales, range.from, range.to]);

  useEffect(() => {
    let alive = true;
    if (!active || !academyId || !hasInventory) {
      setInventoryKpi(null);
      setInventoryKpiLoading(false);
      return undefined;
    }
    setInventoryKpiLoading(true);
    fetchInventoryReport({ from: range.from, to: range.to, academyId })
      .then((data) => {
        if (alive) setInventoryKpi(data?.summary || null);
      })
      .catch(() => {
        if (alive) setInventoryKpi(null);
      })
      .finally(() => {
        if (alive) setInventoryKpiLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active, academyId, hasInventory, range.from, range.to]);

  return {
    financeKpi,
    financeKpiPrev,
    financeKpiLoading,
    financeKpiError,
    salesKpi,
    salesKpiLoading,
    inventoryKpi,
    inventoryKpiLoading,
  };
}
