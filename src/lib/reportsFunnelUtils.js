export const DRILL_LABELS = {
  newLeads: 'Novos leads no período',
  scheduled: 'Aulas agendadas no período',
  showed: 'Compareceram (registrado no período)',
  completed: 'Compareceram (registrado no período)',
  missed: 'Não compareceram (registrado no período)',
  converted: 'Matrículas no período',
};

export const DRILL_PANEL_ACCENT = {
  newLeads: 'accent',
  scheduled: 'warning',
  showed: 'success',
  completed: 'success',
  missed: 'danger',
  converted: 'purple',
};

export const HIGHLIGHT_BY_COLOR = {
  accent: 'default',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
  purple: 'default',
};

export function pctVar(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

export function trendHintFor(metricKey, presetKey) {
  if (metricKey === 'conversionRate') {
    return 'Taxa do período atual vs período anterior (mesma duração).';
  }
  if (presetKey === 'today') {
    return 'Comparado com o dia anterior.';
  }
  if (presetKey === 'week') {
    return 'Comparado com a semana anterior (mesma duração).';
  }
  if (presetKey === 'month' || presetKey === 'last_month') {
    return 'Comparado com o mês civil anterior.';
  }
  return 'Comparado com o intervalo imediatamente anterior de mesma duração.';
}

export function buildFunnelStages(reportData, terms, contactsPlural) {
  if (!reportData?.metrics) return [];
  const m = reportData.metrics;
  const newLeadsCurrent = Number(m.newLeads?.current || 0);
  const safeBase = Math.max(newLeadsCurrent, 1);
  const scheduledCurrent = Number(m.scheduled?.current || 0);
  const completedCurrent = Number(m.completed?.current ?? m.showed?.current ?? 0);
  const missedCurrent = Number(m.missed?.current || 0);
  const convertedCurrent = Number(m.converted?.current || 0);
  const conversionCurrent = Number(m.conversionRate?.current || 0);
  const scheduledPrev = Number(m.scheduled?.previous || 0);
  const completedPrev = Number(m.completed?.previous ?? m.showed?.previous ?? 0);
  const missedPrev = Number(m.missed?.previous || 0);
  const convertedPrev = Number(m.converted?.previous || 0);
  const conversionPrev = Number(m.conversionRate?.previous || 0);
  const newLeadsLabel = `Novos ${String(contactsPlural || 'leads').toLowerCase()}`;
  const stageRows = [
    {
      key: 'newLeads',
      label: newLeadsLabel,
      current: newLeadsCurrent,
      previous: Number(m.newLeads?.previous || 0),
      drillKey: 'newLeads',
      prevBase: newLeadsCurrent,
      color: 'var(--color-primary)',
    },
    {
      key: 'scheduled',
      label: 'Agendados',
      current: scheduledCurrent,
      previous: scheduledPrev,
      drillKey: 'scheduled',
      prevBase: newLeadsCurrent,
      color: 'var(--color-primary-light)',
    },
    {
      key: 'completed',
      label: 'Compareceram',
      current: completedCurrent,
      previous: completedPrev,
      drillKey: 'completed',
      prevBase: scheduledCurrent,
      color: 'var(--color-accent)',
    },
    {
      key: 'missed',
      label: 'Não compareceram',
      current: missedCurrent,
      previous: missedPrev,
      drillKey: 'missed',
      prevBase: scheduledCurrent,
      color: 'var(--danger)',
    },
    {
      key: 'converted',
      label: terms.reportsMetricConvertedShort,
      current: convertedCurrent,
      previous: convertedPrev,
      drillKey: 'converted',
      prevBase: completedCurrent,
      color: 'var(--color-primary-dark)',
    },
    {
      key: 'conversionRate',
      label: 'Conversão total',
      current: conversionCurrent,
      previous: conversionPrev,
      drillKey: null,
      prevBase: 100,
      color: 'var(--color-text-primary)',
      isPercent: true,
    },
  ];
  return stageRows.map((s, index) => {
    const variation = pctVar(s.current, s.previous);
    const relativeBase = s.isPercent ? 100 : Math.max(Number(s.prevBase || 0), 1);
    const relativePct = Math.max(0, Math.round((Number(s.current || 0) / relativeBase) * 100));
    const barPct = s.isPercent
      ? Math.min(100, Math.max(0, s.current))
      : Math.min(100, Math.round((Number(s.current || 0) / safeBase) * 100));
    return { ...s, variation, relativePct, barPct, isLast: index === stageRows.length - 1 };
  });
}
