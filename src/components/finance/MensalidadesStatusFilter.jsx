import React, { useMemo } from 'react';
import CompactStatusFilter from '../shared/CompactStatusFilter.jsx';
import { buildReguaStageTooltip } from '../../lib/collectionRules.js';

export default function MensalidadesStatusFilter({
  filter,
  onFilterChange,
  filterCounts,
  reguaFilterChips,
  collectionRules,
  overdueLabelName,
  overdueLabelCount,
  overdueLabelId,
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
      { id: 'paid', label: 'Pagos', count: filterCounts.paid },
      { id: 'awaiting', label: 'Aguardando', count: filterCounts.awaiting },
      { id: 'partial', label: 'Parcial', count: filterCounts.partial },
      { id: 'pending', label: 'Pendente', count: filterCounts.pending },
      { id: 'soon', label: 'A vencer', count: filterCounts.soon },
      { id: 'none', label: 'Não registrado', count: filterCounts.none },
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
    if (overdueLabelId) {
      reguaOptions.push({
        id: 'overdue_label',
        label: overdueLabelName,
        count: overdueLabelCount,
        title: 'Alunos com a etiqueta de inadimplência aplicada pelo cron (D+1+).',
      });
    }
    if (!reguaOptions.length) return [];
    return [{ label: 'Régua de cobrança', options: reguaOptions }];
  }, [reguaFilterChips, rulesByDay, overdueLabelId, overdueLabelName, overdueLabelCount]);

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
