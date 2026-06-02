import React from 'react';
import { Info } from 'lucide-react';

/**
 * Tooltip CSS (navi-hint) com ícone Info — glossário financeiro.
 * @param {{ text: string, position?: 'top' | 'bottom' | 'right' | 'left', className?: string }} props
 */
export default function InfoHint({ text, position = 'top', className = '' }) {
  const tip = String(text || '').trim();
  if (!tip) return null;

  return (
    <span
      className={`navi-hint navi-hint--info${className ? ` ${className}` : ''}`}
      data-position={position}
      tabIndex={0}
      aria-label={tip}
    >
      <Info size={14} strokeWidth={2} aria-hidden />
      <span className="navi-hint__bubble" role="tooltip">
        {tip}
      </span>
    </span>
  );
}
