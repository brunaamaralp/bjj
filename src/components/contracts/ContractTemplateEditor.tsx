import React, { useMemo } from 'react';
import { FileSignature } from 'lucide-react';
import ContractRichTextEditor, { type ContractRichTextEditorHandle } from './ContractRichTextEditor.jsx';
import ContractVariableMenu from './ContractVariableMenu.jsx';
import FieldError from '../shared/FieldError.jsx';
import {
  ensureContractSignatureFooter,
  hasContractSignatureFooter,
} from '../../lib/contractSignatureFooter.js';

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
  const hasFooter = useMemo(() => hasContractSignatureFooter(bodyHtml), [bodyHtml]);

  const handleInsertVariable = (key: string) => {
    richRef.current?.insertVariable(key);
    richRef.current?.focus();
  };

  const handleInsertFooter = () => {
    const { html } = ensureContractSignatureFooter(bodyHtml);
    onChange(html);
  };

  return (
    <div className="contract-template-editor">
      <p className="contract-template-pdf-notice" role="note">
        No final do texto, use o <strong>rodapé de assinaturas</strong> (caixas roxas tracejadas). É ali
        que a Autentique coloca a assinatura digital no PDF — no envio, as caixas viram linhas normais.
      </p>

      {!hasFooter ? (
        <div className="contract-template-footer-banner">
          <p className="text-small text-muted contract-template-footer-banner__text">
            Este modelo ainda não tem o rodapé padrão de assinaturas.
          </p>
          <button
            type="button"
            className="btn-outline text-small"
            disabled={disabled}
            onClick={handleInsertFooter}
          >
            <FileSignature size={14} aria-hidden />
            Inserir rodapé de assinaturas
          </button>
        </div>
      ) : null}

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
