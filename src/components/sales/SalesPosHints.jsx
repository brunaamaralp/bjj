import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const HINTS = [
  { keys: 'F1 ou /', label: 'Focar código' },
  { keys: 'F2', label: 'PIX total' },
  { keys: 'F3', label: 'Dinheiro total' },
  { keys: 'F4', label: 'Débito total' },
  { keys: 'Ctrl+Enter', label: 'Concluir venda' },
];

export default function SalesPosHints({ pdvMode = false }) {
  const [open, setOpen] = useState(pdvMode);

  return (
    <details
      className={`sales-pos-hints${pdvMode ? ' sales-pos-hints--pdv' : ''}`}
      open={open}
      onToggle={(e) => setOpen(e.target.open)}
    >
      <summary className="sales-pos-hints__summary">
        <ChevronDown size={14} className="sales-pos-hints__chevron" aria-hidden />
        Atalhos do PDV
      </summary>
      <ul className="sales-pos-hints__list">
        {HINTS.map((h) => (
          <li key={h.keys}>
            <kbd>{h.keys}</kbd>
            <span>{h.label}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
