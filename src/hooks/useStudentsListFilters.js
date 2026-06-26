import { useMemo, useState } from 'react';
import useDebounce from './useDebounce';
import { useShallow } from 'zustand/react/shallow';
import { useStudentStore } from '../store/useStudentStore.js';
import {
  buildStudentPlanFilterOptions,
  buildStudentsCobrancaCounts,
  buildStudentsServerFetchOpts,
  hasStudentsServerFilters,
  STUDENT_COBRANCA_FILTER,
} from '../lib/studentsListFilters.js';

export const STUDENTS_FILTERS_EXPANDED_KEY = 'navi_students_filters_expanded';

/**
 * Estado e derivados dos filtros da lista de alunos.
 */
export function useStudentsListFilters({ financeConfig }) {
  const students = useStudentStore(
    useShallow((s) => s.studentIds.map((id) => s.studentsById[id]).filter(Boolean))
  );

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [filtroOrigem, setFiltroOrigem] = useState('Todas');
  const [filtroTurma, setFiltroTurma] = useState('Todas');
  const [filtroPlano, setFiltroPlano] = useState('Todos');
  const [filtroCobranca, setFiltroCobranca] = useState(STUDENT_COBRANCA_FILTER.TODOS);
  const [ordenacao, setOrdenacao] = useState('az');
  const [showInactive, setShowInactive] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return sessionStorage.getItem(STUDENTS_FILTERS_EXPANDED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const planOptions = useMemo(
    () => buildStudentPlanFilterOptions(financeConfig?.plans, students),
    [financeConfig?.plans, students]
  );

  const cobrancaCounts = useMemo(
    () => buildStudentsCobrancaCounts(students, financeConfig),
    [students, financeConfig]
  );

  const filterState = useMemo(
    () => ({
      debouncedSearch,
      filtroOrigem,
      filtroTurma,
      filtroPlano,
      filtroCobranca,
      showInactive,
      ordenacao,
    }),
    [debouncedSearch, filtroOrigem, filtroTurma, filtroPlano, filtroCobranca, showInactive, ordenacao]
  );

  const serverFetchOpts = useMemo(
    () => buildStudentsServerFetchOpts(filterState),
    [filterState]
  );

  const hasServerFilters = useMemo(
    () => hasStudentsServerFilters(filterState),
    [filterState]
  );

  const serverSearchActive = debouncedSearch.trim().length >= 2;

  const limparFiltros = () => {
    setSearchTerm('');
    setFiltroOrigem('Todas');
    setFiltroTurma('Todas');
    setFiltroPlano('Todos');
    setFiltroCobranca(STUDENT_COBRANCA_FILTER.TODOS);
    setOrdenacao('az');
    setShowInactive(false);
  };

  const filtrosAtivos =
    Boolean(searchTerm.trim()) ||
    filtroOrigem !== 'Todas' ||
    filtroTurma !== 'Todas' ||
    filtroPlano !== 'Todos' ||
    filtroCobranca !== STUDENT_COBRANCA_FILTER.TODOS ||
    ordenacao !== 'az' ||
    showInactive;

  const collapsibleFilterCount = useMemo(() => {
    let n = 0;
    if (filtroOrigem !== 'Todas') n += 1;
    if (filtroTurma !== 'Todas') n += 1;
    if (filtroPlano !== 'Todos') n += 1;
    if (filtroCobranca !== STUDENT_COBRANCA_FILTER.TODOS) n += 1;
    if (ordenacao !== 'az') n += 1;
    return n;
  }, [filtroOrigem, filtroTurma, filtroPlano, filtroCobranca, ordenacao]);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    filtroOrigem,
    setFiltroOrigem,
    filtroTurma,
    setFiltroTurma,
    filtroPlano,
    setFiltroPlano,
    filtroCobranca,
    setFiltroCobranca,
    cobrancaCounts,
    ordenacao,
    setOrdenacao,
    showInactive,
    setShowInactive,
    filtersExpanded,
    setFiltersExpanded,
    planOptions,
    filterState,
    serverFetchOpts,
    hasServerFilters,
    serverSearchActive,
    limparFiltros,
    filtrosAtivos,
    collapsibleFilterCount,
  };
}
