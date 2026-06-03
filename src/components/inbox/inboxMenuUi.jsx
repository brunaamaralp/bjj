import React from 'react';
import { DropdownMenuItem } from '../shared/menu';

export function InboxMenuAction({ label, hint, onClick, disabled = false, danger = false, title }) {
  return (
    <DropdownMenuItem
      className="inbox-menu-item"
      disabled={disabled}
      danger={danger}
      title={title}
      onClick={onClick}
    >
      <span>{label}</span>
      {hint ? (
        <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
          {hint}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}
