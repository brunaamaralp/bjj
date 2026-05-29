import React from 'react';
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
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPurposeChange: (value: ContractTemplatePurpose) => void;
};

export default function ContractTemplateMetaForm({
  name,
  description,
  purpose,
  purposeLocked = false,
  nameError,
  disabled = false,
  onNameChange,
  onDescriptionChange,
  onPurposeChange,
}: ContractTemplateMetaFormProps) {
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
    </div>
  );
}
