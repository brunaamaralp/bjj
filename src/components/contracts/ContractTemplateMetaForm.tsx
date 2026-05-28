import React from 'react';
import { Link } from 'react-router-dom';
import FieldError from '../shared/FieldError.jsx';

export type ContractTemplateMetaFormProps = {
  name: string;
  description: string;
  selectedPlanNames: string[];
  isDefault: boolean;
  financePlanNames: string[];
  extraPlanNames: string[];
  nameError?: string;
  disabled?: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTogglePlan: (planName: string, checked: boolean) => void;
  onIsDefaultChange: (checked: boolean) => void;
};

export default function ContractTemplateMetaForm({
  name,
  description,
  selectedPlanNames,
  isDefault,
  financePlanNames,
  extraPlanNames,
  nameError,
  disabled = false,
  onNameChange,
  onDescriptionChange,
  onTogglePlan,
  onIsDefaultChange,
}: ContractTemplateMetaFormProps) {
  const selectedSet = new Set(selectedPlanNames.map((p) => p.trim()).filter(Boolean));

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
          placeholder="Ex.: Matrícula padrão"
          disabled={disabled}
          aria-invalid={nameError ? 'true' : undefined}
          aria-describedby={nameError ? 'contract-template-name-error' : undefined}
        />
        {nameError ? (
          <FieldError id="contract-template-name-error">{nameError}</FieldError>
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

      <fieldset className="contract-template-meta-form__plans" disabled={disabled}>
        <legend className="task-field-label">Planos (opcional — fallback)</legend>
        <p className="text-small text-muted contract-template-meta-form__plans-hint">
          Em{' '}
          <Link to="/financeiro?tab=configuracao" className="edit-link">
            Financeiro → Planos
          </Link>{' '}
          você pode escolher este modelo em cada plano. Esse vínculo tem prioridade. Marque aqui só
          planos que ainda não têm modelo definido no Financeiro.
        </p>
        {financePlanNames.length > 0 ? (
          <div className="contract-template-plan-checkboxes" role="group" aria-label="Planos vinculados">
            {financePlanNames.map((planName) => (
              <label key={planName} className="contracts-sandbox contract-template-plan-check">
                <input
                  type="checkbox"
                  checked={selectedSet.has(planName)}
                  onChange={(e) => onTogglePlan(planName, e.target.checked)}
                />
                <span>{planName}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-small text-muted">
            Nenhum plano cadastrado no Financeiro.{' '}
            <Link to="/financeiro?tab=configuracao" className="edit-link">
              Cadastrar planos
            </Link>
          </p>
        )}
        {extraPlanNames.length > 0 ? (
          <div className="contract-template-plan-checkboxes contract-template-plan-checkboxes--extra">
            <p className="text-small text-muted" style={{ margin: '10px 0 6px', width: '100%' }}>
              Vinculados e não encontrados no Financeiro:
            </p>
            {extraPlanNames.map((planName) => (
              <label key={`extra-${planName}`} className="contracts-sandbox contract-template-plan-check">
                <input
                  type="checkbox"
                  checked={selectedSet.has(planName)}
                  onChange={(e) => onTogglePlan(planName, e.target.checked)}
                />
                <span>{planName}</span>
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <label className="contracts-sandbox">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => onIsDefaultChange(e.target.checked)}
          disabled={disabled}
        />
        <span>Usar como modelo padrão</span>
      </label>
      <p className="text-small text-muted contract-template-meta-form__default-hint">
        Usado quando nenhum plano tiver modelo definido no Financeiro.
      </p>
    </div>
  );
}
