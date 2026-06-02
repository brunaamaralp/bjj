import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, User, Pencil, Trash2, Loader2, Workflow, DollarSign } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useStudentStore } from '../../store/useStudentStore';
import { profilePathForLinkablePerson } from '../../lib/taskLinkablePeople.js';
import { useTerms, contactLabelSingular, pipelineStageDisplayLabel } from '../../lib/terminology.js';
import { resolveTaskOrigin } from '../../lib/taskOrigin.js';
import { formatTaskDueDate, formatTaskDueRelative, isTaskOverdue } from '../../lib/taskDue.js';
import StageBadge from './StageBadge.jsx';
import StatusBadge from './StatusBadge.jsx';
import { TASK_ORIGIN_BADGE_MAP } from '../../lib/taskOriginBadges.js';

const TASK_ORIGIN_BADGE_ICONS = {
  collection: <DollarSign size={11} />,
  process: <Workflow size={11} />,
};
import './task-card.css';

function OriginBadge({ origin }) {
  if (origin === 'manual') return null;
  return (
    <StatusBadge
      status={origin}
      map={TASK_ORIGIN_BADGE_MAP}
      icon={TASK_ORIGIN_BADGE_ICONS[origin]}
      size="sm"
    />
  );
}

export default function TaskCard({
  task,
  variant = 'full',
  compactLayout = 'row',
  onComplete,
  onEdit = null,
  onDelete = null,
  onOpen = null,
  showLead = true,
  showAssignee = true,
  isUpdating = false,
  assigneeLabel = null,
  assigneeInitials = null,
}) {
  const navigate = useNavigate();
  const terms = useTerms();
  const labels = useLeadStore((s) => s.labels);
  const leads = useLeadStore((s) => s.leads);
  const students = useStudentStore((s) => s.students);
  const contactLabel = useMemo(() => contactLabelSingular(labels), [labels]);

  const leadId = String(task?.lead_id || task?.leadId || '').trim();
  const linkedLead = useMemo(
    () => (leads || []).find((l) => String(l.id) === leadId),
    [leads, leadId]
  );

  const personKind = useMemo(() => {
    if (!leadId) return null;
    if ((students || []).some((s) => String(s.id) === leadId)) return 'student';
    if ((leads || []).some((l) => String(l.id) === leadId)) return 'lead';
    return null;
  }, [students, leads, leadId]);

  const profilePath = useMemo(() => {
    if (!leadId) return null;
    if (personKind === 'student') return `/student/${leadId}`;
    if (personKind === 'lead') return `/lead/${leadId}`;
    return profilePathForLinkablePerson({ id: leadId, kind: personKind || 'lead' }) || `/student/${leadId}`;
  }, [leadId, personKind]);

  if (!task?.id) return null;

  const isDone = String(task.status || '').toLowerCase() === 'done';
  const dueRaw = task.due_date || task.dueDate || '';
  const overdue = isTaskOverdue(dueRaw) && !isDone;
  const dueRelative = formatTaskDueRelative(dueRaw);
  const origin = resolveTaskOrigin(task);

  const leadName = String(task.lead_name || linkedLead?.name || '').trim() || terms.student;
  const stageId = String(linkedLead?.pipelineStage || linkedLead?.stage || '').trim();
  const stageLabel = stageId ? pipelineStageDisplayLabel(terms, stageId) : '';

  const kindLabel =
    personKind === 'student' ? terms.student : personKind === 'lead' ? contactLabel : null;

  const handleToggle = (e) => {
    e.stopPropagation();
    if (isUpdating) return;
    onComplete?.(task.id);
  };

  const handleOpen = () => {
    onOpen?.(task);
  };

  const handleContentKeyDown = (e) => {
    if (!onOpen && variant !== 'full') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  };

  const navigateToLead = (e) => {
    e.stopPropagation();
    if (profilePath) navigate(profilePath);
  };

  const checkbox = (
    <span className="task-checkbox-wrap" onClick={(e) => e.stopPropagation()}>
      {isUpdating ? (
        <Loader2 size={16} className="navi-async-btn__spin task-checkbox-spinner" aria-hidden />
      ) : (
        <input
          type="checkbox"
          checked={isDone}
          onChange={handleToggle}
          className="task-checkbox"
          aria-label={isDone ? 'Marcar como pendente' : 'Marcar como concluída'}
        />
      )}
    </span>
  );

  const originBadge = <OriginBadge origin={origin} />;

  const dueBadgeFull = dueRaw ? (
    <span
      className={`task-badge ${overdue ? 'text-danger' : ''}`}
      title={dueRelative?.title || undefined}
    >
      <Calendar size={12} aria-hidden />
      {dueRelative?.text || formatTaskDueDate(dueRaw)}
    </span>
  ) : null;

  const assigneeBadge =
    showAssignee && (assigneeInitials || assigneeLabel) ? (
      <span className="task-badge assign-badge" title={assigneeLabel || undefined}>
        {(assigneeInitials || String(assigneeLabel || '').slice(0, 2)).toUpperCase()}
      </span>
    ) : null;

  const leadBlock =
    showLead && leadId ? (
      <div className={`task-linked-person${variant === 'compact' ? ' task-linked-person--compact' : ''}`}>
        <span className="task-linked-person__row">
          <span
            className={`task-badge lead-badge${variant === 'compact' ? ' task-badge--compact' : ''}`}
            role="link"
            tabIndex={0}
            onClick={navigateToLead}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                navigateToLead(e);
              }
            }}
          >
            <User size={12} aria-hidden />
            {leadName}
            {kindLabel ? ` · ${kindLabel}` : ''}
          </span>
          {stageId ? <StageBadge stage={stageId} label={stageLabel} size="sm" /> : null}
        </span>
      </div>
    ) : null;

  const showActions =
    (onEdit || onDelete) && (variant === 'full' || compactLayout === 'stack');

  const actions = showActions ? (
    <div className="task-actions dropdown-container" onClick={(e) => e.stopPropagation()}>
      {onEdit ? (
        <button type="button" className="task-action-btn" onClick={() => onEdit(task)}>
          <Pencil size={14} aria-hidden />
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" className="task-action-btn text-danger" onClick={() => onDelete(task.id)}>
          <Trash2 size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  ) : null;

  if (variant === 'compact' && compactLayout === 'stack') {
    return (
      <div className={`task-card task-card--compact ${isDone ? 'done' : ''}`}>
        {checkbox}
        <div
          className={`task-content${onOpen ? '' : ' task-content--static'}`}
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          onClick={onOpen ? handleOpen : undefined}
          onKeyDown={onOpen ? handleContentKeyDown : undefined}
        >
          <span className={`task-title ${isDone ? 'line-through' : ''}`}>{task.title}</span>
          {originBadge}
          {leadBlock}
          <div className="task-meta task-meta--compact">
            {dueBadgeFull}
            {assigneeBadge}
          </div>
        </div>
        {actions}
      </div>
    );
  }

  if (variant === 'compact') {
    const dueText = dueRelative?.text || (dueRaw ? formatTaskDueDate(dueRaw) : '');
    return (
      <div className={`task-card task-card--compact task-card--compact-row ${isDone ? 'done' : ''}`}>
        {checkbox}
        <div
          className={`task-card__compact-body${onOpen ? '' : ' task-content--static'}`}
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          onClick={onOpen ? handleOpen : undefined}
          onKeyDown={onOpen ? handleContentKeyDown : undefined}
        >
          <div className="task-card__compact-row-main">
            <span className={`task-title ${isDone ? 'line-through' : ''}`}>{task.title}</span>
            {originBadge}
          </div>
          {leadBlock}
        </div>
        {dueText ? (
          <span
            className={`task-due task-card__compact-due${overdue ? ' task-due--overdue' : ''}`}
            title={dueRelative?.title || undefined}
          >
            {dueText}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`task-card ${isDone ? 'done' : ''}`}>
      {checkbox}
      <div
        className="task-content"
        role="button"
        tabIndex={0}
        onClick={handleOpen}
        onKeyDown={handleContentKeyDown}
      >
        <span className={`task-title ${isDone ? 'line-through' : ''}`}>{task.title}</span>
        {originBadge}
        {leadBlock}
        <div className="task-meta">
          {dueBadgeFull}
          {assigneeBadge}
        </div>
      </div>
      {actions}
    </div>
  );
}
