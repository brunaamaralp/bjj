import React from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Chip clicável para aplicar sugestão de categoria (nunca preenche automaticamente).
 */
export default function FinanceCategorySuggestionChip({ category, confidence, onApply }) {
  if (!category) return null;

  const pct = Math.round((Number(confidence) || 0) * 100);

  return (
    <div className="finance-category-suggestion">
      <button
        type="button"
        className="finance-category-suggestion__chip"
        onClick={onApply}
        title={`Aplicar categoria sugerida (${pct}% de confiança)`}
      >
        <Sparkles size={14} aria-hidden className="finance-category-suggestion__icon" />
        <span className="finance-category-suggestion__label">Sugestão:</span>
        <span className="finance-category-suggestion__category">{category}</span>
      </button>
    </div>
  );
}
