import { describe, it, expect } from 'vitest';
import {
  buildWeekBuckets,
  isRealLead,
  inRange,
  inRangeYmd,
  countsAsConvertedInPeriod,
  countsAsNewStudentInPeriod,
  countsAsMissedExperimentalInPeriod
} from '../../lib/reportsMetrics.js';
import { hasAnyActivity } from '../lib/reportActivity.js';
import { buildFunnelStages } from '../lib/reportsFunnelUtils.js';
import { reportKpiTooltip } from '../lib/reportKpiTooltip.js';
import { evaluateKpiRag, parseReportsKpiGoals } from '../../lib/reportsKpiGoals.js';
import { getDefaultReportTab, getReportsTabFlags, normalizeReportTabParam } from '../lib/reportsPageConfig.js';
import { activeStudentsCount, buildStudentChartRanges } from '../lib/reportsStudentMetricsApi.js';
import { aggregateStudentMetricsOnly } from '../../lib/server/reportsAggregate.js';
import { LEAD_STATUS } from '../store/useLeadStore.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const makeLeads = (overrides = []) =>
  overrides.map((o, i) => ({
    $id: `lead-${i}`,
    academyId: 'academy-1',
    origin: 'WhatsApp',
    contact_type: 'lead',
    attended_at: null,
    missed_at: null,
    converted_at: null,
    scheduledDate: null,
    $createdAt: '2026-01-01T00:00:00.000Z',
    $updatedAt: '2026-01-01T00:00:00.000Z',
    ...o
  }));

describe('relatório — Compareceram', () => {
  const from = '2026-04-01T00:00:00.000Z';
  const to = '2026-04-30T23:59:59.999Z';

  it('conta leads com attended_at no período', () => {
    const leads = makeLeads([
      { attended_at: '2026-04-10T12:00:00.000Z' },
      { attended_at: '2026-04-15T12:00:00.000Z' }
    ]);
    const n = leads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, from, to)).length;
    expect(n).toBe(2);
  });

  it('não conta leads com attended_at fora do período', () => {
    const leads = makeLeads([{ attended_at: '2026-03-01T12:00:00.000Z' }]);
    const n = leads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, from, to)).length;
    expect(n).toBe(0);
  });

  it('não conta leads sem attended_at', () => {
    const leads = makeLeads([{ attended_at: null }]);
    const n = leads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, from, to)).length;
    expect(n).toBe(0);
  });

  it('não conta leads importados de planilha', () => {
    const leads = makeLeads([{ origin: 'Planilha', attended_at: '2026-04-10T12:00:00.000Z' }]);
    const n = leads.filter((l) => isRealLead(l) && l.attended_at && inRange(l.attended_at, from, to)).length;
    expect(n).toBe(0);
  });
});

describe('relatório — Não compareceram', () => {
  const from = '2026-04-01T00:00:00.000Z';
  const to = '2026-04-30T23:59:59.999Z';

  it('conta leads com missed_at no período', () => {
    const leads = makeLeads([{ missed_at: '2026-04-12T10:00:00.000Z' }]);
    const n = leads.filter((l) => countsAsMissedExperimentalInPeriod(l, from, to)).length;
    expect(n).toBe(1);
  });

  it('conta fallback legado por status MISSED com scheduledDate no período', () => {
    const leads = makeLeads([{ status: LEAD_STATUS.MISSED, scheduledDate: '2026-04-18', missed_at: null }]);
    const n = leads.filter((l) => countsAsMissedExperimentalInPeriod(l, from, to)).length;
    expect(n).toBe(1);
  });

  it('não conta status MISSED sem data de aula no período (fallback)', () => {
    const leads = makeLeads([{ status: LEAD_STATUS.MISSED, scheduledDate: '2026-03-28', missed_at: null }]);
    const n = leads.filter((l) => countsAsMissedExperimentalInPeriod(l, from, to)).length;
    expect(n).toBe(0);
  });

  it('não conta leads sem missed_at e sem fallback válido', () => {
    const leads = makeLeads([{ missed_at: null }]);
    const n = leads.filter((l) => countsAsMissedExperimentalInPeriod(l, from, to)).length;
    expect(n).toBe(0);
  });
});

describe('relatório — Aulas agendadas', () => {
  const from = '2026-04-01T00:00:00.000Z';
  const to = '2026-04-30T23:59:59.999Z';

  it('conta leads com scheduledDate no período', () => {
    const leads = makeLeads([{ scheduledDate: '2026-04-20' }]);
    const n = leads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, from, to)).length;
    expect(n).toBe(1);
  });

  it('não conta leads com scheduledDate fora do período', () => {
    const leads = makeLeads([{ scheduledDate: '2026-05-01' }]);
    const n = leads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, from, to)).length;
    expect(n).toBe(0);
  });

  it('lida com formato YYYY-MM-DD corretamente', () => {
    expect(inRangeYmd('2026-04-14', from, to)).toBe(true);
  });

  it('não quebra com scheduledDate null', () => {
    const leads = makeLeads([{ scheduledDate: null }]);
    const n = leads.filter((l) => isRealLead(l) && inRangeYmd(l.scheduledDate, from, to)).length;
    expect(n).toBe(0);
  });
});

describe('relatório — convertidos (countsAsConvertedInPeriod)', () => {
  const from = '2026-04-01T00:00:00.000Z';
  const to = '2026-04-30T23:59:59.999Z';

  it('conta por converted_at no período', () => {
    const l = makeLeads([{ converted_at: '2026-04-18T00:00:00.000Z' }])[0];
    expect(countsAsConvertedInPeriod(l, from, to)).toBe(true);
  });

  it('não conta aluno só por $updatedAt sem converted_at', () => {
    const l = makeLeads([
      {
        contact_type: 'student',
        converted_at: null,
        $updatedAt: '2026-04-10T00:00:00.000Z',
      },
    ])[0];
    expect(countsAsNewStudentInPeriod(l, from, to)).toBe(false);
    expect(countsAsConvertedInPeriod(l, from, to)).toBe(false);
  });
});

describe('relatório — gráfico (buildWeekBuckets)', () => {
  it('gera buckets para período de 30 dias', () => {
    const from = '2026-04-01T00:00:00.000Z';
    const to = '2026-04-30T23:59:59.999Z';
    const buckets = buildWeekBuckets(from, to);
    expect(buckets.length).toBeGreaterThan(0);
  });

  it('não retorna array vazio para período válido', () => {
    const buckets = buildWeekBuckets('2026-01-01T00:00:00.000Z', '2026-01-31T23:59:59.999Z');
    expect(Array.isArray(buckets)).toBe(true);
    expect(buckets.length >= 1).toBe(true);
  });

  it('toEnd como string ISO não quebra o while loop', () => {
    const buckets = buildWeekBuckets('2026-06-01T00:00:00.000Z', '2026-06-15T23:59:59.999Z');
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.every((b) => b.start instanceof Date && b.end instanceof Date)).toBe(true);
  });
});

describe('hasAnyActivity', () => {
  it('retorna true quando há leads no período', () => {
    const reportData = {
      metrics: {
        newLeads: { current: 0, previous: 0, list: [] },
        completed: { current: 3, previous: 0, list: [] }
      }
    };
    expect(hasAnyActivity(reportData)).toBe(true);
  });

  it('retorna false quando não há dados', () => {
    expect(hasAnyActivity(null)).toBe(false);
    expect(hasAnyActivity({ metrics: {} })).toBe(false);
  });

  it('usa m.current, não m.cur', () => {
    const reportData = {
      metrics: {
        x: { cur: 5, current: 0 }
      }
    };
    expect(hasAnyActivity(reportData)).toBe(false);
  });

  it('não considera studentMetrics — empty de funil é só para abas visão/funil', () => {
    const reportData = {
      metrics: {
        newLeads: { current: 0, previous: 0 },
        scheduled: { current: 0, previous: 0 },
      },
      studentMetrics: { activeAtStart: 12, newStudents: 2 },
    };
    expect(hasAnyActivity(reportData)).toBe(false);
  });
});

describe('reportsKpiGoals', () => {
  it('avalia RAG para meta higher-is-better', () => {
    const goal = { target: 25, direction: 'higher' };
    expect(evaluateKpiRag(30, goal)).toBe('ok');
    expect(evaluateKpiRag(22, goal)).toBe('warn');
    expect(evaluateKpiRag(18, goal)).toBe('critical');
  });

  it('avalia RAG para meta lower-is-better', () => {
    const goal = { target: 5, direction: 'lower' };
    expect(evaluateKpiRag(3, goal)).toBe('ok');
    expect(evaluateKpiRag(6, goal)).toBe('warn');
    expect(evaluateKpiRag(8, goal)).toBe('critical');
  });

  it('parseia metas de academy.settings', () => {
    const settings = JSON.stringify({
      reportsKpiGoals: {
        conversionRate: { target: 30, direction: 'higher' },
        churnRate: { target: 4, direction: 'lower' },
      },
    });
    const goals = parseReportsKpiGoals(settings);
    expect(goals.conversionRate.target).toBe(30);
    expect(goals.churnRate.target).toBe(4);
  });
});

describe('getDefaultReportTab', () => {
  it('retorna funil como primeira aba padrão', () => {
    expect(getDefaultReportTab({ hasFinance: true, hasSales: true, hasInventory: true })).toBe('funil');
  });
});

describe('buildStudentChartRanges', () => {
  it('gera buckets dentro do intervalo selecionado', () => {
    const ranges = buildStudentChartRanges('2026-04-01', '2026-04-30');
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0].from).toBe('2026-04-01');
    expect(ranges[ranges.length - 1].to).toBe('2026-04-30');
  });
});

describe('activeStudentsCount', () => {
  it('usa activeAtEnd como critério canônico', () => {
    expect(activeStudentsCount({ activeAtEnd: 15, activeAtStart: 10 })).toBe(15);
    expect(activeStudentsCount({ activeAtStart: 10, newStudents: 2, deactivations: 1 })).toBe(11);
  });
});

describe('normalizeReportTabParam', () => {
  it('mapeia aliases legados para slugs canônicos', () => {
    expect(normalizeReportTabParam('vendas')).toBe('loja');
    expect(normalizeReportTabParam('movimentacoes')).toBe('estoque');
    expect(normalizeReportTabParam('loja')).toBe('loja');
    expect(normalizeReportTabParam('')).toBeNull();
    expect(normalizeReportTabParam('visao-geral')).toBeNull();
  });
});

describe('getReportsTabFlags', () => {
  it('separa funil e métricas de alunos', () => {
    expect(getReportsTabFlags('alunos')).toEqual({
      isLeadReportTab: false,
      needsFunnelReport: false,
      needsStudentMetrics: true,
      isPeriodTab: true,
    });
    expect(getReportsTabFlags('funil').isLeadReportTab).toBe(true);
    expect(getReportsTabFlags('funil').needsFunnelReport).toBe(true);
    expect(getReportsTabFlags('funil').needsStudentMetrics).toBe(false);
    expect(getReportsTabFlags('loja').isLeadReportTab).toBe(false);
  });
});

describe('aggregateStudentMetricsOnly', () => {
  it('retorna apenas studentMetrics sem listas do funil', () => {
    const leads = makeLeads([
      { contact_type: 'student', converted_at: '2026-04-10T12:00:00.000Z', status: 'active' },
    ]);
    const out = aggregateStudentMetricsOnly(leads, {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.999Z',
      prevFrom: '2026-03-01T00:00:00.000Z',
      prevTo: '2026-03-31T23:59:59.999Z',
    });
    expect(out.studentMetrics).toBeDefined();
    expect(out.metrics).toBeUndefined();
    expect(out.chart).toBeUndefined();
  });
});

describe('reportKpiTooltip', () => {
  it('inclui definição canônica e nota de período', () => {
    const tip = reportKpiTooltip('newLeads', { preset: 'month' });
    expect(tip).toContain('Novos leads');
    expect(tip).toContain('mês civil anterior');
  });

  it('mapeia converted para newStudents', () => {
    const tip = reportKpiTooltip('converted', { preset: 'week' });
    expect(tip).toContain('Novos alunos');
    expect(tip).toContain('semana anterior');
  });
});

describe('buildFunnelStages', () => {
  const terms = {
    reportsMetricConvertedShort: 'Matrículas',
    reportsClosureRateInsight: '{converted} de {completed} compareceram fecharam',
  };

  it('usa contactsPlural na etapa de novos leads', () => {
    const reportData = {
      metrics: {
        newLeads: { current: 5, previous: 3 },
        scheduled: { current: 2, previous: 1 },
        completed: { current: 1, previous: 0 },
        missed: { current: 1, previous: 0 },
        converted: { current: 1, previous: 0 },
        conversionRate: { current: 20, previous: 10 },
      },
    };
    const stages = buildFunnelStages(reportData, terms, 'Contatos');
    expect(stages[0].label).toBe('Novos contatos');
    expect(stages.find((s) => s.key === 'missed')?.label).toBe('Não compareceram');
    expect(stages.find((s) => s.key === 'converted')?.label).toBe('Matrículas');
  });
});

describe('ReportsFinancePanel', () => {
  it('não embute ReportsTab para owner', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/reports/ReportsFinancePanel.jsx'), 'utf8');
    expect(src).not.toMatch(/ReportsTab/);
    expect(src).not.toMatch(/useAccountingStore/);
  });
});
