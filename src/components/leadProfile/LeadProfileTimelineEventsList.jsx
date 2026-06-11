import React, { memo } from 'react';
import { Pin } from 'lucide-react';

/**
 * Lista renderizada de eventos da timeline do lead (presentacional).
 */
function LeadProfileTimelineEventsList({
  events,
  stages,
  terms,
  timelineEventLabels,
  humanizeStage,
  onTogglePin,
}) {
  return (
    <div className="timeline-events-list">
      <div className="timeline-vertical-line" aria-hidden />
      {events.map((n, i) => {
        const when = new Date(n.at || n.date).toLocaleString('pt-BR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
        const type = n.type || 'note';
        const tag =
          type === 'converted' ? terms.convertedStatusUi : timelineEventLabels[type] ?? type;

        let dotColor = 'var(--color-text-secondary)';
        if (type === 'note' || type === 'inbox_note') dotColor = 'var(--color-primary)';
        else if (type === 'message' || type === 'whatsapp_template_sent') dotColor = 'var(--color-accent)';
        else if (type === 'schedule') dotColor = 'var(--color-primary)';
        else if (type === 'followup_done') dotColor = 'var(--color-accent-dark)';
        else if (type === 'followup_contact') dotColor = 'var(--color-accent)';
        else if (type === 'followup_snooze') dotColor = 'var(--color-warning)';
        else if (type === 'task_created') dotColor = 'var(--color-primary)';
        else if (type === 'task_done') dotColor = 'var(--color-accent-dark)';
        else if (['stage_change', 'attended', 'missed', 'converted', 'lost'].includes(type)) {
          dotColor = 'var(--color-text-secondary)';
        } else if (type === 'pipeline_change') dotColor = 'var(--color-warning)';

        let label = n.text || '';
        if (type === 'schedule') {
          label = `Agendado para ${n.date} ${n.time || ''}`.trim();
        } else if (type === 'followup_done') {
          label = n.text || 'Retorno marcado como concluído';
        } else if (type === 'followup_contact') {
          label = n.text || 'Contato de retorno registrado';
        } else if (type === 'followup_snooze') {
          label = n.text || 'Retorno adiado';
        } else if (type === 'task_done') {
          label = n.text || 'Tarefa marcada como concluída';
        } else if (type === 'stage_change' || type === 'pipeline_change') {
          label = `De ${humanizeStage(n.from, stages, terms)} para ${humanizeStage(n.to, stages, terms)}`;
        } else if (type === 'inbox_note') {
          label = (
            <span>
              {n.text}
              <span className="inbox-tag">· Inbox</span>
            </span>
          );
        } else if (type === 'whatsapp_template_sent') {
          label = n.text || 'Mensagem automática enviada';
        }

        const isPinned = Boolean(n.is_pinned);
        const canPin = type === 'note' || type === 'inbox_note';

        return (
          <div
            key={n.$id || `${type}-${n.at || n.date}-${i}`}
            className={`timeline-event-item timeline-event-item--virtualized${isPinned ? ' pinned' : ''}`}
          >
            <div className="event-dot" style={{ backgroundColor: dotColor }} />
            <div className="event-body">
              <div className="event-header">
                <span className="event-type-label">{tag}</span>
                <span className="event-date">{when}</span>
                {canPin ? (
                  <button
                    type="button"
                    onClick={() => onTogglePin(n)}
                    className="event-pin-btn"
                    title={isPinned ? 'Desafixar' : 'Fixar'}
                    aria-label={isPinned ? 'Desafixar nota' : 'Fixar nota'}
                  >
                    <Pin
                      size={12}
                      fill={isPinned ? 'currentColor' : 'none'}
                      style={{ transform: isPinned ? 'none' : 'rotate(45deg)' }}
                    />
                  </button>
                ) : null}
              </div>
              <div className="event-message">{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(LeadProfileTimelineEventsList);
