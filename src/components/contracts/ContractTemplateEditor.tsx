import React, { useMemo, useRef, useState } from 'react';
import {
  CONTRACT_TEMPLATE_VARIABLES,
  CONTRACT_VARIABLE_GROUPS,
  mergeContractTemplateHtml,
} from '../../lib/contractTemplateVariables.js';
import ContractRichTextEditor, { type ContractRichTextEditorHandle } from './ContractRichTextEditor.jsx';
import FieldError from '../shared/FieldError.jsx';

interface ContractTemplateEditorProps {
  bodyHtml: string;
  onChange: (html: string) => void;
  previewVars?: Record<string, string>;
  disabled?: boolean;
  bodyError?: string;
}

export default function ContractTemplateEditor({
  bodyHtml,
  onChange,
  previewVars,
  disabled = false,
  bodyError,
}: ContractTemplateEditorProps) {
  const richRef = useRef<ContractRichTextEditorHandle>(null);
  const [varQuery, setVarQuery] = useState('');

  const previewHtml = useMemo(() => {
    if (!previewVars) return null;
    return mergeContractTemplateHtml(bodyHtml, previewVars);
  }, [bodyHtml, previewVars]);

  const normalizedQuery = varQuery.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return CONTRACT_VARIABLE_GROUPS.map((group) => {
      const items = CONTRACT_TEMPLATE_VARIABLES.filter((v) => {
        if (v.group !== group.id) return false;
        if (!normalizedQuery) return true;
        const hay = `${v.label} ${v.key}`.toLowerCase();
        return hay.includes(normalizedQuery);
      });
      return { ...group, items };
    }).filter((g) => g.items.length > 0);
  }, [normalizedQuery]);

  return (
    <div className="contract-template-editor">
      <div className="contract-template-editor-content">
        <p className="contract-template-pdf-notice" role="note">
          O PDF da Autentique é gerado em texto simples. A formatação abaixo ajuda a editar com
          clareza; nem todo estilo aparece no documento final.
        </p>

        <ContractRichTextEditor
          ref={richRef}
          bodyHtml={bodyHtml}
          onChange={onChange}
          disabled={disabled}
        />
        {bodyError ? <FieldError>{bodyError}</FieldError> : null}

        <details className="contract-template-vars-details">
          <summary className="contract-template-vars-details__summary">
            Inserir dados do aluno
          </summary>
          <div className="contract-template-vars-details__body">
            <label className="task-field-label" htmlFor="contract-template-var-search">
              Buscar campo
            </label>
            <input
              id="contract-template-var-search"
              type="search"
              className="form-input contract-template-var-search"
              value={varQuery}
              onChange={(e) => setVarQuery(e.target.value)}
              placeholder="Ex.: CPF, plano, responsável…"
              disabled={disabled}
            />
            {filteredGroups.length === 0 ? (
              <p className="text-small text-muted">Nenhum campo encontrado.</p>
            ) : (
              <div className="contract-template-editor-vars">
                {filteredGroups.map((group) => (
                  <div className="contract-template-editor-var-group" key={group.id}>
                    <span className="contract-template-editor-var-group-label">{group.label}</span>
                    <div className="contract-template-editor-var-group-btns">
                      {group.items.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          className="btn-outline text-small"
                          disabled={disabled}
                          onClick={() => richRef.current?.insertVariable(v.key)}
                          title={`Inserir {{${v.key}}}`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-small text-muted contract-template-editor-hint">
              Clique em um campo para inserir no cursor. Os valores vêm do cadastro do aluno ao
              enviar o contrato.
            </p>
          </div>
        </details>
      </div>

      {previewHtml != null ? (
        <aside className="contract-template-preview card" aria-label="Pré-visualização do contrato">
          <p className="task-field-label contract-template-preview__title">Como o aluno verá (exemplo)</p>
          <p className="text-small text-muted contract-template-preview__subtitle">
            Dados de exemplo — no envio real entram do cadastro.
          </p>
          <div
            className="contract-template-preview-body"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </aside>
      ) : null}
    </div>
  );
}
