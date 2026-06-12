import '../styles/modal-shell-variants.css';
import React, { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { COLLECTION_RESULT_OPTIONS } from '../lib/collectionRules.js';
import { useModalA11y } from '../hooks/useModalA11y.js';

export default function CollectionResultModal({ open, stageLabel, onCancel, onConfirm, saving }) {
  const [result, setResult] = useState('no_response');
  const [notes, setNotes] = useState('');

  const requestClose = useCallback(() => {
    if (saving) return;
    onCancel();
  }, [saving, onCancel]);

  useModalA11y({ isOpen: open, onClose: requestClose });

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={requestClose}
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-result-title"
        style={{ maxWidth: 420, width: '100%', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 id="collection-result-title" style={{ margin: 0, fontSize: 16 }}>
            Qual foi o resultado?
          </h3>
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {stageLabel ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Etapa: {stageLabel}</p>
        ) : null}
        <div className="flex-col" style={{ gap: 8, marginBottom: 12 }}>
          {COLLECTION_RESULT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                border: '0.5px solid var(--border-light)',
                cursor: 'pointer',
                background: result === opt.value ? 'var(--purple-light, var(--azul-gelo))' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="collection_result"
                value={opt.value}
                checked={result === opt.value}
                onChange={() => setResult(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="form-group">
          <label>Observações (opcional)</label>
          <textarea
            className="form-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalhes do contato"
          />
        </div>
        <div className="flex gap-2" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn-outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => onConfirm({ result, notes: notes.trim() })}
          >
            {saving ? 'Salvando...' : 'Concluir tarefa'}
          </button>
        </div>
      </div>
    </div>
  );
}
