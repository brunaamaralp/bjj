import React from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

export default function BalanceDeltaBadge({ delta, compareLabel = 'vs mês anterior', className = '' }) {
  if (!delta) return null;

  if (delta.type === 'text') {
    return (
      <span className={`finance-balance-delta finance-balance-delta--text text-small text-muted ${className}`.trim()}>
        {delta.text}
      </span>
    );
  }

  const positive = delta.pct >= 0;
  return (
    <span
      className={[
        'finance-balance-delta',
        'finance-balance-delta--pct',
        positive ? 'finance-balance-delta--up' : 'finance-balance-delta--down',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {positive ? (
        <TrendingUp size={12} className="finance-balance-delta__icon" aria-hidden />
      ) : (
        <TrendingDown size={12} className="finance-balance-delta__icon" aria-hidden />
      )}
      {positive ? '+' : ''}
      {delta.pct}% {compareLabel}
    </span>
  );
}
