import React from 'react';
import { Link } from 'react-router-dom';
import { PLAN_CONFIG } from '../../../lib/planConfig';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

const STATUS_BADGE = {
  trial: { label: 'Trial', className: 'billing-status-badge--trial' },
  active: { label: 'Ativa', className: 'billing-status-badge--active' },
  past_due: { label: 'Inadimplente', className: 'billing-status-badge--danger' },
  inactive: { label: 'Inativa', className: 'billing-status-badge--muted' },
  canceled: { label: 'Cancelada', className: 'billing-status-badge--muted' },
  preview: { label: 'Prévia', className: 'billing-status-badge--muted' },
};

export default function SubscriptionStatusCard({ status, onRegularize }) {
  if (!status) return null;

  const planKey = status.plan || status.planSlug || 'starter';
  const plan = PLAN_CONFIG[planKey] || PLAN_CONFIG.starter;
  const badge = STATUS_BADGE[status.status] || STATUS_BADGE.inactive;
  const used = Number(status.aiThreadsUsed) || 0;
  const limit = Number(status.aiThreadsLimit) || plan.threads;

  let headline = '';
  if (status.cancelAtPeriodEnd) {
    headline = `Cancelamento agendado — acesso até ${formatDate(status.currentPeriodEnd)}`;
  } else if (status.status === 'trial') {
    const days = status.trialDaysRemaining;
    headline = days != null
      ? `${days} dia${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'} no teste grátis`
      : 'Período de teste ativo';
  } else if (status.status === 'active') {
    headline = `Plano ${plan.name} · Próxima cobrança ${formatDate(status.currentPeriodEnd)}`;
  } else if (status.status === 'past_due') {
    headline = 'Pagamento em atraso — regularize para manter o acesso completo';
  } else if (status.status === 'preview') {
    headline = 'Cobrança em modo prévia (desativada no ambiente)';
  } else {
    headline = 'Assinatura encerrada — escolha um plano para voltar';
  }

  if (status.pendingPlanSlug && PLAN_CONFIG[status.pendingPlanSlug]) {
    headline += ` · Mudança para ${PLAN_CONFIG[status.pendingPlanSlug].name} no próximo ciclo`;
  }

  return (
    <div className="card billing-status-card" style={{ marginBottom: 20, padding: '20px 24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span className={`billing-status-badge ${badge.className}`}>{badge.label}</span>
        <strong>{plan.name}</strong>
        <span className="navi-subtitle" style={{ margin: 0, fontSize: '0.85rem' }}>
          {used.toLocaleString('pt-BR')} / {limit.toLocaleString('pt-BR')} conversas IA este mês
        </span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '0.92rem', color: 'var(--text-secondary)' }}>{headline}</p>
      {!status.companyTaxOk && status.status !== 'preview' && (
        <p className="billing-status-alert">
          Cadastre CPF/CNPJ em{' '}
          <Link to="/empresa">Configurações da academia</Link>
          {' '}antes de assinar.
        </p>
      )}
      {status.status === 'past_due' && onRegularize && (
        <button type="button" className="btn-primary btn-sm" onClick={onRegularize}>
          Regularizar pagamento
        </button>
      )}
    </div>
  );
}
