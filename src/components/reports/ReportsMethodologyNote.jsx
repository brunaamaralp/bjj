import React from 'react';
import { Info } from 'lucide-react';
import './reports.css';

/** Nota colapsável sobre metodologia dos KPIs comparativos de captação. */
export default function ReportsMethodologyNote({ className = '' }) {
  return (
    <details className={['reports-methodology', className].filter(Boolean).join(' ')}>
      <summary className="reports-methodology-summary">
        <Info size={16} aria-hidden />
        Como calculamos
      </summary>
      <div className="reports-methodology-body">
        <p>
          Todos os KPIs comparam o período selecionado contra o período imediatamente anterior de mesma
          duração.
        </p>
        <p>Filtros de origem e perfil são aplicados tanto nos totais quanto nos gráficos de captação.</p>
      </div>
    </details>
  );
}
