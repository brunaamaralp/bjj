import React, { useMemo, useRef } from 'react';
import {
  CONTRACT_TEMPLATE_VARIABLES,
  CONTRACT_VARIABLE_GROUPS,
  mergeContractTemplateHtml,
} from '../../lib/contractTemplateVariables.js';
import ContractRichTextEditor, { type ContractRichTextEditorHandle } from './ContractRichTextEditor.jsx';

interface ContractTemplateEditorProps {
  bodyHtml: string;
  onChange: (html: string) => void;
  previewVars?: Record<string, string>;
  disabled?: boolean;
}

export default function ContractTemplateEditor({
  bodyHtml,
  onChange,
  previewVars,
  disabled = false,
}: ContractTemplateEditorProps) {
  const richRef = useRef<ContractRichTextEditorHandle>(null);

  const previewHtml = useMemo(() => {
    if (!previewVars) return null;
    return mergeContractTemplateHtml(bodyHtml, previewVars);
  }, [bodyHtml, previewVars]);

  return (
    <div className="contract-template-editor">
      <div className="contract-template-editor-vars">
        {CONTRACT_VARIABLE_GROUPS.map((group) => {
          const items = CONTRACT_TEMPLATE_VARIABLES.filter((v) => v.group === group.id);
          if (!items.length) return null;
          return (
            <div className="contract-template-editor-var-group" key={group.id}>
              <span className="contract-template-editor-var-group-label">{group.label}</span>
              <div className="contract-template-editor-var-group-btns">
                {items.map((v) => (
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
          );
        })}
      </div>

      <ContractRichTextEditor ref={richRef} bodyHtml={bodyHtml} onChange={onChange} disabled={disabled} />

      <p className="contract-template-pdf-notice" role="note">
        O PDF final é texto simplificado — negrito, listas e títulos podem não ser preservados.
      </p>
      <p className="text-small text-muted contract-template-editor-hint">
        Use a barra de ferramentas para negrito, itálico, títulos e listas. Clique nas variáveis para
        inserir no cursor. Elas são preenchidas com os dados do aluno ao enviar o contrato.
      </p>

      {previewHtml != null ? (
        <div className="contract-template-preview card" style={{ marginTop: 12, padding: 16 }}>
          <p className="task-field-label" style={{ marginBottom: 8 }}>
            Pré-visualização
          </p>
          <div
            className="contract-template-preview-body"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      ) : null}
    </div>
  );
}
