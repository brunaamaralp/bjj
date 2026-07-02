import React from 'react';
import { Users } from 'lucide-react';
import { formatCapacityLabel } from '../../lib/classes.js';
import {
  capacityTone,
  formatOccupancyLabel,
  resolveScheduleCardStyle,
  scheduleTimeStatusLabel,
} from '../../lib/recepcaoScheduleGrid.js';

/**
 * @param {{
 *   item: object;
 *   classDoc?: object | null;
 *   variant?: 'table' | 'list';
 *   timeStatus?: 'ongoing' | 'soon' | 'past' | 'upcoming' | null;
 *   occupancy?: { booked: number; max: number | null } | null;
 *   showLevel?: boolean;
 * }} props
 */
export default function ScheduleGridCard({
  item,
  classDoc = null,
  variant = 'table',
  timeStatus = null,
  occupancy = null,
  showLevel = true,
}) {
  const { borderColor, surfaceColor } = resolveScheduleCardStyle(classDoc);
  const modality = String(item?.modality || '').trim();
  const level = String(item?.level || '').trim();
  const statusLabel = scheduleTimeStatusLabel(timeStatus);
  const tone = occupancy ? capacityTone(occupancy.booked, occupancy.max) : null;
  const capacityText = occupancy
    ? formatOccupancyLabel(occupancy)
    : item.max_capacity
      ? formatCapacityLabel(item.max_capacity)
      : '';

  const cardClass = [
    'schedules-week-card',
    'schedules-week-card--accent',
    timeStatus === 'ongoing' ? 'schedules-week-card--ongoing' : '',
    timeStatus === 'soon' ? 'schedules-week-card--soon' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={cardClass}
      style={{
        borderLeftColor: borderColor,
        background: surfaceColor,
      }}
    >
      <div className="schedules-week-card__head">
        <span className="schedules-week-card__name">{item.name}</span>
        {statusLabel ? (
          <span className={`schedules-week-card__status schedules-week-card__status--${timeStatus}`}>
            {statusLabel}
          </span>
        ) : null}
        {modality ? (
          <span className="schedules-week-card__modality badge badge-secondary">{modality}</span>
        ) : null}
      </div>
      {variant === 'list' ? (
        <span className="schedules-week-card__time text-small text-muted">
          {item.time_start}–{item.time_end}
        </span>
      ) : null}
      {showLevel && level ? (
        <span className="schedules-week-card__level text-small text-muted">{level}</span>
      ) : null}
      {item.instructor ? (
        <span className="schedules-week-card__instructor text-small text-muted">{item.instructor}</span>
      ) : null}
      {capacityText ? (
        <span
          className={[
            'schedules-week-card__capacity',
            'text-small',
            tone ? `schedules-week-card__occupancy--${tone}` : 'text-muted',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <Users size={12} strokeWidth={2} aria-hidden />
          {capacityText}
        </span>
      ) : null}
    </li>
  );
}
