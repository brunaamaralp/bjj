import React, { useMemo, useRef } from 'react';
import {
  mergeContractTemplateHtml,
} from '../../lib/contractTemplateVariables.js';
import ContractRichTextEditor, { type ContractRichTextEditorHandle } from './ContractRichTextEditor.jsx';
import ContractVariableMenu from './ContractVariableMenu.jsx';
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

  const previewHtml = useMemo(() => {
    if (!previewVars) return null;
    return mergeContractTemplateHtml(bodyHtml, previewVars);
  }, [bodyHtml, previewVars]);

  const handleInsertVariable = (key: string) => {
    richRef.current?.insertVariable(key);
    richRef.current?.focus();
  };

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
          toolbarExtra={
            <ContractVariableMenu onInsert={handleInsertVariable} disabled={disabled} />
          }
        />
        {bodyError ? <FieldError>{bodyError}</FieldError> : null}
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
