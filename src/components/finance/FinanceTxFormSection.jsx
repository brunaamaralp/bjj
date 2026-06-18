import React from 'react';
import { ChevronDown } from 'lucide-react';

/** Seção colapsável do formulário de lançamento (Pagamento, Detalhes opcionais). */
export default function FinanceTxFormSection({ id, title, open, onToggle, children }) {
  return (
    <div className="finance-tx-form-section">
      <button
        type="button"
        id={`${id}-toggle`}
        className="finance-tx-form-section__toggle"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
      >
        <span>{title}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`finance-tx-form-section__chevron${open ? ' finance-tx-form-section__chevron--open' : ''}`}
        />
      </button>
      {open ? (
        <div id={`${id}-panel`} className="finance-tx-form-section__body flex-col gap-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
