import React, { useMemo } from 'react';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';
import { buildReguaStageTooltip } from '../../lib/collectionRules.js';
import { GRID_STATUS_LABELS } from '../../lib/paymentStatus.js';

export default function MensalidadesStatusFilter({
  filter,
  onFilterChange,
  filterCounts,
  reguaFilterChips,
  collectionRules,
}) {
  const rulesByDay = useMemo(() => {
    const map = new Map();
    for (const r of collectionRules || []) {
      map.set(Number(r.day), r);
    }
    return map;
  }, [collectionRules]);

  const primaryOptions = useMemo(
    () => [
      { id: 'all', label: 'Todos', count: filterCounts.all },
      { id: 'paid', label: GRID_STATUS_LABELS.paid, count: filterCounts.paid },
      { id: 'covered', label: GRID_STATUS_LABELS.covered, count: filterCounts.covered },
      { id: 'exempt', label: GRID_STATUS_LABELS.exempt, count: filterCounts.exempt },
      { id: 'frozen', label: GRID_STATUS_LABELS.frozen, count: filterCounts.frozen },
      { id: 'awaiting', label: GRID_STATUS_LABELS.awaiting, count: filterCounts.awaiting },
      { id: 'partial', label: GRID_STATUS_LABELS.partial, count: filterCounts.partial },
      { id: 'pending', label: GRID_STATUS_LABELS.pending, count: filterCounts.pending },
      { id: 'soon', label: GRID_STATUS_LABELS.soon, count: filterCounts.soon },
      { id: 'none', label: GRID_STATUS_LABELS.none, count: filterCounts.none },
    ],
    [filterCounts]
  );

  const extraSections = useMemo(() => {
    const reguaOptions = [...(reguaFilterChips || [])].map((chip) => {
      const day = Number(String(chip.id || '').replace('regua_', ''));
      const rule = rulesByDay.get(day);
      return {
        ...chip,
        title: rule ? buildReguaStageTooltip(rule) : `Etapa D+${day} da régua de cobrança`,
      };
    });
    if (!reguaOptions.length) return [];
    return [{ label: 'Régua de cobrança', options: reguaOptions }];
  }, [reguaFilterChips, rulesByDay]);

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
