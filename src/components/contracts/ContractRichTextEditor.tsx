import React, { useCallback, useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  RemoveFormatting,
} from 'lucide-react';

export type ContractRichTextEditorHandle = {
  insertVariable: (key: string) => void;
  focus: () => void;
};

interface ContractRichTextEditorProps {
  bodyHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

const ContractRichTextEditor = forwardRef<ContractRichTextEditorHandle, ContractRichTextEditorProps>(
  function ContractRichTextEditor({ bodyHtml, onChange, disabled = false }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const syncingRef = useRef(false);

    useEffect(() => {
      const el = editorRef.current;
      if (!el || syncingRef.current) return;
      if (el.innerHTML !== bodyHtml) {
        el.innerHTML = bodyHtml || '';
      }
    }, [bodyHtml]);

    const emitChange = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      syncingRef.current = true;
      onChange(el.innerHTML);
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    }, [onChange]);

    const exec = useCallback(
      (command: string, value?: string) => {
        if (disabled) return;
        editorRef.current?.focus();
        try {
          document.execCommand(command, false, value);
        } catch {
          void 0;
        }
        emitChange();
      },
      [disabled, emitChange]
    );

    const insertVariable = useCallback(
      (key: string) => {
        if (disabled) return;
        const token = `{{${key}}}`;
        editorRef.current?.focus();
        try {
          document.execCommand('insertText', false, token);
        } catch {
          const el = editorRef.current;
          if (el) el.innerHTML = `${el.innerHTML}${token}`;
        }
        emitChange();
      },
      [disabled, emitChange]
    );

    useImperativeHandle(
      ref,
      () => ({
        insertVariable,
        focus: () => editorRef.current?.focus(),
      }),
      [insertVariable]
    );

    return (
      <div className="contract-rich-editor">
        <div className="contract-rich-editor-toolbar" role="toolbar" aria-label="Formatação do texto">
          <button type="button" className="contract-rich-editor-btn" title="Negrito" disabled={disabled} onClick={() => exec('bold')}>
            <Bold size={16} aria-hidden />
          </button>
          <button type="button" className="contract-rich-editor-btn" title="Itálico" disabled={disabled} onClick={() => exec('italic')}>
            <Italic size={16} aria-hidden />
          </button>
          <button type="button" className="contract-rich-editor-btn" title="Sublinhado" disabled={disabled} onClick={() => exec('underline')}>
            <Underline size={16} aria-hidden />
          </button>
          <span className="contract-rich-editor-sep" aria-hidden />
          <button type="button" className="contract-rich-editor-btn" title="Título 1" disabled={disabled} onClick={() => exec('formatBlock', 'h1')}>
            <Heading1 size={16} aria-hidden />
          </button>
          <button type="button" className="contract-rich-editor-btn" title="Título 2" disabled={disabled} onClick={() => exec('formatBlock', 'h2')}>
            <Heading2 size={16} aria-hidden />
          </button>
          <button type="button" className="contract-rich-editor-btn" title="Parágrafo" disabled={disabled} onClick={() => exec('formatBlock', 'p')}>
            P
          </button>
          <span className="contract-rich-editor-sep" aria-hidden />
          <button type="button" className="contract-rich-editor-btn" title="Lista com marcadores" disabled={disabled} onClick={() => exec('insertUnorderedList')}>
            <List size={16} aria-hidden />
          </button>
          <button type="button" className="contract-rich-editor-btn" title="Lista numerada" disabled={disabled} onClick={() => exec('insertOrderedList')}>
            <ListOrdered size={16} aria-hidden />
          </button>
          <span className="contract-rich-editor-sep" aria-hidden />
          <button type="button" className="contract-rich-editor-btn" title="Remover formatação" disabled={disabled} onClick={() => exec('removeFormat')}>
            <RemoveFormatting size={16} aria-hidden />
          </button>
        </div>

        <div
          ref={editorRef}
          className="contract-rich-editor-surface"
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder="Escreva o contrato aqui…"
          onInput={emitChange}
          onBlur={emitChange}
        />
      </div>
    );
  }
);

export default ContractRichTextEditor;
