import React from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Tooltip CSS puro (sem biblioteca externa).
 * @param {{ text: string, position?: 'top' | 'bottom' | 'right', className?: string }} props
 */
export default function Hint({ text, position = 'top', className = '' }) {
  const tip = String(text || '').trim();
  if (!tip) return null;

  return (
    <span
      className={`navi-hint${className ? ` ${className}` : ''}`}
      data-position={position}
      tabIndex={0}
      aria-label={tip}
    >
      <HelpCircle size={14} strokeWidth={2} aria-hidden />
      <span className="navi-hint__bubble" role="tooltip">
        {tip}
      </span>
    </span>
  );
}
