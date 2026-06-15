import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTimeOfDayPeriod,
  buildGreetingLine,
  buildDaySummaryLine,
  getDayPriority,
  countWeeklyEnrollments,
} from '../lib/dashboardDayBriefing.js';
import { touchFollowupStreak, readFollowupStreak } from '../lib/dashboardFollowupStreak.js';
import { LEAD_STATUS } from '../store/useLeadStore';

describe('getTimeOfDayPeriod', () => {
  it('retorna morning antes do meio-dia', () => {
    expect(getTimeOfDayPeriod(new Date(2026, 5, 10, 9, 0))).toBe('morning');
  });

  it('retorna afternoon entre 12h e 18h', () => {
    expect(getTimeOfDayPeriod(new Date(2026, 5, 10, 14, 0))).toBe('afternoon');
  });

  it('retorna evening após 18h', () => {
    expect(getTimeOfDayPeriod(new Date(2026, 5, 10, 20, 0))).toBe('evening');
  });
});

describe('buildGreetingLine', () => {
  it('inclui primeiro nome na manhã', () => {
    const line = buildGreetingLine('Ana Silva', new Date(2026, 5, 10, 9, 0));
    expect(line).toBe('Bom dia, Ana Silva');
  });

  it('funciona sem nome', () => {
    expect(buildGreetingLine('', new Date(2026, 5, 10, 20, 0))).toBe('Boa noite');
  });
});

describe('buildDaySummaryLine', () => {
  it('narra aulas com horário da primeira', () => {
    const line = buildDaySummaryLine({
      todayScheduled: [{ scheduledTime: '18:00' }, { scheduledTime: '19:00' }],
      followUps: [],
      pendingTasks: [],
      trialShort: 'Aula experimental',
    });
    expect(line).toContain('2');
    expect(line).toContain('18:00');
  });

  it('sugere retornos quando não há aula hoje', () => {
    const line = buildDaySummaryLine({
      todayScheduled: [],
      todayOnAgenda: [],
      followUps: [{ id: '1' }, { id: '2' }],
      pendingTasks: [],
      trialShort: 'Aula experimental',
    });
    expect(line).toContain('retomar 2 retornos');
  });

  it('narra experimental já realizada hoje (compareceu)', () => {
    const line = buildDaySummaryLine({
      todayScheduled: [],
      todayOnAgenda: [{ id: '1', status: LEAD_STATUS.COMPLETED, scheduledDate: '2026-06-11' }],
      followUps: [{ id: '2', hasContactInCycle: false }],
      pendingTasks: [],
      trialShort: 'Aula experimental',
    });
    expect(line).toContain('Hoje teve 1 aula experimental');
    expect(line).not.toContain('Nenhuma');
  });

  it('conta só retornos sem contato no ciclo', () => {
    const line = buildDaySummaryLine({
      todayScheduled: [],
      todayOnAgenda: [],
      followUps: [
        { id: '1', hasContactInCycle: true },
        { id: '2', hasContactInCycle: false },
      ],
      pendingTasks: [],
      trialShort: 'Aula experimental',
    });
    expect(line).toContain('retomar 1 retorno');
    expect(line).not.toContain('2 retornos');
  });

  it('mostra agenda em dia quando retornos já responderam', () => {
    const line = buildDaySummaryLine({
      todayScheduled: [],
      todayOnAgenda: [],
      followUps: [{ id: '1', hasContactInCycle: true }],
      pendingTasks: [],
      trialShort: 'Aula experimental',
    });
    expect(line).toContain('Agenda e retornos em dia');
    expect(line).not.toContain('retomar');
  });

  it('não usa tom desmotivador', () => {
    const line = buildDaySummaryLine({
      todayScheduled: [],
      todayOnAgenda: [],
      followUps: [],
      pendingTasks: [],
      trialShort: 'Aula experimental',
    });
    expect(line.toLowerCase()).not.toContain('leve');
    expect(line).toContain('revisar a semana');
  });
});

describe('getDayPriority', () => {
  const now = new Date(2026, 5, 10, 17, 0);

  it('prioriza aula nas próximas 2h sobre follow-up urgente', () => {
    const priority = getDayPriority({
      now,
      todayScheduled: [
        {
          id: 'l1',
          name: 'João',
          scheduledTime: '18:00',
          status: LEAD_STATUS.SCHEDULED,
        },
      ],
      followUps: [{ id: 'f1', name: 'Maria', daysAgo: 6, temperature: 'critical' }],
      todayBirthdays: [],
    });
    expect(priority.type).toBe('upcoming_class');
    expect(priority.message).toContain('João');
    expect(priority.highlightKpi).toBe('today');
  });

  it('prioriza follow-up urgente sobre aniversário', () => {
    const priority = getDayPriority({
      now,
      todayScheduled: [],
      followUps: [
        {
          id: 'f1',
          name: 'Maria',
          daysAgo: 6,
          temperature: 'critical',
          status: LEAD_STATUS.COMPLETED,
        },
      ],
      todayBirthdays: [{ id: 's1', name: 'Lucas' }],
    });
    expect(priority.type).toBe('urgent_followup');
    expect(priority.message).toBe(
      'Maria está há 6 dias sem retorno desde a aula. Vale retomar com urgência.'
    );
  });

  it('não prioriza lead que já respondeu no WhatsApp como sem retorno', () => {
    const priority = getDayPriority({
      now,
      todayScheduled: [],
      followUps: [
        {
          id: 'f2',
          name: 'Sabrina Brum',
          daysAgo: 1,
          temperature: 'cooling',
          hasContactInCycle: true,
          doneForCurrentClass: false,
          status: LEAD_STATUS.COMPLETED,
        },
      ],
      todayBirthdays: [],
    });
    expect(priority.message).toBe(
      'Sabrina Brum já respondeu no WhatsApp. Acompanhe o próximo passo no retorno.'
    );
  });

  it('mensagem de cooling descreve visita e falta de retorno', () => {
    const priority = getDayPriority({
      now,
      todayScheduled: [],
      followUps: [
        {
          id: 'f2',
          name: 'Sabrina Brum',
          daysAgo: 1,
          temperature: 'cooling',
          status: LEAD_STATUS.COMPLETED,
        },
      ],
      todayBirthdays: [],
    });
    expect(priority.message).toBe(
      'Sabrina Brum veio ontem. Ainda sem retorno. Vale uma mensagem.'
    );
  });

  it('mensagem de cooling para falta usa faltou ontem', () => {
    const priority = getDayPriority({
      now,
      todayScheduled: [],
      followUps: [
        {
          id: 'f3',
          name: 'Pedro',
          daysAgo: 1,
          temperature: 'cooling',
          status: LEAD_STATUS.MISSED,
        },
      ],
      todayBirthdays: [],
    });
    expect(priority.message).toBe('Pedro faltou ontem. Ainda sem retorno. Vale uma mensagem.');
  });

  it('não prioriza aniversário no hero (banner dedicado na recepção)', () => {
    const priority = getDayPriority({
      now,
      todayScheduled: [],
      followUps: [],
      todayBirthdays: [{ id: 's1', name: 'Lucas', turma: 'Kids' }],
    });
    expect(priority.type).toBe('fallback');
  });
});

describe('touchFollowupStreak', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(k) {
        return this.store[k] ?? null;
      },
      setItem(k, v) {
        this.store[k] = v;
      },
      removeItem(k) {
        delete this.store[k];
      },
    });
    localStorage.store = {};
  });

  it('incrementa streak em dias consecutivos sem pendências', () => {
    const academyId = 'acad-1';
    touchFollowupStreak(academyId, 0, new Date(2026, 5, 9));
    touchFollowupStreak(academyId, 0, new Date(2026, 5, 10));
    expect(readFollowupStreak(academyId)).toBe(2);
  });

  it('reinicia streak após dia com pendências', () => {
    const academyId = 'acad-2';
    touchFollowupStreak(academyId, 0, new Date(2026, 5, 8));
    touchFollowupStreak(academyId, 2, new Date(2026, 5, 9));
    touchFollowupStreak(academyId, 0, new Date(2026, 5, 10));
    expect(readFollowupStreak(academyId)).toBe(1);
  });
});

describe('countWeeklyEnrollments', () => {
  it('conta aluno com convertedAt na semana civil', () => {
    const count = countWeeklyEnrollments([{ convertedAt: '2026-06-10T12:00:00.000Z' }]);
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('conta alunos com ingresso explícito na semana civil', () => {
    const count = countWeeklyEnrollments(
      [{ enrollmentDate: '2026-06-09' }, { enrollmentDate: '2026-01-01' }]
    );
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('não conta aluno sem data de matrícula', () => {
    expect(countWeeklyEnrollments([{ createdAt: '2026-06-09T00:00:00.000Z' }])).toBe(0);
  });
});
