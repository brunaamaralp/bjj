import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
} from 'react';
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
import { mergeVisualIntoSource, prepareVisualEditorHtml } from '../../lib/contractPreviewHtml.js';

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
    const prevModeRef = useRef<EditorMode>('visual');
    const savedSelectionRef = useRef<Range | null>(null);
    const [mode, setMode] = useState<EditorMode>('visual');
    const [sourceDraft, setSourceDraft] = useState(bodyHtml);

    const hydrateVisualEditor = useCallback((html: string) => {
      const el = editorRef.current;
      if (!el) return;
      el.innerHTML = prepareVisualEditorHtml(html);
    }, []);

    useLayoutEffect(() => {
      const prev = prevModeRef.current;
      prevModeRef.current = mode;

      if (mode !== 'visual') return;

      const shouldHydrate = prev !== 'visual' || !editorRef.current?.innerHTML.trim();
      if (shouldHydrate) {
        hydrateVisualEditor(sourceDraft || bodyHtml);
      }
    }, [mode, sourceDraft, bodyHtml, hydrateVisualEditor]);

    useEffect(() => {
      if (bodyHtml === lastEmittedRef.current) return;
      lastEmittedRef.current = bodyHtml;
      if (mode === 'visual') {
        hydrateVisualEditor(bodyHtml || '');
      } else {
        setSourceDraft(bodyHtml || '');
      }
    }, [bodyHtml, mode, hydrateVisualEditor]);

    const saveVisualSelection = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      savedSelectionRef.current = range.cloneRange();
    }, []);

    const restoreVisualSelection = useCallback(() => {
      const range = savedSelectionRef.current;
      const sel = window.getSelection();
      if (!range || !sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    }, []);

    useEffect(() => {
      if (mode !== 'visual') return;
      const save = () => saveVisualSelection();
      document.addEventListener('selectionchange', save);
      return () => document.removeEventListener('selectionchange', save);
    }, [mode, saveVisualSelection]);

    const handleToolbarMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (mode !== 'visual' || disabled) return;
        if (e.target instanceof Element && e.target.closest('button')) {
          e.preventDefault();
          saveVisualSelection();
        }
      },
      [disabled, mode, saveVisualSelection]
    );

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
      const merged = mergeVisualIntoSource(sourceDraft, el.innerHTML);
      setSourceDraft(merged);
      commitHtml(merged);
    }, [commitHtml, sourceDraft]);

    const refreshVisualHighlights = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const merged = mergeVisualIntoSource(sourceDraft, el.innerHTML);
      const prepared = prepareVisualEditorHtml(merged);
      if (el.innerHTML !== prepared) {
        el.innerHTML = prepared;
      }
    }, [sourceDraft]);

    const handleVisualBlur = useCallback(() => {
      emitChange();
      refreshVisualHighlights();
    }, [emitChange, refreshVisualHighlights]);

    const handleSourceChange = useCallback(
      (value: string) => {
        setSourceDraft(value);
        commitHtml(value);
      },
      [commitHtml]
    );

    const switchToVisual = useCallback(() => {
      setMode('visual');
    }, []);

    const switchToSource = useCallback(() => {
      const el = editorRef.current;
      if (el) {
        const merged = mergeVisualIntoSource(sourceDraft, el.innerHTML);
        setSourceDraft(merged);
        commitHtml(merged);
      }
      setMode('source');
    }, [commitHtml, sourceDraft]);

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
        restoreVisualSelection();
        const highlighted = `<span class="contract-var-token" contenteditable="false" data-contract-var="1">${token}</span>`;
        try {
          document.execCommand('insertHTML', false, highlighted);
        } catch {
          const el = editorRef.current;
          if (el) el.innerHTML = `${el.innerHTML}${highlighted}`;
        }
        emitChange();
      },
      [disabled, emitChange, handleSourceChange, mode, restoreVisualSelection, sourceDraft]
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
        <div
          className="contract-rich-editor-toolbar"
          role="toolbar"
          aria-label="Formatação do texto"
          onMouseDown={handleToolbarMouseDown}
        >
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
            onBlur={handleVisualBlur}
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
