import { evaluateKpiRag, formatKpiGoalTarget } from '../../lib/reportsKpiGoals.js';

export function kpiRagProps(metricKey, numericValue, goals) {
  const goal = goals?.[metricKey];
  if (!goal) return { rag: null, goalTarget: null };
  return {
    rag: evaluateKpiRag(numericValue, goal),
    goalTarget: formatKpiGoalTarget(goal, metricKey),
  };
}
