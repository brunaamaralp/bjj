import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Settings2 } from 'lucide-react';
import { FINANCEIRO_SECTIONS } from '../../lib/financeiroHubTabs.js';
import './finance.css';

const CONFIG_HREF = `/financeiro?tab=${FINANCEIRO_SECTIONS.CONFIG}`;

/**
 * Aviso em Empresa → Financeiro após migração das configurações para o hub.
 */
export default function FinanceiroMovedNotice({ title = 'Configurações financeiras' }) {
  return (
    <div className="card finance-moved-notice" role="status">
      <h3 className="navi-section-heading finance-moved-notice__title">
        <Settings2 size={18} color="var(--v500)" aria-hidden />
        {title}
      </h3>
      <p className="text-small text-muted finance-moved-notice__text">
        As configurações financeiras foram movidas para{' '}
        <strong>Financeiro → Configuração</strong>.
      </p>
      <Link to={CONFIG_HREF} className="btn-primary finance-moved-notice__cta">
        Abrir Configuração no Financeiro
        <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}
