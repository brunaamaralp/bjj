import React, { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef, type ReactNode } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  RemoveFormatting,
  Code,
  Eye,
} from 'lucide-react';

type EditorMode = 'visual' | 'source';

export type ContractRichTextEditorHandle = {
  insertVariable: (key: string) => void;
  focus: () => void;
};

interface ContractRichTextEditorProps {
  bodyHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  toolbarExtra?: ReactNode;
}

const ContractRichTextEditor = forwardRef<ContractRichTextEditorHandle, ContractRichTextEditorProps>(
  function ContractRichTextEditor({ bodyHtml, onChange, disabled = false, toolbarExtra }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const sourceRef = useRef<HTMLTextAreaElement>(null);
    const syncingRef = useRef(false);
    const lastEmittedRef = useRef(bodyHtml);
    const [mode, setMode] = useState<EditorMode>('visual');
    const [sourceDraft, setSourceDraft] = useState(bodyHtml);

    useEffect(() => {
      if (bodyHtml === lastEmittedRef.current) return;
      lastEmittedRef.current = bodyHtml;
      if (mode === 'visual') {
        const el = editorRef.current;
        if (el && el.innerHTML !== bodyHtml) {
          el.innerHTML = bodyHtml || '';
        }
      } else {
        setSourceDraft(bodyHtml || '');
      }
    }, [bodyHtml, mode]);

    const commitHtml = useCallback(
      (html: string) => {
        lastEmittedRef.current = html;
        syncingRef.current = true;
        onChange(html);
        requestAnimationFrame(() => {
          syncingRef.current = false;
        });
      },
      [onChange]
    );

    const emitChange = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      commitHtml(el.innerHTML);
    }, [commitHtml]);

    const handleSourceChange = useCallback(
      (value: string) => {
        setSourceDraft(value);
        commitHtml(value);
      },
      [commitHtml]
    );

    const switchToVisual = useCallback(() => {
      const html = sourceDraft;
      lastEmittedRef.current = html;
      syncingRef.current = true;
      if (editorRef.current) {
        editorRef.current.innerHTML = html;
      }
      setMode('visual');
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    }, [sourceDraft]);

    const switchToSource = useCallback(() => {
      const html = editorRef.current?.innerHTML ?? bodyHtml;
      setSourceDraft(html);
      setMode('source');
    }, [bodyHtml]);

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
        if (mode === 'source') {
          const ta = sourceRef.current;
          if (!ta) return;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const next = `${sourceDraft.slice(0, start)}${token}${sourceDraft.slice(end)}`;
          handleSourceChange(next);
          requestAnimationFrame(() => {
            ta.focus();
            const pos = start + token.length;
            ta.setSelectionRange(pos, pos);
          });
          return;
        }
        editorRef.current?.focus();
        try {
          document.execCommand('insertText', false, token);
        } catch {
          const el = editorRef.current;
          if (el) el.innerHTML = `${el.innerHTML}${token}`;
        }
        emitChange();
      },
      [disabled, emitChange, handleSourceChange, mode, sourceDraft]
    );

    useImperativeHandle(
      ref,
      () => ({
        insertVariable,
        focus: () => {
          if (mode === 'source') {
            sourceRef.current?.focus();
          } else {
            editorRef.current?.focus();
          }
        },
      }),
      [insertVariable, mode]
    );

    return (
      <div className="contract-rich-editor">
        <div className="contract-rich-editor-toolbar" role="toolbar" aria-label="Formatação do texto">
          {mode === 'visual' ? (
            <>
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
            </>
          ) : null}

          {toolbarExtra ? (
            <>
              {mode === 'visual' ? <span className="contract-rich-editor-sep" aria-hidden /> : null}
              {toolbarExtra}
            </>
          ) : null}

          <span className="contract-rich-editor-toolbar-spacer" aria-hidden />

          <div className="contract-rich-editor-mode-toggle" role="group" aria-label="Modo de edição">
            <button
              type="button"
              className={`contract-rich-editor-btn${mode === 'visual' ? ' contract-rich-editor-btn--active' : ''}`}
              title="Editor visual"
              disabled={disabled}
              aria-pressed={mode === 'visual'}
              onClick={() => {
                if (mode !== 'visual') switchToVisual();
              }}
            >
              <Eye size={16} aria-hidden />
              <span className="contract-rich-editor-btn-label">Visual</span>
            </button>
            <button
              type="button"
              className={`contract-rich-editor-btn${mode === 'source' ? ' contract-rich-editor-btn--active' : ''}`}
              title="Código HTML"
              disabled={disabled}
              aria-pressed={mode === 'source'}
              onClick={() => {
                if (mode !== 'source') switchToSource();
              }}
            >
              <Code size={16} aria-hidden />
              <span className="contract-rich-editor-btn-label">HTML</span>
            </button>
          </div>
        </div>

        {mode === 'visual' ? (
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
        ) : (
          <textarea
            ref={sourceRef}
            className="contract-rich-editor-source"
            value={sourceDraft}
            onChange={(e) => handleSourceChange(e.target.value)}
            disabled={disabled}
            spellCheck={false}
            aria-label="Código HTML do contrato"
            placeholder="<p>Escreva o HTML do contrato aqui…</p>"
          />
        )}
      </div>
    );
  }
);

export default ContractRichTextEditor;
