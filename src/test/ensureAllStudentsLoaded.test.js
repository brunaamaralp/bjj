import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  students: [],
  studentsHasMore: false,
  lastFetchOpts: {},
  loading: false,
  loadingMore: false,
  fetchStudents: vi.fn(),
  fetchMoreStudents: vi.fn(),
}));

vi.mock('../store/useStudentStore.js', () => ({
  useStudentStore: {
    getState: () => ({
      students: storeMocks.students,
      studentsHasMore: storeMocks.studentsHasMore,
      lastFetchOpts: storeMocks.lastFetchOpts,
      loading: storeMocks.loading,
      loadingMore: storeMocks.loadingMore,
      fetchStudents: storeMocks.fetchStudents,
      fetchMoreStudents: storeMocks.fetchMoreStudents,
    }),
  },
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
    storeMocks.lastFetchOpts = {};
    storeMocks.loading = false;
    storeMocks.loadingMore = false;
    storeMocks.fetchStudents.mockResolvedValue(undefined);
    storeMocks.fetchMoreStudents.mockImplementation(async () => {
      storeMocks.studentsHasMore = false;
      storeMocks.students.push({ id: 's2' });
    });
  });

  it('loads additional pages while studentsHasMore', async () => {
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
});
