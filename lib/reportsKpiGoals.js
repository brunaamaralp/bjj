/**
 * Metas de KPI dos relatórios (armazenadas em academy.settings.reportsKpiGoals).
 */

export const REPORT_KPI_GOAL_KEYS = [
  'conversionRate',
  'churnRate',
  'retentionRate',
  'cancelCount',
  'financeReceived',
  'financeExpenses',
  'financeBalance',
  'criticalItems',
  'stalledItems',
];

/** @typedef {'higher' | 'lower'} KpiGoalDirection */

/**
 * @typedef {Object} KpiGoalConfig
 * @property {number} target
 * @property {KpiGoalDirection} direction
 * @property {number} [warning] — limiar amarelo (opcional)
 * @property {number} [critical] — limiar vermelho (opcional)
 */

/** @type {Record<string, { label: string, unit: '%', direction: KpiGoalDirection, defaultTarget: number }>} */
export const REPORT_KPI_GOAL_META = {
  conversionRate: {
    label: 'Taxa de conversão',
    unit: '%',
    direction: 'higher',
    defaultTarget: 25,
  },
  churnRate: {
    label: 'Churn',
    unit: '%',
    direction: 'lower',
    defaultTarget: 5,
  },
  retentionRate: {
    label: 'Retenção',
    unit: '%',
    direction: 'higher',
    defaultTarget: 95,
  },
  cancelCount: {
    label: 'Cancelamentos (vendas)',
    unit: '',
    direction: 'lower',
    defaultTarget: 5,
  },
  financeReceived: {
    label: 'Recebido (período)',
    unit: 'R$',
    direction: 'higher',
    defaultTarget: 10000,
  },
  financeExpenses: {
    label: 'Despesas (período)',
    unit: 'R$',
    direction: 'lower',
    defaultTarget: 5000,
  },
  financeBalance: {
    label: 'Saldo do período',
    unit: 'R$',
    direction: 'higher',
    defaultTarget: 0,
  },
  criticalItems: {
    label: 'Itens críticos',
    unit: '',
    direction: 'lower',
    defaultTarget: 3,
  },
  stalledItems: {
    label: 'Itens parados',
    unit: '',
    direction: 'lower',
    defaultTarget: 5,
  },
};

export function parseAcademySettingsJson(raw) {
  if (!raw) return {};
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

/** @returns {Record<string, KpiGoalConfig>} */
export function parseReportsKpiGoals(settingsRaw) {
  const settings = parseAcademySettingsJson(settingsRaw);
  const raw = settings.reportsKpiGoals;
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const key of REPORT_KPI_GOAL_KEYS) {
    const row = raw[key];
    if (!row || typeof row !== 'object') continue;
    const target = Number(row.target);
    if (!Number.isFinite(target) || target < 0) continue;
    const meta = REPORT_KPI_GOAL_META[key];
    const direction = row.direction === 'lower' || row.direction === 'higher' ? row.direction : meta.direction;
    out[key] = {
      target,
      direction,
      ...(Number.isFinite(Number(row.warning)) ? { warning: Number(row.warning) } : {}),
      ...(Number.isFinite(Number(row.critical)) ? { critical: Number(row.critical) } : {}),
    };
  }
  return out;
}

export function mergeReportsKpiGoalsIntoSettings(settingsRaw, goals) {
  const base = parseAcademySettingsJson(settingsRaw);
  return { ...base, reportsKpiGoals: goals };
}

function defaultThresholds(target, direction) {
  if (direction === 'lower') {
    return { warning: target * 1.2, critical: target * 1.5 };
  }
  return { warning: target * 0.9, critical: target * 0.8 };
}

/**
 * @param {number} value
 * @param {KpiGoalConfig | undefined} goal
 * @returns {'ok' | 'warn' | 'critical' | null}
 */
export function evaluateKpiRag(value, goal) {
  if (!goal || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  const t = Number(goal.target);
  if (!Number.isFinite(t)) return null;
  const direction = goal.direction === 'lower' ? 'lower' : 'higher';
  const thresholds = defaultThresholds(t, direction);
  const warning = Number.isFinite(goal.warning) ? Number(goal.warning) : thresholds.warning;
  const critical = Number.isFinite(goal.critical) ? Number(goal.critical) : thresholds.critical;

  if (direction === 'lower') {
    if (v >= critical) return 'critical';
    if (v >= warning) return 'warn';
    return 'ok';
  }
  if (v <= critical) return 'critical';
  if (v <= warning) return 'warn';
  return 'ok';
}

export function formatKpiGoalTarget(goal, key) {
  if (!goal) return '';
  const meta = REPORT_KPI_GOAL_META[key];
  const unit = meta?.unit || '';
  return `Meta: ${goal.target}${unit}`;
}
