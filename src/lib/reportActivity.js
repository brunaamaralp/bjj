/**
 * Indica se o payload do relatório tem alguma métrica com current > 0.
 * Usa `m.current` (compatível com métricas numéricas do /api/reports).
 */
export function hasAnyActivity(reportData) {
  if (!reportData?.metrics) return false;
  return Object.values(reportData.metrics).some((m) => m && Number(m.current ?? 0) > 0);
}
