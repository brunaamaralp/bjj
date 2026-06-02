import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentMonthYm, formatMonthTitleCapitalized, shiftMonthYm } from '../../lib/financeiroOverview.js';

/**
 * Seletor de mês padrão do hub Financeiro (.finance-month-picker).
 * @param {{ value: string, onChange: (ym: string) => void, ariaLabel?: string }} props
 */
export default function FinanceMonthPicker({
  value,
  onChange,
  ariaLabel = 'Selecionar mês de referência',
}) {
  const ym = String(value || currentMonthYm()).trim();
  const isCurrentMonth = ym === currentMonthYm();
  const label = formatMonthTitleCapitalized(ym);

  return (
    <div className="finance-month-picker" aria-label={ariaLabel}>
      <button
        type="button"
        className="finance-month-picker__btn"
        onClick={() => onChange(shiftMonthYm(ym, -1))}
        aria-label="Mês anterior"
      >
        <ChevronLeft size={18} strokeWidth={2} aria-hidden />
      </button>
      <span className="finance-month-picker__label">{label}</span>
      <button
        type="button"
        className="finance-month-picker__btn"
        onClick={() => {
          if (!isCurrentMonth) onChange(shiftMonthYm(ym, 1));
        }}
        disabled={isCurrentMonth}
        aria-label="Próximo mês"
      >
        <ChevronRight size={18} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
