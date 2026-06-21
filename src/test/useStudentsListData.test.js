import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { STUDENT_STATUS } from '../lib/studentStatus.js';

const studentsListDataMocks = vi.hoisted(() => {
  const storeState = {
    studentIds: ['s1'],
    studentsById: {
      s1: {
        id: 's1',
        name: 'Ana',
        phone: '11999990001',
      },
    },
    fetchStudents: vi.fn(),
    fetchMoreStudents: vi.fn(),
    mergeStudent: vi.fn(),
    loading: false,
    loadingMore: false,
    studentsHasMore: false,
    studentsTotal: 1,
    lastFetchedAt: Date.now(),
    lastFetchOpts: {
      search: 'Ana',
      studentStatus: 'active',
    },
  };

  return {
    storeState,
    addToast: vi.fn(),
    onListScroll: vi.fn(),
    getVirtualItems: vi.fn(() => []),
    getTotalSize: vi.fn(() => 0),
    measureElement: vi.fn(),
  };
});

vi.mock('../store/useStudentStore', () => {
  const useStudentStore = (selector) => selector(studentsListDataMocks.storeState);
  useStudentStore.getState = () => studentsListDataMocks.storeState;
  return { useStudentStore };
});

vi.mock('../store/useUiStore', () => ({
  useUiStore: (selector) => selector({ addToast: studentsListDataMocks.addToast }),
}));

vi.mock('../hooks/useStudentsListScrollLoadMore.js', () => ({
  useStudentsListScrollLoadMore: () => ({
    onListScroll: studentsListDataMocks.onListScroll,
  }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: studentsListDataMocks.getVirtualItems,
    getTotalSize: studentsListDataMocks.getTotalSize,
    measureElement: studentsListDataMocks.measureElement,
  }),
}));

vi.mock('../lib/studentsApi.js', () => ({
  apiFindStudentsByPhone: vi.fn().mockResolvedValue([]),
}));

describe('useStudentsListData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    studentsListDataMocks.storeState.studentIds = ['s1'];
    studentsListDataMocks.storeState.studentsById = {
      s1: { id: 's1', name: 'Ana', phone: '11999990001' },
    };
    studentsListDataMocks.storeState.loading = false;
    studentsListDataMocks.storeState.loadingMore = false;
    studentsListDataMocks.storeState.studentsHasMore = false;
    studentsListDataMocks.storeState.studentsTotal = 1;
    studentsListDataMocks.storeState.lastFetchedAt = Date.now();
    studentsListDataMocks.storeState.lastFetchOpts = {
      search: 'Ana',
      studentStatus: 'active',
    };
  });

  it('refaz a busca sem filtros ao montar quando o cache atual veio de uma busca anterior', async () => {
    const { useStudentsListData } = await import('../hooks/useStudentsListData.js');

    renderHook(() =>
      useStudentsListData({
        academyId: 'acad-1',
        filterState: {
          debouncedSearch: '',
          filtroOrigem: 'Todas',
          filtroTurma: 'Todas',
          filtroPlano: 'Todos',
          showInactive: false,
          ordenacao: 'az',
        },
        serverFetchOpts: {
          search: undefined,
          plan: undefined,
          turma: undefined,
          turmaEmpty: undefined,
          origin: undefined,
          studentStatus: STUDENT_STATUS.ACTIVE,
        },
        hasServerFilters: false,
        serverSearchActive: false,
        studentPlural: 'Alunos',
        listScrollRef: { current: null },
      })
    );

    await waitFor(() => {
      expect(studentsListDataMocks.storeState.fetchStudents).toHaveBeenCalledWith({
        reset: true,
        search: undefined,
        plan: undefined,
        turma: undefined,
        turmaEmpty: undefined,
        origin: undefined,
        studentStatus: STUDENT_STATUS.ACTIVE,
      });
    });
  });
});
