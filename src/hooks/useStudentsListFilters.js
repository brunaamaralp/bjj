import { useMemo, useState } from 'react';
import useDebounce from './useDebounce';
import {
  buildStudentsServerFetchOpts,
  hasStudentsServerFilters,
} from '../lib/studentsListFilters.js';

export const STUDENTS_FILTERS_EXPANDED_KEY = 'navi_students_filters_expanded';

/**
 * Estado e derivados dos filtros da lista de alunos.
 */
export function useStudentsListFilters({ financeConfig }) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [filtroOrigem, setFiltroOrigem] = useState('Todas');
  const [filtroTurma, setFiltroTurma] = useState('Todas');
  const [filtroPlano, setFiltroPlano] = useState('Todos');
  const [ordenacao, setOrdenacao] = useState('az');
  const [showInactive, setShowInactive] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    try {
      return sessionStorage.getItem(STUDENTS_FILTERS_EXPANDED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const planOptions = useMemo(() => {
    const names = (financeConfig?.plans || [])
      .map((p) => String(p?.name || '').trim())
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'pt'));
  }, [financeConfig?.plans]);

  const filterState = useMemo(
    () => ({
      debouncedSearch,
      filtroOrigem,
      filtroTurma,
      filtroPlano,
      showInactive,
      ordenacao,
    }),
    [debouncedSearch, filtroOrigem, filtroTurma, filtroPlano, showInactive, ordenacao]
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
    setOrdenacao('az');
    setShowInactive(false);
  };

  const filtrosAtivos =
    Boolean(searchTerm.trim()) ||
    filtroOrigem !== 'Todas' ||
    filtroTurma !== 'Todas' ||
    filtroPlano !== 'Todos' ||
    ordenacao !== 'az' ||
    showInactive;

  const collapsibleFilterCount = useMemo(() => {
    let n = 0;
    if (filtroOrigem !== 'Todas') n += 1;
    if (filtroTurma !== 'Todas') n += 1;
    if (filtroPlano !== 'Todos') n += 1;
    if (ordenacao !== 'az') n += 1;
    return n;
  }, [filtroOrigem, filtroTurma, filtroPlano, ordenacao]);

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
