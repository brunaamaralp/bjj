import React from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { LEAD_STATUS } from '../../store/useLeadStore';
import { DEFAULT_STAGE_SLA_DAYS } from '../../lib/pipelineStagesConfig.js';

function isStageFieldLocked(stageId) {
  return stageId === LEAD_STATUS.MISSED || stageId === LEAD_STATUS.LOST;
}

function SortableStageRow({ stage, index, onLabelChange, onSlaChange, canEdit, variant }) {
  const locked = isStageFieldLocked(stage.id);
  const sortDisabled = !canEdit;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id, disabled: sortDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
    zIndex: isDragging ? 2 : undefined,
  };

  const rowClass =
    variant === 'pipeline' ? 'stage-row stage-row--sortable' : 'pipeline-stages-editor__row pipeline-stages-editor__row--sortable';
  const nameClass = variant === 'pipeline' ? 'stage-input' : 'form-input';
  const slaClass =
    variant === 'pipeline' ? 'stage-sla' : 'form-input pipeline-stages-editor__sla';

  return (
    <div ref={setNodeRef} style={style} className={rowClass}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="pipeline-stage-drag-handle"
        disabled={sortDisabled}
        aria-label={`Reordenar etapa ${index + 1}: ${stage.label || stage.id}`}
        title={sortDisabled ? undefined : 'Arrastar para reordenar'}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} aria-hidden />
      </button>
      <input
        className={nameClass}
        value={stage.label}
        disabled={!canEdit || locked}
        aria-label={`Nome da etapa ${index + 1}`}
        onChange={(e) => onLabelChange(e.target.value)}
      />
      <input
        className={slaClass}
        type="number"
        min="1"
        value={stage.slaDays ?? DEFAULT_STAGE_SLA_DAYS}
        disabled={!canEdit || locked}
        aria-label={`SLA em dias da etapa ${index + 1}`}
        title="SLA (dias)"
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onSlaChange(Number.isFinite(v) ? v : DEFAULT_STAGE_SLA_DAYS);
        }}
      />
    </div>
  );
}

/**
 * Lista editável de etapas do funil com reordenação por arrastar.
 * @param {{ stages: Array<{id: string, label: string, slaDays?: number}>, onChange: (stages: typeof stages) => void, canEdit?: boolean, variant?: 'pipeline' | 'settings' }} props
 */
export default function PipelineStageEditorList({
  stages,
  onChange,
  canEdit = true,
  variant = 'settings',
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(stages, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {stages.map((st, idx) => (
          <SortableStageRow
            key={st.id}
            stage={st}
            index={idx}
            canEdit={canEdit}
            variant={variant}
            onLabelChange={(v) =>
              onChange(stages.map((s, i) => (i === idx ? { ...s, label: v } : s)))
            }
            onSlaChange={(v) =>
              onChange(stages.map((s, i) => (i === idx ? { ...s, slaDays: v } : s)))
            }
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
