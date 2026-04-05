import React, { useState, useEffect } from 'react';

export const LOST_REASONS = [
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
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lost-reason-title"
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 400,
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
          margin: 16,
          boxSizing: 'border-box',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3
          id="lost-reason-title"
          style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--text)', fontWeight: 700 }}
        >
          Mover para Perdidos
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Qual o motivo da perda de <strong>{leadName}</strong>?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
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
                border: `1px solid ${selected === reason ? 'var(--purple)' : 'var(--border)'}`,
                background: selected === reason ? 'var(--purple-light)' : 'transparent',
                transition: 'var(--transition)',
              }}
            >
              <input
                type="radio"
                name="lostReason"
                value={reason}
                checked={selected === reason}
                onChange={() => setSelected(reason)}
                style={{ accentColor: 'var(--purple)' }}
              />
              <span style={{ fontSize: 14, color: 'var(--text)' }}>{reason}</span>
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
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 16,
              boxSizing: 'border-box',
            }}
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
            style={{
              background: canConfirm ? 'var(--purple)' : 'var(--border)',
              color: canConfirm ? '#fff' : 'var(--text-muted)',
              border: 'none',
              opacity: canConfirm ? 1 : 0.7,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}
          >
            Confirmar perda
          </button>
        </div>
      </div>
    </div>
  );
}
