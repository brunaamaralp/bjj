import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Loader2, Pencil } from 'lucide-react';
import FieldError from '../shared/FieldError.jsx';

function valuesEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a ?? '').trim() === String(b ?? '').trim();
}

/**
 * Campo de perfil com edição inline (dblclick desktop / tap mobile).
 */
export default function ProfileInlineField({
  label,
  displayValue,
  empty = false,
  canEdit = true,
  editable = true,
  fieldId: fieldIdProp,
  inputType = 'text',
  inputMode,
  autoComplete,
  placeholder,
  editValue,
  onSave,
  renderEditor,
  className = '',
  layout = 'row',
  multiline = false,
  minHeight,
  ariaLabel,
}) {
  const autoId = useId();
  const fieldId = fieldIdProp || autoId;
  const inputRef = useRef(null);
  const rowRef = useRef(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [touchUi, setTouchUi] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setTouchUi(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!editing) setDraft(editValue);
  }, [editValue, editing]);

  useEffect(() => {
    if (!editing) return undefined;
    const t = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      if (typeof el.select === 'function' && inputType !== 'date') {
        try {
          el.select();
        } catch {
          /* ignore */
        }
      }
    });
    return () => cancelAnimationFrame(t);
  }, [editing, inputType]);

  const cancelEdit = useCallback(() => {
    setDraft(editValue);
    setError('');
    setEditing(false);
  }, [editValue]);

  const commitEdit = useCallback(
    async (overrideValue) => {
      if (saving) return;
      const nextValue = overrideValue !== undefined ? overrideValue : draft;
      if (valuesEqual(nextValue, editValue)) {
        setEditing(false);
        setError('');
        return;
      }
      setSaving(true);
      setError('');
      try {
        await onSave(nextValue);
        setEditing(false);
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 1600);
      } catch (e) {
        setError(String(e?.message || 'Não foi possível salvar.'));
      } finally {
        setSaving(false);
      }
    },
    [draft, editValue, onSave, saving]
  );

  const startEdit = useCallback(() => {
    if (!canEdit || !editable || saving) return;
    setDraft(editValue);
    setError('');
    setEditing(true);
  }, [canEdit, editable, editValue, saving]);

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
        return;
      }
      if (e.key === 'Enter' && !multiline && !e.shiftKey) {
        e.preventDefault();
        void commitEdit();
      }
    },
    [cancelEdit, commitEdit, multiline]
  );

  const onRowClick = useCallback(
    (e) => {
      if (!canEdit || !editable || editing) return;
      if (e.target.closest('button, a, input, select, textarea, label')) return;
      if (touchUi) startEdit();
    },
    [canEdit, editable, editing, startEdit, touchUi]
  );

  const onRowDoubleClick = useCallback(
    (e) => {
      if (!canEdit || !editable || editing || touchUi) return;
      if (e.target.closest('button, a')) return;
      startEdit();
    },
    [canEdit, editable, editing, startEdit, touchUi]
  );

  const showEditAffordance = canEdit && editable && !editing;
  const rowClass = [
    'profile-inline-field',
    `profile-inline-field--${layout}`,
    editing ? 'profile-inline-field--editing' : '',
    savedFlash ? 'profile-inline-field--saved' : '',
    !canEdit || !editable ? 'profile-inline-field--readonly' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const valueText = empty ? '—' : displayValue;
  const valueClass = `profile-inline-field__value${empty ? ' profile-inline-field__value--empty' : ''}`;

  return (
    <div
      ref={rowRef}
      className={rowClass}
      onClick={onRowClick}
      onDoubleClick={onRowDoubleClick}
      data-editing={editing ? 'true' : 'false'}
    >
      {label ? (
        <span className="profile-inline-field__label" id={`${fieldId}-label`}>
          {label}
        </span>
      ) : null}

      <div className="profile-inline-field__body">
        {editing ? (
          <div className="profile-inline-field__editor">
            {renderEditor ? (
              renderEditor({
                draft,
                setDraft,
                inputRef,
                onKeyDown,
                onBlur: (_e, override) => void commitEdit(override),
                commitEdit,
                cancelEdit,
                disabled: saving,
                fieldId,
              })
            ) : multiline ? (
              <textarea
                ref={inputRef}
                id={fieldId}
                className="profile-inline-field__input profile-inline-field__textarea"
                value={draft ?? ''}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => void commitEdit()}
                disabled={saving}
                rows={3}
                aria-labelledby={label ? `${fieldId}-label` : undefined}
                aria-invalid={error ? true : undefined}
                style={minHeight ? { minHeight } : undefined}
              />
            ) : (
              <input
                ref={inputRef}
                id={fieldId}
                type={inputType}
                inputMode={inputMode}
                autoComplete={autoComplete}
                placeholder={placeholder}
                className="profile-inline-field__input"
                value={draft ?? ''}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => void commitEdit()}
                disabled={saving}
                aria-labelledby={label ? `${fieldId}-label` : undefined}
                aria-label={!label ? ariaLabel : undefined}
                aria-invalid={error ? true : undefined}
              />
            )}
            {saving ? (
              <span className="profile-inline-field__status" aria-live="polite">
                <Loader2 size={14} className="profile-inline-field__spinner" aria-hidden />
              </span>
            ) : null}
          </div>
        ) : (
          <div className="profile-inline-field__display">
            <span className={valueClass} aria-label={ariaLabel}>
              {valueText}
            </span>
            {savedFlash ? (
              <Check size={14} className="profile-inline-field__saved-icon" aria-hidden />
            ) : null}
          </div>
        )}

        {error ? (
          <FieldError className="profile-inline-field__error">{error}</FieldError>
        ) : null}
      </div>

      {showEditAffordance ? (
        <button
          type="button"
          className="profile-inline-field__edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            startEdit();
          }}
          aria-label={label ? `Editar ${label}` : 'Editar campo'}
        >
          <Pencil size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
