import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  students: [],
  studentsHasMore: false,
  studentsTotal: null,
  lastFetchOpts: {},
  loading: false,
  loadingMore: false,
  fetchStudents: vi.fn(),
  fetchMoreStudents: vi.fn(),
  appendStudentsPage: vi.fn(),
  markStudentsFullyLoaded: vi.fn(),
}));

const listMocks = vi.hoisted(() => ({
  fetchStudentsList: vi.fn(),
}));

vi.mock('../store/useStudentStore.js', () => ({
  STUDENTS_PAGE_SIZE: 200,
  useStudentStore: {
    getState: () => ({
      students: storeMocks.students,
      studentsHasMore: storeMocks.studentsHasMore,
      studentsTotal: storeMocks.studentsTotal,
      lastFetchOpts: storeMocks.lastFetchOpts,
      loading: storeMocks.loading,
      loadingMore: storeMocks.loadingMore,
      fetchStudents: storeMocks.fetchStudents,
      fetchMoreStudents: storeMocks.fetchMoreStudents,
      appendStudentsPage: (...args) => {
        storeMocks.appendStudentsPage(...args);
        const items = args[0] || [];
        storeMocks.students = [...storeMocks.students, ...items];
      },
      markStudentsFullyLoaded: () => {
        storeMocks.markStudentsFullyLoaded();
        storeMocks.studentsHasMore = false;
      },
    }),
  },
}));

vi.mock('../lib/studentsApi.js', () => ({
  fetchStudentsList: (...args) => listMocks.fetchStudentsList(...args),
}));

import {
  didLastFetchUseSubsetFilters,
  ensureAllStudentsLoaded,
} from '../lib/ensureAllStudentsLoaded.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';

describe('didLastFetchUseSubsetFilters', () => {
  it('detects search and inactive-only fetches', () => {
    expect(didLastFetchUseSubsetFilters({ search: 'ana' })).toBe(true);
    expect(didLastFetchUseSubsetFilters({ studentStatus: STUDENT_STATUS.INACTIVE })).toBe(true);
    expect(didLastFetchUseSubsetFilters({})).toBe(false);
  });
});

describe('ensureAllStudentsLoaded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.students = [{ id: 's1' }];
    storeMocks.studentsHasMore = true;
    storeMocks.studentsTotal = null;
    storeMocks.lastFetchOpts = {};
    storeMocks.loading = false;
    storeMocks.loadingMore = false;
    storeMocks.fetchStudents.mockResolvedValue(undefined);
    storeMocks.fetchMoreStudents.mockImplementation(async () => {
      storeMocks.studentsHasMore = false;
      storeMocks.students.push({ id: 's2' });
    });
    listMocks.fetchStudentsList.mockResolvedValue({ items: [], next_cursor: null, total: null });
  });

  it('loads additional pages while studentsHasMore (sequential when total unknown)', async () => {
    const out = await ensureAllStudentsLoaded();
    expect(storeMocks.fetchMoreStudents).toHaveBeenCalled();
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it('resets store when previous fetch used list filters', async () => {
    storeMocks.lastFetchOpts = { search: 'joao' };
    storeMocks.studentsHasMore = false;
    await ensureAllStudentsLoaded();
    expect(storeMocks.fetchStudents).toHaveBeenCalledWith({ reset: true });
  });

  it('fetches first page when store is empty', async () => {
    storeMocks.students = [];
    storeMocks.studentsHasMore = false;
    await ensureAllStudentsLoaded();
    expect(storeMocks.fetchStudents).toHaveBeenCalledWith({ reset: true });
  });

  it('refetches when refresh=true even with cached full list', async () => {
    storeMocks.students = [{ id: 's1' }];
    storeMocks.studentsHasMore = false;
    storeMocks.lastFetchOpts = {};
    await ensureAllStudentsLoaded({ refresh: true });
    expect(storeMocks.fetchStudents).toHaveBeenCalledWith({ reset: true });
  });

  it('calls onProgress after first page so UI can paint early', async () => {
    const onProgress = vi.fn();
    storeMocks.students = [];
    storeMocks.studentsHasMore = true;
    storeMocks.studentsTotal = null;
    storeMocks.fetchStudents.mockImplementation(async () => {
      storeMocks.students = [{ id: 's1' }];
    });
    storeMocks.fetchMoreStudents.mockImplementation(async () => {
      storeMocks.studentsHasMore = false;
      storeMocks.students.push({ id: 's2' });
    });
    await ensureAllStudentsLoaded({ onProgress });
    expect(onProgress).toHaveBeenCalled();
    expect(onProgress.mock.calls[0][0].some((s) => s.id === 's1')).toBe(true);
  });

  it('prefetch paralelo por offset quando total é conhecido', async () => {
    storeMocks.students = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}` }));
    storeMocks.studentsHasMore = true;
    storeMocks.studentsTotal = 450;
    storeMocks.lastFetchOpts = {};
    listMocks.fetchStudentsList
      .mockResolvedValueOnce({
        items: Array.from({ length: 200 }, (_, i) => ({ id: `p200_${i}` })),
        total: 450,
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, i) => ({ id: `p400_${i}` })),
        total: 450,
      });

    await ensureAllStudentsLoaded();

    expect(listMocks.fetchStudentsList).toHaveBeenCalled();
    expect(listMocks.fetchStudentsList.mock.calls.some((c) => c[0]?.offset === 200)).toBe(true);
    expect(listMocks.fetchStudentsList.mock.calls.some((c) => c[0]?.offset === 400)).toBe(true);
    expect(storeMocks.markStudentsFullyLoaded).toHaveBeenCalled();
    expect(storeMocks.fetchMoreStudents).not.toHaveBeenCalled();
  });
});
