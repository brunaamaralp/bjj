import React from 'react';
import { Link } from 'react-router-dom';
import FieldError from '../shared/FieldError.jsx';
import {
  CONTRACT_TEMPLATE_PURPOSE_LABELS,
  plansUsingTemplate,
} from '../../lib/contractPlanTemplates.js';
import type { ContractTemplatePurpose } from '../../features/contracts/templatesApi.js';

export type ContractTemplateMetaFormProps = {
  name: string;
  description: string;
  purpose: ContractTemplatePurpose;
  purposeLocked?: boolean;
  isDefault: boolean;
  financeConfig: { plans?: Array<Record<string, unknown>> } | null;
  editingTemplateId?: string | null;
  nameError?: string;
  disabled?: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPurposeChange: (value: ContractTemplatePurpose) => void;
  onIsDefaultChange: (checked: boolean) => void;
};

export default function ContractTemplateMetaForm({
  name,
  description,
  purpose,
  purposeLocked = false,
  isDefault,
  financeConfig,
  editingTemplateId,
  nameError,
  disabled = false,
  onNameChange,
  onDescriptionChange,
  onPurposeChange,
  onIsDefaultChange,
}: ContractTemplateMetaFormProps) {
  const enrollmentPlans = editingTemplateId
    ? plansUsingTemplate(financeConfig, editingTemplateId, 'contractTemplateId')
    : [];
  const rescissionPlans = editingTemplateId
    ? plansUsingTemplate(financeConfig, editingTemplateId, 'rescissionTemplateId')
    : [];
  const linkedPlans = purpose === 'rescission' ? rescissionPlans : enrollmentPlans;

  const defaultHint =
    purpose === 'rescission'
      ? 'Usado quando o aluno não tem plano ou o plano não tem termo de rescisão no Financeiro.'
      : 'Usado quando o aluno não tem plano ou o plano não tem contrato de matrícula no Financeiro.';

  return (
    <div className="contract-template-meta-form">
      <div className="form-group">
        <label className="task-field-label" htmlFor="contract-template-name">
          Nome <span className="task-field-required">*</span>
        </label>
        <input
          id="contract-template-name"
          className="form-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={purpose === 'rescission' ? 'Ex.: Termo de rescisão padrão' : 'Ex.: Matrícula padrão'}
          disabled={disabled}
          aria-invalid={nameError ? 'true' : undefined}
          aria-describedby={nameError ? 'contract-template-name-error' : undefined}
        />
        {nameError ? (
          <FieldError id="contract-template-name-error">{nameError}</FieldError>
        ) : null}
      </div>

      <div className="form-group">
        <span className="task-field-label">Tipo de documento</span>
        <div className="contract-template-purpose-radios" role="radiogroup" aria-label="Tipo de documento">
          {(['enrollment', 'rescission'] as const).map((p) => (
            <label key={p} className="contracts-sandbox">
              <input
                type="radio"
                name="contract-template-purpose"
                value={p}
                checked={purpose === p}
                disabled={disabled || purposeLocked}
                onChange={() => onPurposeChange(p)}
              />
              <span>{CONTRACT_TEMPLATE_PURPOSE_LABELS[p]}</span>
            </label>
          ))}
        </div>
        {purposeLocked ? (
          <p className="text-small text-muted">O tipo não pode ser alterado após criar o modelo.</p>
        ) : null}
      </div>

      <div className="form-group">
        <label className="task-field-label" htmlFor="contract-template-description">
          Descrição (opcional)
        </label>
        <input
          id="contract-template-description"
          className="form-input"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Uso interno — não aparece no contrato"
          disabled={disabled}
        />
      </div>

      {editingTemplateId ? (
        <div className="contract-template-meta-form__plans-readonly">
          <span className="task-field-label">Planos no Financeiro</span>
          {linkedPlans.length > 0 ? (
            <p className="text-small text-muted">{linkedPlans.join(' · ')}</p>
          ) : (
            <p className="text-small text-muted">Nenhum plano usa este modelo ainda.</p>
          )}
          <p className="text-small text-muted">
            Configure em{' '}
            <Link to="/financeiro?tab=configuracao" className="edit-link">
              Financeiro → Planos
            </Link>
            .
          </p>
        </div>
      ) : (
        <p className="text-small text-muted contract-template-meta-form__plans-hint">
          Depois de salvar, vincule este modelo aos planos em{' '}
          <Link to="/financeiro?tab=configuracao" className="edit-link">
            Financeiro → Planos
          </Link>
          .
        </p>
      )}

      <label className="contracts-sandbox">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => onIsDefaultChange(e.target.checked)}
          disabled={disabled}
        />
        <span>
          Usar como padrão de {CONTRACT_TEMPLATE_PURPOSE_LABELS[purpose].toLowerCase()}
        </span>
      </label>
      <p className="text-small text-muted contract-template-meta-form__default-hint">{defaultHint}</p>
    </div>
  );
}
