import React, { useState, useEffect, useRef } from 'react';
import { Tag, Check } from 'lucide-react';
import LabelPill from './LabelPill';

/**
 * Dropdown for assigning / removing labels on a lead.
 *
 * @param {{
 *   allLabels: Array<{ $id: string, name: string, color: string }>,
 *   selectedIds: string[],
 *   onChange: (newIds: string[]) => void,
 *   disabled?: boolean,
 * }} props
 */
const LabelSelector = ({ allLabels = [], selectedIds = [], onChange, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (labelId) => {
    const current = Array.isArray(selectedIds) ? selectedIds : [];
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId];
    onChange(next);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 9px',
          fontSize: 12,
          borderRadius: 20,
          border: '1px dashed var(--border)',
          background: 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--text-secondary)',
          fontWeight: 500,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Tag size={11} /> + Etiqueta
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            zIndex: 300,
            minWidth: 190,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            padding: '6px 0',
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {allLabels.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 14px', margin: 0 }}>
              Nenhuma etiqueta disponível.
            </p>
          )}
          {allLabels.map((label) => {
            const selected = (Array.isArray(selectedIds) ? selectedIds : []).includes(label.$id);
            return (
              <button
                key={label.$id}
                type="button"
                onClick={() => toggle(label.$id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 14px',
                  background: selected ? 'var(--accent-light)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <LabelPill label={label} small />
                {selected && <Check size={13} style={{ marginLeft: 'auto', color: 'var(--accent)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LabelSelector;
