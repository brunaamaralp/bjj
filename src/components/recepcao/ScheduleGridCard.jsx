import React from 'react';
import { CheckCircle2, CircleDashed, UserX } from 'lucide-react';
import {
  resolveScheduleCardStyle,
  scheduleTimeStatusLabel,
} from '../../lib/recepcaoScheduleGrid.js';
import { buildLessonStaffCardBadge } from '../../../lib/lessonStaffRegister.js';

const LESSON_BADGE_ICON = {
  ok: CheckCircle2,
  warn: UserX,
  pending: CircleDashed,
};

/**
 * @param {{
 *   item: object;
 *   classDoc?: object | null;
 *   variant?: 'table' | 'list';
 *   timeStatus?: 'ongoing' | 'soon' | 'past' | 'upcoming' | null;
 *   showLevel?: boolean;
 *   slot?: object | null;
 *   onSelect?: (() => void) | null;
 *   dateLabel?: string;
 * }} props
 */
export default function ScheduleGridCard({
  item,
  classDoc = null,
  variant = 'table',
  timeStatus = null,
  showLevel = false,
  slot = null,
  onSelect = null,
  dateLabel = '',
}) {
  const { borderColor, surfaceColor } = resolveScheduleCardStyle(classDoc);
  const modality = String(item?.modality || '').trim();
  const level = String(item?.level || '').trim();
  const instructor = String(item?.instructor || '').trim();
  const statusLabel = scheduleTimeStatusLabel(timeStatus);
  const lessonBadge = buildLessonStaffCardBadge(slot);
  const LessonIcon = LESSON_BADGE_ICON[lessonBadge.tone] || CircleDashed;

  const metaParts = [instructor, showLevel && level ? level : ''].filter(Boolean);

  const cardClass = [
    'schedules-week-card',
    'schedules-week-card--accent',
    variant === 'table' ? 'schedules-week-card--compact' : '',
    timeStatus === 'ongoing' ? 'schedules-week-card--ongoing' : '',
    timeStatus === 'soon' ? 'schedules-week-card--soon' : '',
    onSelect ? 'schedules-week-card--action' : '',
    `schedules-week-card--lesson-${lessonBadge.tone}`,
  ]
    .filter(Boolean)
    .join(' ');

  const ariaLabel = [
    item.name,
    item.time_start && item.time_end ? `${item.time_start} às ${item.time_end}` : '',
    dateLabel,
    lessonBadge.shortLabel,
    onSelect ? 'Abrir confirmação de staff' : '',
  ]
    .filter(Boolean)
    .join('. ');

  const body = (
    <>
      <div className="schedules-week-card__head">
        <span className="schedules-week-card__name">{item.name}</span>
        {statusLabel ? (
          <span className={`schedules-week-card__status schedules-week-card__status--${timeStatus}`}>
            {statusLabel}
          </span>
        ) : null}
        {modality ? (
          <span className="schedules-week-card__modality">{modality}</span>
        ) : null}
      </div>
      {variant === 'list' ? (
        <span className="schedules-week-card__time text-small text-muted">
          {item.time_start}–{item.time_end}
        </span>
      ) : null}
      {metaParts.length ? (
        <span className="schedules-week-card__meta text-small text-muted">{metaParts.join(' · ')}</span>
      ) : null}
      <span
        className={`schedules-week-card__lesson-badge schedules-week-card__lesson-badge--${lessonBadge.tone}`}
        title={lessonBadge.label}
      >
        <LessonIcon size={11} aria-hidden />
        <span className="schedules-week-card__lesson-badge-text">{lessonBadge.shortLabel}</span>
      </span>
    </>
  );

  if (onSelect) {
    return (
      <li className="schedules-week-card-wrap">
        <button
          type="button"
          className={cardClass}
          style={{
            borderLeftColor: borderColor,
            background: surfaceColor,
          }}
          onClick={onSelect}
          aria-label={ariaLabel}
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li
      className={cardClass}
      style={{
        borderLeftColor: borderColor,
        background: surfaceColor,
      }}
    >
      {body}
    </li>
  );
}
