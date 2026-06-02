import React from 'react';
import InfoHint from '../shared/InfoHint.jsx';

/** Rótulo inline com ícone Info + tooltip (sem texto longo na página). */
export default function FinanceLabelWithHint({ children, hint, className = '' }) {
  if (!children) return null;
  return (
    <span className={`finance-label-with-hint${className ? ` ${className}` : ''}`}>
      <span>{children}</span>
      {hint ? <InfoHint text={hint} position="top" /> : null}
    </span>
  );
}
