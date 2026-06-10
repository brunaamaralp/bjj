import { useEffect, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/react/shallow';
import { useStudentStore } from '../store/useStudentStore';
import { useUiStore } from '../store/useUiStore';
import {
  applyStudentsListPipeline,
  buildServerAppliedFlags,
} from '../lib/studentsListFilters.js';
import { getBirthMonthDay } from '../lib/birthDate.js';
import { apiFindStudentsByPhone } from '../lib/studentsApi.js';
import { useStudentsListScrollLoadMore } from './useStudentsListScrollLoadMore.js';

const STALE_MS = 2 * 60 * 1000;

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

/**
 * Dados, efeitos e virtualização da lista de alunos.
 */
export function useStudentsListData({
  academyId,
  filterState,
  serverFetchOpts,
  hasServerFilters,
  serverSearchActive,
  studentPlural,
  listScrollRef,
}) {
  const addToast = useUiStore((s) => s.addToast);

  const {
    studentIds,
    studentsById,
    fetchStudents,
    fetchMoreStudents,
    mergeStudent,
    studentsLoading,
    loadingMore,
    studentsHasMore,
    studentsTotal,
    lastFetchedAt,
  } = useStudentStore(
    useShallow((s) => ({
      studentIds: s.studentIds,
      studentsById: s.studentsById,
      fetchStudents: s.fetchStudents,
      fetchMoreStudents: s.fetchMoreStudents,
      mergeStudent: s.mergeStudent,
      studentsLoading: s.loading,
      loadingMore: s.loadingMore,
      studentsHasMore: s.studentsHasMore,
      studentsTotal: s.studentsTotal,
      lastFetchedAt: s.lastFetchedAt,
    }))
  );

  const [listRefreshing, setListRefreshing] = useState(false);

  const students = useMemo(
    () => studentIds.map((id) => studentsById[id]).filter(Boolean),
    [studentIds, studentsById]
  );

  const studentCount = studentIds.length;
  const studentIdsFingerprint = studentIds.join(',');

  useEffect(() => {
    if (!academyId) return;
    if (useStudentStore.getState().loading) return;
    const stale = !lastFetchedAt || Date.now() - lastFetchedAt > STALE_MS;
    const hasStudents = useStudentStore.getState().studentIds.length > 0;
    if (!stale && !hasServerFilters && hasStudents) return;
    void fetchStudents({ reset: true, ...serverFetchOpts });
  }, [academyId, serverFetchOpts, fetchStudents, lastFetchedAt, hasServerFilters]);

  useEffect(() => {
    const phoneQ = normalizePhone(filterState.debouncedSearch);
    if (!academyId || phoneQ.length < 8 || studentsLoading) return;

    const { studentIds: ids, studentsById: byId } = useStudentStore.getState();
    const localHit = ids.some((sid) =>
      normalizePhone(byId[sid]?.phone || '').includes(phoneQ)
    );
    if (localHit) return;

    let cancelled = false;
    void apiFindStudentsByPhone(filterState.debouncedSearch, academyId)
      .then((matches) => {
        if (cancelled || !matches?.length) return;
        for (const m of matches) {
          if (m?.student?.id) mergeStudent(m.student.id, m.student);
        }
        if (matches.some((m) => m.repaired)) {
          addToast({
            type: 'success',
            message: 'Aluno recuperado e vinculado à academia.',
          });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [academyId, filterState.debouncedSearch, studentIdsFingerprint, studentsLoading, mergeStudent, addToast]);

  const filterCtx = useMemo(
    () => ({
      serverSearchActive,
      serverApplied: buildServerAppliedFlags(serverFetchOpts),
    }),
    [serverSearchActive, serverFetchOpts]
  );

  const filteredStudents = useMemo(
    () => applyStudentsListPipeline(students, filterState, filterCtx),
    [students, filterState, filterCtx]
  );

  const aniversariantesHoje = useMemo(() => {
    const hoje = new Date();
    const mesEDia = `${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    return students.filter((s) => getBirthMonthDay(s.birthDate) === mesEDia);
  }, [students]);

  const shouldVirtualizeStudents = filteredStudents.length > 50;
  const studentCardGap = 12;
  const studentCardEstimate = 100;
  const studentVirtualizer = useVirtualizer({
    count: shouldVirtualizeStudents ? filteredStudents.length : 0,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => studentCardEstimate,
    gap: studentCardGap,
    overscan: 8,
  });

  const listCountLabel = useMemo(() => {
    const shown = filteredStudents.length;
    const total = studentsTotal;
    if (total != null && total > shown) {
      return `Mostrando ${shown} de ${total} ${studentPlural.toLowerCase()}`;
    }
    if (studentsHasMore) {
      return `Mostrando ${shown} ${studentPlural.toLowerCase()} (role para carregar mais)`;
    }
    return `${shown} ${studentPlural.toLowerCase()} cadastrados`;
  }, [filteredStudents.length, studentsTotal, studentsHasMore, studentPlural]);

  const handleRefreshList = async () => {
    if (listRefreshing || studentsLoading) return;
    setListRefreshing(true);
    try {
      await fetchStudents({ reset: true, ...serverFetchOpts });
    } finally {
      setListRefreshing(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || studentsLoading || !studentsHasMore) return;
    await fetchMoreStudents();
  };

  const { onListScroll } = useStudentsListScrollLoadMore({
    studentsHasMore,
    loadingMore,
    studentsLoading,
    onLoadMore: handleLoadMore,
  });

  return {
    students,
    studentCount,
    filteredStudents,
    aniversariantesHoje,
    shouldVirtualizeStudents,
    studentVirtualizer,
    studentCardEstimate,
    listCountLabel,
    studentsLoading,
    loadingMore,
    studentsHasMore,
    listRefreshing,
    handleRefreshList,
    handleLoadMore,
    onListScroll,
    fetchStudents,
  };
}
