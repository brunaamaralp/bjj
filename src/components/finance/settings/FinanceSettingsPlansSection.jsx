import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { planTemplateSelectValue, templatesForPurpose } from '../../../lib/contractPlanTemplates.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from '../../../lib/financeiroReceivablesSections.js';
import EmptyState from '../../shared/EmptyState.jsx';

function formatPlanPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$ 0';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function PlanListItem({ pl, idx, expanded, onToggle, onUpdate, onRemove, enrollmentTemplates, rescissionTemplates }) {
  const name = String(pl.name || '').trim() || 'Plano sem nome';
  const priceLabel = formatPlanPrice(pl.price);
  const enrollmentValue = planTemplateSelectValue(pl.contractTemplateId, enrollmentTemplates);
  const rescissionValue = planTemplateSelectValue(pl.rescissionTemplateId, rescissionTemplates);

  return (
    <div className={`finance-settings-plan${expanded ? ' finance-settings-plan--open' : ''}`}>
      <button type="button" className="finance-settings-plan__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="finance-settings-plan__name">{name}</span>
        <span className="finance-settings-plan__price">{priceLabel}</span>
        {expanded ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>
      {expanded ? (
        <div className="finance-settings-plan__body">
          <div className="form-group">
            <label>Nome</label>
            <input
              className="form-input"
              value={pl.name || ''}
              onChange={(e) => onUpdate(idx, { name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Preço (R$)</label>
            <input
              className="form-input"
              type="text"
              inputMode="decimal"
              value={pl.price ?? 0}
              onChange={(e) => {
                const raw = String(e.target.value || '').replace(',', '.');
                const n = parseFloat(raw);
                onUpdate(idx, { price: Number.isFinite(n) ? n : 0 });
              }}
            />
          </div>
          <div className="form-group">
            <label>Descrição</label>
            <input
              className="form-input"
              value={pl.description || ''}
              onChange={(e) => onUpdate(idx, { description: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Repasse taxas de pagamento ao aluno</label>
            <select
              className="form-input"
              value={pl.applyCardFee ? 'sim' : 'nao'}
              onChange={(e) => onUpdate(idx, { applyCardFee: e.target.value === 'sim' })}
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </div>
          {enrollmentTemplates.length > 0 ? (
            <div className="form-group">
              <label>Contrato de matrícula (opcional)</label>
              <select
                className="form-input"
                value={enrollmentValue}
                onChange={(e) => onUpdate(idx, { contractTemplateId: e.target.value || null })}
              >
                <option value="">Nenhum</option>
                {enrollmentTemplates.map((t) => (
                  <option key={t.$id} value={t.$id}>
                    {t.name || t.title || 'Modelo'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {rescissionTemplates.length > 0 ? (
            <div className="form-group">
              <label>Termo de rescisão (opcional)</label>
              <select
                className="form-input"
                value={rescissionValue}
                onChange={(e) => onUpdate(idx, { rescissionTemplateId: e.target.value || null })}
              >
                <option value="">Nenhum</option>
                {rescissionTemplates.map((t) => (
                  <option key={t.$id} value={t.$id}>
                    {t.name || t.title || 'Modelo'}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="button" className="btn-outline btn-sm finance-settings-plan__remove" onClick={() => onRemove(idx)}>
            <Trash2 size={14} aria-hidden />
            Remover plano
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function FinanceSettingsPlansSection({
  financeConfig,
  contractTemplates,
  contractTemplatesConfigured,
  rescissionTemplates,
  runEnsureContractSetup,
  ensureContractSetup,
  onUpdate,
  onAdd,
  onRemoveRequest,
}) {
  const [expandedIdx, setExpandedIdx] = useState(null);
  const plans = financeConfig.plans || [];
  const enrollmentTemplates = templatesForPurpose(contractTemplates, 'enrollment');

  return (
    <div className="finance-settings-section-body">
      <p className="finance-settings-lead">
        Usados em Mensalidades e matrícula. O <strong>dia de vencimento</strong> é definido no cadastro de
        cada aluno (campo &quot;Vence dia&quot;), não no plano — a cobrança mensal usa o <strong>preço</strong>{' '}
        do plano por mês de referência. Contratos são opcionais; vincule em{' '}
        <Link to="/empresa?tab=financeiro&section=contratos" className="edit-link">
          Contratos
        </Link>
        .
      </p>

      {contractTemplatesConfigured && rescissionTemplates.length === 0 ? (
        <div className="finance-config-setup-banner card">
          <p className="text-small text-muted">
            Falta o termo de rescisão padrão. Gere modelos em Contratos quando quiser usar rescisão automática.
          </p>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={ensureContractSetup.isPending}
            onClick={() => void runEnsureContractSetup({ showToast: true })}
          >
            {ensureContractSetup.isPending ? 'Configurando…' : 'Configurar contratos'}
          </button>
        </div>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          title="Nenhum plano cadastrado"
          description="Crie planos para usar na matrícula e nas mensalidades."
          primaryAction={{ label: 'Adicionar plano', onClick: onAdd }}
        />
      ) : (
        <div className="finance-settings-plan-list card">
          {plans.map((pl, idx) => (
            <React.Fragment key={`plan-${idx}`}>
              {idx > 0 ? <div className="finance-settings-group__sep" aria-hidden /> : null}
              <PlanListItem
                pl={pl}
                idx={idx}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx((cur) => (cur === idx ? null : idx))}
                onUpdate={onUpdate}
                onRemove={onRemoveRequest}
                enrollmentTemplates={enrollmentTemplates}
                rescissionTemplates={rescissionTemplates}
              />
            </React.Fragment>
          ))}
        </div>
      )}

      {plans.length > 0 ? (
        <button type="button" className="finance-settings-add-row edit-link" onClick={onAdd}>
          <Plus size={16} aria-hidden />
          Adicionar plano
        </button>
      ) : null}

      <Link
        to={buildReceivablesPath({ section: RECEIVABLES_SECTIONS.MENSALIDADES })}
        className="finance-config-context-link"
      >
        Ver em Mensalidades →
      </Link>
    </div>
  );
}
