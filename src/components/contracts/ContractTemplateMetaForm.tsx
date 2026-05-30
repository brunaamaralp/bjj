import React from 'react';
import { Link } from 'react-router-dom';
import FieldError from '../shared/FieldError.jsx';
import { CONTRACT_TEMPLATE_PURPOSE_LABELS } from '../../lib/contractPlanTemplates.js';
import type { ContractTemplatePurpose } from '../../features/contracts/templatesApi.js';

export type ContractTemplateMetaFormProps = {
  name: string;
  description: string;
  purpose: ContractTemplatePurpose;
  purposeLocked?: boolean;
  nameError?: string;
  disabled?: boolean;
  planNames?: string[];
  selectedPlanNames?: string[];
  isDefault?: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPurposeChange: (value: ContractTemplatePurpose) => void;
  onSelectedPlanNamesChange?: (value: string[]) => void;
};

export default function ContractTemplateMetaForm({
  name,
  description,
  purpose,
  purposeLocked = false,
  nameError,
  disabled = false,
  planNames = [],
  selectedPlanNames = [],
  isDefault = false,
  onNameChange,
  onDescriptionChange,
  onPurposeChange,
  onSelectedPlanNamesChange,
}: ContractTemplateMetaFormProps) {
  const purposeLabel = CONTRACT_TEMPLATE_PURPOSE_LABELS[purpose] || 'Matrícula';

  const togglePlan = (planName: string) => {
    if (!onSelectedPlanNamesChange || disabled) return;
    const key = planName.trim().toLowerCase();
    const has = selectedPlanNames.some((n) => n.trim().toLowerCase() === key);
    if (has) {
      onSelectedPlanNamesChange(selectedPlanNames.filter((n) => n.trim().toLowerCase() !== key));
      return;
    }
    onSelectedPlanNamesChange([...selectedPlanNames, planName]);
  };

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

      <fieldset className="form-group contract-template-meta-form__plans">
        <legend className="task-field-label">Planos que usam este modelo</legend>
        {planNames.length === 0 ? (
          <p className="text-small text-muted contract-template-meta-form__plans-hint">
            Nenhum plano cadastrado.{' '}
            <Link to="/financeiro?tab=configuracao" className="edit-link">
              Criar planos no Financeiro
            </Link>
          </p>
        ) : (
          <>
            <p className="text-small text-muted contract-template-meta-form__plans-hint">
              Marque os planos de mensalidade que devem usar este documento de {purposeLabel.toLowerCase()}.
            </p>
            <div className="contract-template-plan-checkboxes">
              {planNames.map((planName) => {
                const checked = selectedPlanNames.some(
                  (n) => n.trim().toLowerCase() === planName.trim().toLowerCase()
                );
                return (
                  <label key={planName} className="contracts-sandbox contract-template-plan-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => togglePlan(planName)}
                    />
                    <span>{planName}</span>
                  </label>
                );
              })}
            </div>
            {isDefault ? (
              <p className="text-small text-muted contract-template-meta-form__default-hint">
                Planos desmarcados usam o modelo padrão de {purposeLabel.toLowerCase()}.
              </p>
            ) : null}
          </>
        )}
      </fieldset>

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
    </div>
  );
}
