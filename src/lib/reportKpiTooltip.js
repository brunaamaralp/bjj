import {
  getMetricDefinition,
  REPORT_KPI_TOOLTIP_ALIASES,
} from '../../lib/reportsMetricDefinitions.js';
import { trendHintFor } from './reportsFunnelUtils.js';

/**
 * Tooltip unificado: definição da métrica (fórmula + fonte) + nota de comparação temporal.
 * @param {string} metricId — id em REPORT_METRIC_DEFINITIONS ou alias de UI
 * @param {{ preset?: string }} [options]
 */
export function reportKpiTooltip(metricId, { preset } = {}) {
  const defId = REPORT_KPI_TOOLTIP_ALIASES[metricId] || metricId;
  const def = getMetricDefinition(defId);
  const periodKey = metricId === 'conversionRate' ? 'conversionRate' : metricId;
  const periodHint = trendHintFor(periodKey, preset);

  if (!def) return periodHint;
  return `${def.label}: ${def.formula}. Fonte: ${def.source}. ${periodHint}`;
}
