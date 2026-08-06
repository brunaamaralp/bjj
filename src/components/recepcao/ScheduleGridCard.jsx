import React from 'react';
import {
  resolveScheduleCardStyle,
  scheduleTimeStatusLabel,
} from '../../lib/recepcaoScheduleGrid.js';

/**
 * @param {{
 *   item: object;
 *   classDoc?: object | null;
 *   variant?: 'table' | 'list';
 *   timeStatus?: 'ongoing' | 'soon' | 'past' | 'upcoming' | null;
 *   showLevel?: boolean;
 *   onSelect?: (item: object) => void;
 * }} props
 */
export default function ScheduleGridCard({
  item,
  classDoc = null,
  variant = 'table',
  timeStatus = null,
  showLevel = false,
  onSelect,
}) {
  const { borderColor, surfaceColor } = resolveScheduleCardStyle(classDoc);
  const modality = String(item?.modality || '').trim();
  const level = String(item?.level || '').trim();
  const instructor = String(item?.instructor || '').trim();
  const statusLabel = scheduleTimeStatusLabel(timeStatus);
  const clickable = typeof onSelect === 'function';

  const metaParts = [instructor, showLevel && level ? level : ''].filter(Boolean);

  const cardClass = [
    'schedules-week-card',
    'schedules-week-card--accent',
    variant === 'table' ? 'schedules-week-card--compact' : '',
    timeStatus === 'ongoing' ? 'schedules-week-card--ongoing' : '',
    timeStatus === 'soon' ? 'schedules-week-card--soon' : '',
    clickable ? 'schedules-week-card--interactive' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
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
    </>
  );

  return (
    <li
      className={cardClass}
      style={{
        borderLeftColor: borderColor,
        background: surfaceColor,
      }}
    >
      {clickable ? (
        <button
          type="button"
          className="schedules-week-card__button"
          onClick={() => onSelect(item)}
          aria-label={`Registrar aula ${item.name || ''}`.trim()}
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </li>
  );
}
