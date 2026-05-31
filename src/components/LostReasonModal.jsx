import React, { useState, useEffect } from 'react';
import ModalShell from './shared/ModalShell.jsx';

const LOST_REASONS = [
  'Preço',
  'Sem tempo',
  'Não responde',
  'Não compareceu e sumiu',
  'Outro',
];

export function LostReasonModal({ leadName, onConfirm, onCancel }) {
  const [selected, setSelected] = useState('');
  const [outro, setOutro] = useState('');

  const motivo = selected === 'Outro' ? outro.trim() : selected;
  const canConfirm = Boolean(selected && (selected !== 'Outro' || outro.trim()));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <ModalShell open={true} title="Mover para Perdidos" onClose={onCancel} maxWidth={400}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Qual o motivo da perda de <strong>{leadName}</strong>?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {LOST_REASONS.map((reason) => (
            <label
              key={reason}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                border: `0.5px solid ${selected === reason ? 'var(--v500)' : 'var(--border-violet)'}`,
                background: selected === reason ? 'var(--v50)' : 'var(--surface)',
                transition: 'background 150ms ease, border-color 150ms ease',
              }}
            >
              <input
                type="radio"
                name="lostReason"
                value={reason}
                checked={selected === reason}
                onChange={() => setSelected(reason)}
                style={{ accentColor: 'var(--v500)' }}
              />
              <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: selected === reason ? 500 : 400 }}>{reason}</span>
            </label>
          ))}
        </div>

        {selected === 'Outro' && (
          <input
            type="text"
            placeholder="Descreva o motivo..."
            value={outro}
            onChange={(e) => setOutro(e.target.value)}
            autoFocus
            className="form-input"
          />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-outline" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => canConfirm && onConfirm(motivo)}
            disabled={!canConfirm}
          >
            Confirmar perda
          </button>
        </div>
    </ModalShell>
  );
}
