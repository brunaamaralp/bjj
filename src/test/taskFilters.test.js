import { describe, it, expect } from 'vitest';
import { Query } from 'node-appwrite';
import { buildTasksListQueries, localTodayYmd } from '../../lib/server/tasksListQueries.js';
import {
  uiFilterToApiParams,
  serverTaskFilters,
  buildTasksFetchKey,
} from '../store/useTaskStore.js';

describe('uiFilterToApiParams', () => {
  it('pendentes → status=pending', () => {
    expect(uiFilterToApiParams('pendentes')).toEqual({ status: 'pending' });
  });

  it('concluidas → status=done', () => {
    expect(uiFilterToApiParams('concluidas')).toEqual({ status: 'done' });
  });

  it('minhas → assigned_to=userId, sem status', () => {
    expect(uiFilterToApiParams('minhas', 'user-42')).toEqual({ assigned_to: 'user-42' });
  });

  it('vencidas → overdue=1, sem status no client', () => {
    expect(uiFilterToApiParams('vencidas')).toEqual({ overdue: '1' });
  });

  it('all → sem parâmetros extras', () => {
    expect(uiFilterToApiParams('all')).toEqual({});
    expect(uiFilterToApiParams('')).toEqual({});
  });
});

describe('serverTaskFilters', () => {
  it('propaga lead_id e mapeia chip vencidas', () => {
    expect(serverTaskFilters({ status: 'vencidas', lead_id: 'lead-1' }, 'u1')).toMatchObject({
      uiStatus: 'vencidas',
      overdue: '1',
      lead_id: 'lead-1',
      status: null,
    });
  });
});

describe('buildTasksFetchKey', () => {
  it('inclui uiStatus e overdue para disparar refetch', () => {
    const keyA = buildTasksFetchKey('acad', serverTaskFilters({ status: 'vencidas' }, 'u1'));
    const keyB = buildTasksFetchKey('acad', serverTaskFilters({ status: 'pendentes' }, 'u1'));
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain('vencidas');
    expect(keyA.endsWith('|1')).toBe(true);
  });
});

describe('buildTasksListQueries', () => {
  const TODAY = '2026-06-15';

  it('API recebe overdue=1 e aplica due_date < hoje', () => {
    const queries = buildTasksListQueries({
      academyId: 'acad-a',
      overdue: true,
      todayYmd: TODAY,
    });
    expect(queries).toContainEqual(Query.lessThan('due_date', TODAY));
  });

  it('API recebe overdue=1 e aplica status=pending', () => {
    const queries = buildTasksListQueries({
      academyId: 'acad-a',
      overdue: true,
      todayYmd: TODAY,
    });
    expect(queries).toContainEqual(Query.equal('status', ['pending']));
  });

  it('paginação cursor mantém filtro overdue=1', () => {
    const queries = buildTasksListQueries({
      academyId: 'acad-a',
      overdue: true,
      cursor: 'task-cursor-id',
      todayYmd: TODAY,
    });
    expect(queries).toContainEqual(Query.lessThan('due_date', TODAY));
    expect(queries).toContainEqual(Query.equal('status', ['pending']));
    expect(queries).toContainEqual(Query.cursorAfter('task-cursor-id'));
  });

  it('pendentes aplica status=pending sem overdue', () => {
    const queries = buildTasksListQueries({
      academyId: 'acad-a',
      status: 'pending',
    });
    expect(queries).toContainEqual(Query.equal('status', ['pending']));
    expect(queries.some((q) => String(q).includes('lessThan'))).toBe(false);
  });

  it('minhas aplica assigned_to', () => {
    const queries = buildTasksListQueries({
      academyId: 'acad-a',
      assignedTo: 'user-99',
    });
    expect(queries).toContainEqual(Query.equal('assigned_to', ['user-99']));
  });
});

describe('localTodayYmd', () => {
  it('retorna YYYY-MM-DD local', () => {
    const ymd = localTodayYmd(new Date('2026-06-15T15:30:00'));
    expect(ymd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
