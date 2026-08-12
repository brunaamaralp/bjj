import React from 'react';
import ContractRichTextEditor, { type ContractRichTextEditorHandle } from './ContractRichTextEditor.jsx';
import ContractVariableMenu from './ContractVariableMenu.jsx';
import FieldError from '../shared/FieldError.jsx';

interface ContractTemplateEditorProps {
  bodyHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  bodyError?: string;
}

export default function ContractTemplateEditor({
  bodyHtml,
  onChange,
  disabled = false,
  bodyError,
}: ContractTemplateEditorProps) {
  const richRef = React.useRef<ContractRichTextEditorHandle>(null);

  const handleInsertVariable = (key: string) => {
    richRef.current?.insertVariable(key);
    richRef.current?.focus();
  };

  return (
    <div className="contract-template-editor">
      <p className="contract-template-pdf-notice" role="note">
        O <strong>rodapé de assinaturas</strong> (caixas roxas no final) entra automaticamente no PDF.
        É onde a Autentique posiciona a assinatura digital.
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
  );
}
