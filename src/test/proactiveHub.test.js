import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTasksDueHubLabel,
  buildProactiveHubItems,
  countTasksDueHub,
  filterTasksDueHub,
} from '../lib/proactiveHub.js';

describe('buildTasksDueHubLabel', () => {
  it('todas vencem hoje', () => {
    expect(buildTasksDueHubLabel(0, 1)).toBe('1 tarefa vence hoje');
    expect(buildTasksDueHubLabel(0, 3)).toBe('3 tarefas vencem hoje');
  });

  it('todas vencidas', () => {
    expect(buildTasksDueHubLabel(1, 0)).toBe('1 tarefa vencida');
    expect(buildTasksDueHubLabel(2, 0)).toBe('2 tarefas vencidas');
  });

  it('mix vencidas e hoje', () => {
    expect(buildTasksDueHubLabel(1, 1)).toBe(
      '2 tarefas pendentes — vencidas ou vencem hoje'
    );
  });
});

describe('countTasksDueHub', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('separa vencida, hoje e ignora concluídas', () => {
    const tasks = [
      { status: 'pending', due_date: '2026-06-14' },
      { status: 'pending', due_date: '2026-06-15' },
      { status: 'done', due_date: '2026-06-14' },
      { status: 'pending', due_date: '2026-06-20' },
    ];
    expect(countTasksDueHub(tasks)).toEqual({ overdue: 1, dueToday: 1, total: 2 });
  });
});

describe('filterTasksDueHub', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna vencidas antes de hoje', () => {
    const tasks = [
      { id: 'today', status: 'pending', due_date: '2026-06-15' },
      { id: 'late', status: 'pending', due_date: '2026-06-10' },
      { id: 'done', status: 'done', due_date: '2026-06-10' },
    ];
    expect(filterTasksDueHub(tasks).map((t) => t.id)).toEqual(['late', 'today']);
  });
});

describe('buildProactiveHubItems', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa label vencida para tarefa de ontem', () => {
    const items = buildProactiveHubItems({
      tasks: [{ status: 'pending', due_date: '2026-06-14' }],
      leads: [],
      modules: {},
    });
    expect(items[0].label).toBe('1 tarefa vencida');
    expect(items[0].href).toBe('/tarefas?status=vencidas');
  });

  it('usa label vence hoje para tarefa de hoje', () => {
    const items = buildProactiveHubItems({
      tasks: [{ status: 'pending', due_date: '2026-06-15' }],
      leads: [],
      modules: {},
    });
    expect(items[0].label).toBe('1 tarefa vence hoje');
    expect(items[0].href).toBe('/tarefas?status=pendentes&period=today');
  });
});
