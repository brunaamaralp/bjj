import React, { useEffect } from 'react';

export default function MatriculaModal({ isOpen, onClose, onConfirmSimple, onConfirmFull }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="matricula-modal-title"
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 420,
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
          margin: 16,
          boxSizing: 'border-box',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3
          id="matricula-modal-title"
          style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--text)', fontWeight: 700 }}
        >
          Matricular aluno
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Como deseja registrar a matricula?
        </p>

        <div style={{ display: 'grid', gap: 10 }}>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirmFull}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Preencher dados
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={onConfirmSimple}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            So matricular
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
