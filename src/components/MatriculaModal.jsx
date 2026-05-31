import React, { useEffect, useState } from 'react';
import useMatchMobile from '../hooks/useMatchMobile.js';
import useVisualViewportKeyboardOffset from '../hooks/useVisualViewportKeyboardOffset.js';
import { useTerms } from '../lib/terminology.js';
import CustomLeadQuestionFields from './CustomLeadQuestionFields.jsx';
import PlanSelect from './shared/PlanSelect.jsx';
import StudentStatusBadge from './student/StudentStatusBadge.jsx';

export default function MatriculaModal({
  isOpen,
  onClose,
  onConfirmSimple,
  onConfirmFull,
  enrollmentQuestions = [],
  financeConfig = null,
  submitting = false,
  leadId = '',
  showContractPrompt = false,
  onSendContract,
  onSkipAfterEnroll,
}) {
  const terms = useTerms();
  const [step, setStep] = useState('choose');
  const [answers, setAnswers] = useState({});
  const [enrolledLeadId, setEnrolledLeadId] = useState('');
  const [enrollMode, setEnrollMode] = useState('simple');
  const [enrollmentPlan, setEnrollmentPlan] = useState('');

  const hasQuestions = Array.isArray(enrollmentQuestions) && enrollmentQuestions.length > 0;
  const isMobile = useMatchMobile();
  const keyboardOffset = useVisualViewportKeyboardOffset(isOpen && isMobile);

  const footerStyle = isMobile
    ? { paddingBottom: keyboardOffset + 16 }
    : undefined;

  useEffect(() => {
    if (!isOpen) {
      setStep('choose');
      setAnswers({});
      setEnrolledLeadId('');
      setEnrollMode('simple');
      setEnrollmentPlan('');
    }
  }, [isOpen]);

  const planField = (
    <div className="form-group">
      <label className="form-label">
        Plano <span style={{ color: 'var(--danger)' }}>*</span>
      </label>
      <PlanSelect
        financeConfig={financeConfig}
        value={enrollmentPlan}
        onChange={setEnrollmentPlan}
        disabled={submitting}
        emptyLabel="Selecione o plano (obrigatório)…"
      />
    </div>
  );

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

  const goToSuccess = (id) => {
    const resolvedId = String(id || leadId || '').trim();
    if (showContractPrompt && resolvedId) {
      setEnrolledLeadId(resolvedId);
      setStep('success');
      return;
    }
    if (enrollMode === 'full' && onSkipAfterEnroll) {
      onSkipAfterEnroll(resolvedId);
      return;
    }
    onClose();
  };

  const runFull = async () => {
    setEnrollMode('full');
    await onConfirmFull(answers, enrollmentPlan);
    goToSuccess(leadId);
  };

  const handleChooseFull = () => {
    if (hasQuestions) {
      setStep('questions');
      return;
    }
    void runFull();
  };

  const handleConfirmSimple = async () => {
    const planName = String(enrollmentPlan || '').trim();
    if (!planName) return;
    setEnrollMode('simple');
    await onConfirmSimple(enrollmentPlan);
    goToSuccess(leadId);
  };

  const canEnrollNow = Boolean(String(enrollmentPlan || '').trim()) && !submitting;

  const handleSkipContract = () => {
    if (onSkipAfterEnroll) {
      onSkipAfterEnroll(enrolledLeadId || leadId);
    } else {
      onClose();
    }
  };

  return (
    <div
      role="presentation"
      className="navi-modal-overlay"
      style={{ zIndex: 9999, padding: 16 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="matricula-modal-title"
        className="matricula-modal-dialog"
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          width: '100%',
          maxWidth: step === 'questions' ? 480 : 420,
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--border)',
          margin: 16,
          boxSizing: 'border-box',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="matricula-modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 24px 8px' }}>
        {step === 'success' ? (
          <>
            <h3
              id="matricula-modal-title"
              style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text)', fontWeight: 700 }}
            >
              ✓ Aluno matriculado!
            </h3>
            <div style={{ marginBottom: 12 }}>
              <StudentStatusBadge status="ativo" />
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Deseja enviar o contrato agora?
            </p>
          </>
        ) : step === 'choose' ? (
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

            {planField}
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
              Registre as informações abaixo. O plano escolhido será salvo no cadastro do aluno.
            </p>

            {planField}

            <CustomLeadQuestionFields
              questions={enrollmentQuestions}
              values={answers}
              onChange={handleAnswerChange}
              disabled={submitting}
            />
          </>
        )}
        </div>

        <div className="matricula-modal-footer" style={footerStyle}>
        {step === 'success' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
                onClick={() => onSendContract?.(enrolledLeadId || leadId)}
              >
                Enviar contrato
              </button>
              <button
                type="button"
                className="btn-outline"
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
                onClick={handleSkipContract}
              >
                Pular
              </button>
            </div>
        ) : step === 'choose' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleConfirmSimple()}
                disabled={!canEnrollNow}
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
              >
                {submitting ? 'Salvando…' : 'Matricular agora'}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={handleChooseFull}
                disabled={submitting}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  minHeight: 44,
                  borderStyle: 'dashed',
                  opacity: 0.92,
                }}
              >
                Completar depois
                {hasQuestions ? ' (perguntas e dados)' : ''}
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
                  padding: '10px 4px',
                  minHeight: 44,
                }}
              >
                Cancelar
              </button>
            </div>
        ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void runFull()}
                disabled={submitting}
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
              >
                {submitting ? 'Salvando…' : 'Continuar'}
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
                  padding: '10px 4px',
                  minHeight: 44,
                }}
              >
                Voltar
              </button>
            </div>
        )}
        </div>
      </div>
    </div>
  );
}
