import React from 'react';
import {
  Check,
  Clock,
  CircleAlert,
  CircleDashed,
  CalendarCheck,
} from 'lucide-react';

export const GRID_BADGE_ICONS = {
  paid: Check,
  covered: CalendarCheck,
  awaiting: Clock,
  pending: CircleAlert,
  partial: CircleDashed,
  none: null,
};

export function GridStatusBadgeContent({ statusKey, label }) {
  const Icon = GRID_BADGE_ICONS[statusKey];
  return (
    <>
      {Icon ? <Icon size={12} strokeWidth={2.25} aria-hidden /> : null}
      <span>{label}</span>
    </>
  );
}

export function GridStatusBadgeButton({ display, payment, onClick, onCoveredExpand }) {
  const isCovered = display.key === 'covered';
  return (
    <button
      type="button"
      className={`grid-status-badge grid-status-badge--${display.key}`}
      title={
        isCovered && payment?.note
          ? String(payment.note)
          : isCovered
            ? 'Coberto por plano com cobertura'
            : undefined
      }
      onClick={(e) => {
        if (isCovered) {
          onCoveredExpand?.();
          return;
        }
        onClick(e);
      }}
    >
      <GridStatusBadgeContent statusKey={display.key} label={display.label} />
    </button>
  );
}
