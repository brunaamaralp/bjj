import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckSquare } from 'lucide-react';

const PROCESSOS_HREF = '/automacoes?tab=processos';

/**
 * Aviso em Empresa → Tarefas após migração dos templates para Automações → Processos.
 */
export default function ProcessosMovedNotice() {
  return (
    <div
      className="card empresa-section"
      style={{ padding: 16, border: '1px solid var(--border-light)', marginTop: 8, marginBottom: 16 }}
      role="status"
    >
      <h3 className="navi-section-heading flex items-center gap-2" style={{ marginBottom: 8 }}>
        <CheckSquare size={18} color="var(--v500)" aria-hidden />
        Processos automáticos
      </h3>
      <p className="text-small text-muted" style={{ margin: 0, lineHeight: 1.45 }}>
        Os processos foram movidos para <strong>Automações → Processos</strong>.
      </p>
      <Link
        to={PROCESSOS_HREF}
        className="btn-primary"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14 }}
      >
        Abrir Processos em Automações
        <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}
