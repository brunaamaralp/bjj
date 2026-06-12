import { useEffect, useState } from 'react';
import { fetchReportsOverview } from '../lib/reportsLightApi.js';
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
  const [salesKpiPrev, setSalesKpiPrev] = useState(null);
  const [salesKpiLoading, setSalesKpiLoading] = useState(false);
  const [inventoryKpi, setInventoryKpi] = useState(null);
  const [inventoryKpiPrev, setInventoryKpiPrev] = useState(null);
  const [inventoryKpiLoading, setInventoryKpiLoading] = useState(false);

  const prevRangeYmd = previousPeriodRange(preset, range);
  const needsOverview =
    active &&
    academyId &&
    ((hasFinance && canViewFinance) || hasSales || hasInventory);

  useEffect(() => {
    let alive = true;
    if (!needsOverview) {
      setFinanceKpi(null);
      setFinanceKpiPrev(null);
      setFinanceKpiLoading(false);
      setFinanceKpiError(null);
      setSalesKpi(null);
      setSalesKpiPrev(null);
      setSalesKpiLoading(false);
      setInventoryKpi(null);
      setInventoryKpiPrev(null);
      setInventoryKpiLoading(false);
      return undefined;
    }

    const regime = getFinanceRegime(academyId);
    const loadingFinance = hasFinance && canViewFinance;
    const loadingSales = hasSales;
    const loadingInventory = hasInventory;

    setFinanceKpiLoading(loadingFinance);
    setSalesKpiLoading(loadingSales);
    setInventoryKpiLoading(loadingInventory);
    setFinanceKpiError(null);

    fetchReportsOverview({
      academyId,
      from: range.from,
      to: range.to,
      prevFrom: prevRangeYmd.from,
      prevTo: prevRangeYmd.to,
      regime,
    })
      .then((data) => {
        if (!alive) return;
        if (loadingFinance && data.financePrivileged) {
          setFinanceKpi(data.finance);
          setFinanceKpiPrev(data.financePrev);
        } else {
          setFinanceKpi(null);
          setFinanceKpiPrev(null);
        }
        setSalesKpi(loadingSales ? data.sales : null);
        setSalesKpiPrev(loadingSales ? data.salesPrev : null);
        setInventoryKpi(loadingInventory ? data.inventory : null);
        setInventoryKpiPrev(loadingInventory ? data.inventoryPrev : null);
      })
      .catch(() => {
        if (!alive) return;
        setFinanceKpi(null);
        setFinanceKpiPrev(null);
        setSalesKpi(null);
        setSalesKpiPrev(null);
        setInventoryKpi(null);
        setInventoryKpiPrev(null);
        if (loadingFinance) {
          setFinanceKpiError('Não foi possível carregar o resumo financeiro.');
        }
      })
      .finally(() => {
        if (!alive) return;
        setFinanceKpiLoading(false);
        setSalesKpiLoading(false);
        setInventoryKpiLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [
    needsOverview,
    academyId,
    range.from,
    range.to,
    prevRangeYmd.from,
    prevRangeYmd.to,
    hasFinance,
    canViewFinance,
    hasSales,
    hasInventory,
  ]);

  return {
    financeKpi,
    financeKpiPrev,
    financeKpiLoading,
    financeKpiError,
    salesKpi,
    salesKpiPrev,
    salesKpiLoading,
    inventoryKpi,
    inventoryKpiPrev,
    inventoryKpiLoading,
  };
}
