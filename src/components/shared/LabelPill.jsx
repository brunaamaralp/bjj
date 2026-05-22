import React from 'react';
import { X } from 'lucide-react';

/**
 * Displays a colored label pill.
 * @param {{ label: { name: string, color: string }, onRemove?: () => void, small?: boolean, showDot?: boolean }} props
 */
const LabelPill = ({ label, onRemove, small = false, showDot = true, fullName = false }) => {
  if (!label) return null;

  const color = String(label.color || '#8E8E8E');
  const size = small ? { fontSize: 11, padding: '2px 7px', gap: 4 } : { fontSize: 12, padding: '3px 9px', gap: 5 };
  const name = String(label.name || '');

  return (
    <span
      className={fullName ? 'label-pill label-pill--full-name' : 'label-pill'}
      title={fullName && name ? name : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size.gap,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
        borderRadius: 20,
        fontSize: size.fontSize,
        padding: size.padding,
        fontWeight: 500,
        lineHeight: 1.3,
        ...(fullName
          ? { maxWidth: 'none', whiteSpace: 'normal', overflow: 'visible' }
          : { whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden' }),
      }}
    >
      {showDot ? (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      ) : null}
      <span className="label-pill__name">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            color: 'inherit',
            opacity: 0.7,
            flexShrink: 0,
          }}
          aria-label={`Remover etiqueta ${label.name}`}
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
};

export default LabelPill;
