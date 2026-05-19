import React, { useMemo, useRef } from 'react';
import {
  CONTRACT_TEMPLATE_VARIABLES,
  mergeContractTemplateHtml,
} from '../../lib/contractTemplateVariables.js';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const el = textareaRef.current;
    if (!el) {
      onChange(`${bodyHtml}${token}`);
      return;
    }
    const start = el.selectionStart ?? bodyHtml.length;
    const end = el.selectionEnd ?? start;
    const next = bodyHtml.slice(0, start) + token + bodyHtml.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const previewHtml = useMemo(() => {
    if (!previewVars) return null;
    return mergeContractTemplateHtml(bodyHtml, previewVars);
  }, [bodyHtml, previewVars]);

  return (
    <div className="contract-template-editor">
      <div className="contract-template-editor-vars">
        <span className="task-field-label" style={{ marginRight: 8 }}>
          Variáveis:
        </span>
        {CONTRACT_TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            className="btn-outline text-small"
            disabled={disabled}
            onClick={() => insertVariable(v.key)}
            title={`Inserir {{${v.key}}}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        className="form-input contract-template-editor-textarea"
        value={bodyHtml}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={16}
        spellCheck
        placeholder="Escreva o contrato em HTML simples (títulos, parágrafos, negrito)…"
      />

      <p className="text-small text-muted" style={{ marginTop: 8 }}>
        Use HTML básico: &lt;h1&gt;, &lt;p&gt;, &lt;strong&gt;. As variáveis são substituídas ao enviar o
        contrato.
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
