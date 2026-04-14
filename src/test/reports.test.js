import { describe, it, expect } from 'vitest';
import {
  buildWeekBuckets,
  isRealLead,
  inRange,
  inRangeYmd,
  countsAsConvertedInPeriod
} from '../../lib/reportsMetrics.js';
import { hasAnyActivity } from '../lib/reportActivity.js';

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
    const n = leads.filter((l) => isRealLead(l) && l.missed_at && inRange(l.missed_at, from, to)).length;
    expect(n).toBe(1);
  });

  it('não conta leads sem missed_at', () => {
    const leads = makeLeads([{ missed_at: null }]);
    const n = leads.filter((l) => isRealLead(l) && l.missed_at && inRange(l.missed_at, from, to)).length;
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

  it('conta aluno atualizado no período (fallback)', () => {
    const l = makeLeads([
      {
        contact_type: 'student',
        converted_at: null,
        $updatedAt: '2026-04-10T00:00:00.000Z'
      }
    ])[0];
    expect(countsAsConvertedInPeriod(l, from, to)).toBe(true);
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
});
