import React, { useState } from 'react';
import { Tag, Check } from 'lucide-react';
import LabelPill from './LabelPill';
import EmptyState from './EmptyState.jsx';
import { DropdownMenu, DropdownMenuPanel } from './menu';

/**
 * Dropdown for assigning / removing labels on a lead.
 */
const LabelSelector = ({ allLabels = [], selectedIds = [], onChange, disabled = false }) => {
  const [open, setOpen] = useState(false);

  const toggle = (labelId) => {
    const current = Array.isArray(selectedIds) ? selectedIds : [];
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId];
    onChange(next);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} align="start" className="label-selector">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="label-selector__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Tag size={11} /> + Etiqueta
      </button>

      {open ? (
        <DropdownMenuPanel className="label-selector__panel" aria-label="Etiquetas">
          {allLabels.length === 0 ? (
            <div style={{ padding: '6px 10px' }}>
              <EmptyState variant="bare" title="Nenhuma etiqueta disponível." role="status" />
            </div>
          ) : null}
          {allLabels.map((label) => {
            const selected = (Array.isArray(selectedIds) ? selectedIds : []).includes(label.$id);
            return (
              <button
                key={label.$id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected}
                className={`navi-menu__item label-selector__option${selected ? ' navi-menu__item--active label-selector__option--selected' : ''}`}
                onClick={() => toggle(label.$id)}
              >
                <LabelPill label={label} small />
                {selected ? <Check size={13} className="label-selector__check" aria-hidden /> : null}
              </button>
            );
          })}
        </DropdownMenuPanel>
      ) : null}
    </DropdownMenu>
  );
};

export default LabelSelector;
