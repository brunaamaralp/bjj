import React, { useMemo } from 'react';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';

export default function MensalidadesStatusFilter({
  filter,
  onFilterChange,
  filterCounts,
  reguaFilterChips,
  overdueLabelName,
  overdueLabelCount,
  overdueLabelId,
}) {
  const primaryOptions = useMemo(
    () => [
      { id: 'all', label: 'Todos', count: filterCounts.all },
      { id: 'paid', label: 'Pagos', count: filterCounts.paid },
      { id: 'awaiting', label: 'Aguardando', count: filterCounts.awaiting },
      { id: 'partial', label: 'Parcial', count: filterCounts.partial },
      { id: 'pending', label: 'Inadimplentes', count: filterCounts.pending },
      { id: 'soon', label: 'A vencer', count: filterCounts.soon },
      { id: 'none', label: 'Sem registro', count: filterCounts.none },
    ],
    [filterCounts]
  );

  const extraSections = useMemo(() => {
    const reguaOptions = [...(reguaFilterChips || [])];
    if (overdueLabelId) {
      reguaOptions.push({
        id: 'overdue_label',
        label: overdueLabelName,
        count: overdueLabelCount,
      });
    }
    if (!reguaOptions.length) return [];
    return [{ label: 'Régua de cobrança', options: reguaOptions }];
  }, [reguaFilterChips, overdueLabelId, overdueLabelName, overdueLabelCount]);

  return (
    <CompactStatusFilter
      value={filter}
      onChange={onFilterChange}
      options={primaryOptions}
      extraSections={extraSections}
      placeholder="Todos os status"
      showCounts
    />
  );
}
