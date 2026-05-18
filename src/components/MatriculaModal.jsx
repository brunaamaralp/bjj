import React, { useEffect, useState } from 'react';
import { useTerms } from '../lib/terminology.js';
import CustomLeadQuestionFields from './CustomLeadQuestionFields.jsx';

export default function MatriculaModal({
  isOpen,
  onClose,
  onConfirmSimple,
  onConfirmFull,
  enrollmentQuestions = [],
  submitting = false,
}) {
  const terms = useTerms();
  const [step, setStep] = useState('choose');
  const [answers, setAnswers] = useState({});

  const hasQuestions = Array.isArray(enrollmentQuestions) && enrollmentQuestions.length > 0;

  useEffect(() => {
    if (!isOpen) {
      setStep('choose');
      setAnswers({});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const handleAnswerChange = (qid, value) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  };

  const runFull = async () => {
    await onConfirmFull(answers);
  };

  const handleChooseFull = () => {
    if (hasQuestions) {
      setStep('questions');
      return;
    }
    void runFull();
  };

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
        if (e.target === e.currentTarget && !submitting) onClose();
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
          maxWidth: step === 'questions' ? 480 : 420,
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
          margin: 16,
          boxSizing: 'border-box',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {step === 'choose' ? (
          <>
            <h3
              id="matricula-modal-title"
              style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--text)', fontWeight: 700 }}
            >
              {terms.matriculaModalTitle}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {terms.matriculaModalSubtitle}
            </p>

            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleChooseFull}
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Preencher dados
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={onConfirmSimple}
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {terms.matriculaModalSimpleCta}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer',
                  padding: 4,
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <h3
              id="matricula-modal-title"
              style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--text)', fontWeight: 700 }}
            >
              Dados da matrícula
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Registre as informações abaixo. Em seguida você poderá completar plano e pagamento no perfil do aluno.
            </p>

            <CustomLeadQuestionFields
              questions={enrollmentQuestions}
              values={answers}
              onChange={handleAnswerChange}
              disabled={submitting}
            />

            <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void runFull()}
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {submitting ? 'Salvando…' : 'Continuar para o perfil do aluno'}
              </button>
              <button
                type="button"
                onClick={() => setStep('choose')}
                disabled={submitting}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer',
                  padding: 4,
                }}
              >
                Voltar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
