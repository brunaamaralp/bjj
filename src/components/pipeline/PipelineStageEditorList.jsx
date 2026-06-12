import React, { useCallback, useState } from 'react';
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
import { GripVertical, Trash2 } from 'lucide-react';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import {
  DEFAULT_STAGE_SLA_DAYS,
  isPipelineStageDeletable,
  isPipelineStageLabelLocked,
} from '../../lib/pipelineStagesConfig.js';

function SortableStageRow({
  stage,
  index,
  onLabelChange,
  onSlaChange,
  onRemoveRequest,
  canEdit,
  variant,
}) {
  const labelLocked = isPipelineStageLabelLocked(stage.id);
  const deletable = isPipelineStageDeletable(stage.id);
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
        disabled={!canEdit || labelLocked}
        aria-label={`Nome da etapa ${index + 1}`}
        onChange={(e) => onLabelChange(e.target.value)}
      />
      <input
        className={slaClass}
        type="number"
        min="1"
        value={Number.isFinite(stage.slaDays) ? stage.slaDays : ''}
        placeholder={String(DEFAULT_STAGE_SLA_DAYS)}
        disabled={!canEdit}
        aria-label={`SLA em dias da etapa ${index + 1}`}
        title="SLA (dias)"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onSlaChange(null);
            return;
          }
          const v = parseInt(raw, 10);
          if (Number.isFinite(v) && v >= 1) onSlaChange(v);
        }}
      />
      {canEdit && deletable ? (
        <button
          type="button"
          className="pipeline-stage-remove-btn"
          aria-label={`Excluir etapa ${stage.label || stage.id}`}
          title="Excluir etapa"
          onClick={() => onRemoveRequest(index)}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      ) : (
        <span className="pipeline-stage-remove-placeholder" aria-hidden />
      )}
    </div>
  );
}

/**
 * Lista editável de etapas do funil com reordenação por arrastar.
 * @param {{ stages: Array<{id: string, label: string, slaDays?: number}>, onChange: (stages: typeof stages) => void, canEdit?: boolean, variant?: 'pipeline' | 'settings', getStageLeadCount?: (stageId: string) => number, stageLeadCountsIncomplete?: boolean }} props
 */
export default function PipelineStageEditorList({
  stages,
  onChange,
  canEdit = true,
  variant = 'settings',
  getStageLeadCount,
  stageLeadCountsIncomplete = false,
}) {
  const [pendingRemove, setPendingRemove] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const removeStageAt = useCallback(
    (index) => {
      onChange(stages.filter((_, i) => i !== index));
    },
    [onChange, stages]
  );

  const requestRemove = useCallback(
    (index) => {
      const stage = stages[index];
      if (!stage) return;
      const count = getStageLeadCount?.(stage.id) ?? 0;
      if (count > 0) {
        setPendingRemove({ index, stage, count });
        return;
      }
      removeStageAt(index);
    },
    [stages, getStageLeadCount, removeStageAt]
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(stages, oldIndex, newIndex));
  };

  const pendingLabel = pendingRemove?.stage?.label || pendingRemove?.stage?.id || 'esta etapa';
  const pendingCount = pendingRemove?.count ?? 0;
  const countLabel =
    pendingCount === 1 ? '1 lead' : `${pendingCount}${stageLeadCountsIncomplete ? ' ou mais' : ''} leads`;

  return (
    <>
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
              onRemoveRequest={requestRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title={`Excluir etapa «${pendingLabel}»?`}
        description={
          pendingRemove
            ? `Há ${countLabel} nesta etapa. Eles manterão a etapa atual até você movê-los no funil. Deseja excluir a etapa mesmo assim?`
            : undefined
        }
        confirmLabel="Excluir etapa"
        onConfirm={() => {
          if (pendingRemove) removeStageAt(pendingRemove.index);
          setPendingRemove(null);
        }}
        onClose={() => setPendingRemove(null)}
      />
    </>
  );
}
