import React, { useEffect, useMemo, useState } from 'react';
import useMatchMobile from '../hooks/useMatchMobile.js';
import useVisualViewportKeyboardOffset from '../hooks/useVisualViewportKeyboardOffset.js';
import { useTerms } from '../lib/terminology.js';
import { defaultEnrollmentDateIso } from '../lib/studentEnrollmentDate.js';
import {
  buildPayFormForEnrollment,
  registerEnrollmentPayment,
  referenceMonthFromEnrollmentDate,
} from '../lib/enrollmentPayment.js';
import { validateBankAccountForPayment } from '../lib/bankAccounts.js';
import { PAYMENT_CATEGORY } from '../lib/studentPayments.js';
import { centsToNumber, parseMaskToCents } from '../lib/moneyBr.js';
import CustomLeadQuestionFields from './CustomLeadQuestionFields.jsx';
import PlanSelect from './shared/PlanSelect.jsx';
import StudentStatusBadge from './student/StudentStatusBadge.jsx';
import MatriculaPaymentStep from './MatriculaPaymentStep.jsx';
import { DateInputField } from './DateInput';
import { useLeadStore } from '../store/useLeadStore.js';
import { prefetchFinanceConfig } from '../lib/prefetchFinanceConfig.js';

export default function MatriculaModal({
  isOpen,
  onClose,
  lead = null,
  leadId = '',
  academyId = '',
  userId = '',
  teamId = '',
  enrollmentQuestions = [],
  financeConfig = null,
  submitting = false,
  showContractPrompt = false,
  paymentEnabled = true,
  initialStep = 'choose',
  onEnroll,
  onPaymentRegistered,
  onSendContract,
  onSkipAfterEnroll,
  registeredByName = 'Usuário',
}) {
  const terms = useTerms();
  const storeFinanceConfig = useLeadStore((s) =>
    s.financeConfigAcademyId === academyId ? s.financeConfig : null
  );
  const resolvedFinanceConfig = storeFinanceConfig || financeConfig;
  const [step, setStep] = useState('choose');
  const [answers, setAnswers] = useState({});
  const [enrolledLeadId, setEnrolledLeadId] = useState('');
  const [enrollMode, setEnrollMode] = useState('simple');
  const [enrollmentPlan, setEnrollmentPlan] = useState('');
  const [enrollmentDate, setEnrollmentDate] = useState('');
  const [payForm, setPayForm] = useState(null);
  const [paymentError, setPaymentError] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [enrolledStudent, setEnrolledStudent] = useState(false);

  const hasQuestions = Array.isArray(enrollmentQuestions) && enrollmentQuestions.length > 0;
  const isMobile = useMatchMobile();
  const keyboardOffset = useVisualViewportKeyboardOffset(isOpen && isMobile);
  const showPaymentStep = paymentEnabled && Boolean(resolvedFinanceConfig);

  useEffect(() => {
    if (!isOpen || !academyId || !paymentEnabled) return;
    void prefetchFinanceConfig(academyId);
  }, [isOpen, academyId, paymentEnabled]);

  const resolvedLeadId = String(enrolledLeadId || leadId || lead?.id || '').trim();

  const footerStyle = isMobile ? { paddingBottom: keyboardOffset + 16 } : undefined;

  useEffect(() => {
    if (!isOpen) {
      setStep('choose');
      setAnswers({});
      setEnrolledLeadId('');
      setEnrollMode('simple');
      setEnrollmentPlan('');
      setEnrollmentDate('');
      setPayForm(null);
      setPaymentError('');
      setPaymentSaving(false);
      setEnrolledStudent(false);
      return;
    }
    const defaultDate = defaultEnrollmentDateIso(lead);
    const defaultPlan = String(lead?.plan || '').trim();
    setEnrollmentDate(defaultDate);
    setEnrollmentPlan(defaultPlan);
    setStep(initialStep === 'payment' && showPaymentStep ? 'payment' : 'choose');
    if (initialStep === 'payment' && showPaymentStep) {
      setPayForm(buildPayFormForEnrollment(lead, resolvedFinanceConfig, defaultDate, defaultPlan));
    }
  }, [isOpen, lead, resolvedFinanceConfig, initialStep, showPaymentStep]);

  useEffect(() => {
    if (step !== 'payment') return;
    const refMonth = referenceMonthFromEnrollmentDate(enrollmentDate);
    setPayForm((p) => {
      if (!p) return p;
      if (p.reference_month === refMonth && p.bundle_start_month === refMonth) return p;
      return { ...p, reference_month: refMonth, bundle_start_month: refMonth };
    });
  }, [enrollmentDate, step]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting && !paymentSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, submitting, paymentSaving]);

  const modalBusy = submitting || paymentSaving;

  const planField = (
    <div className="form-group">
      <label className="form-label">
        Plano <span style={{ color: 'var(--danger)' }}>*</span>
      </label>
      <PlanSelect
        financeConfig={resolvedFinanceConfig}
        value={enrollmentPlan}
        onChange={setEnrollmentPlan}
        disabled={modalBusy}
        emptyLabel="Selecione o plano (obrigatório)…"
      />
    </div>
  );

  const enrollmentDateField = (
    <div className="form-group">
      <DateInputField
        label="Data de matrícula"
        type="date"
        className="form-input"
        value={enrollmentDate}
        disabled={modalBusy}
        onChange={(e) => setEnrollmentDate(e.target.value)}
      />
      <p className="text-small text-muted" style={{ margin: '6px 0 0' }}>
        Use a data real de ingresso; afeta o mês de referência da 1ª mensalidade.
      </p>
    </div>
  );

  const canEnrollNow = Boolean(String(enrollmentPlan || '').trim()) && !modalBusy;

  const goToSuccess = (id) => {
    const resolvedId = String(id || resolvedLeadId || '').trim();
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

  const runEnroll = async (mode) => {
    if (!onEnroll) throw new Error('Matrícula indisponível.');
    const planName = String(enrollmentPlan || '').trim();
    if (!planName) throw new Error('Selecione o plano.');
    setEnrollMode(mode);
    await onEnroll({
      plan: planName,
      enrollmentDate,
      answers,
      mode,
    });
    setEnrolledStudent(true);
    setEnrolledLeadId(String(leadId || lead?.id || '').trim());
  };

  const validatePaymentForm = () => {
    if (!payForm) return 'Preencha os dados do pagamento.';
    const amountNum = centsToNumber(parseMaskToCents(payForm.amount));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return 'Informe um valor maior que zero.';
    }
    if (payForm.status === 'paid') {
      const accountCheck = validateBankAccountForPayment(payForm.account, resolvedFinanceConfig);
      if (!accountCheck.ok) return accountCheck.message;
    }
    const refMonth = referenceMonthFromEnrollmentDate(enrollmentDate);
    if (payForm.payment_type === PAYMENT_CATEGORY.PLAN && payForm.reference_month !== refMonth) {
      setPayForm((p) => ({ ...p, reference_month: refMonth, bundle_start_month: refMonth }));
    }
    return '';
  };

  const handleRegisterPayment = async () => {
    setPaymentError('');
    const validation = validatePaymentForm();
    if (validation) {
      setPaymentError(validation);
      return;
    }
    setPaymentSaving(true);
    try {
      if (!enrolledStudent) {
        await runEnroll(enrollMode || 'simple');
      }
      const doc = await registerEnrollmentPayment({
        academyId,
        userId,
        teamId,
        studentId: resolvedLeadId,
        payForm: {
          ...payForm,
          plan_name: enrollmentPlan || payForm.plan_name,
          reference_month: referenceMonthFromEnrollmentDate(enrollmentDate),
          bundle_start_month: referenceMonthFromEnrollmentDate(enrollmentDate),
        },
        financeConfig: resolvedFinanceConfig,
        registeredByName,
      });
      onPaymentRegistered?.(doc);
      goToSuccess(resolvedLeadId);
    } catch (e) {
      setPaymentError(e?.message || 'Não foi possível registrar o pagamento.');
      if (enrolledStudent && !enrolledLeadId) {
        setEnrolledLeadId(String(leadId || lead?.id || '').trim());
      }
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleEnrollOnly = async (mode) => {
    setPaymentError('');
    try {
      await runEnroll(mode);
      goToSuccess(resolvedLeadId);
    } catch (e) {
      setPaymentError(e?.message || 'Não foi possível concluir a matrícula.');
    }
  };

  const handleEnrollThenPayment = async (mode) => {
    setPaymentError('');
    if (!showPaymentStep) {
      await handleEnrollOnly(mode);
      return;
    }
    try {
      setEnrollMode(mode);
      setPayForm(buildPayFormForEnrollment(lead, resolvedFinanceConfig, enrollmentDate, enrollmentPlan));
      setStep('payment');
    } catch (e) {
      setPaymentError(e?.message || 'Erro ao preparar pagamento.');
    }
  };

  const handleChooseFull = () => {
    if (hasQuestions) {
      setStep('questions');
      return;
    }
    void handleEnrollThenPayment('full');
  };

  const handleSkipPayment = async () => {
    setPaymentError('');
    try {
      if (!enrolledStudent) {
        await runEnroll(enrollMode || 'simple');
      }
      goToSuccess(resolvedLeadId);
    } catch (e) {
      setPaymentError(e?.message || 'Não foi possível concluir a matrícula.');
    }
  };

  const handleSkipContract = () => {
    if (onSkipAfterEnroll) {
      onSkipAfterEnroll(enrolledLeadId || leadId);
    } else {
      onClose();
    }
  };

  const titleByStep = useMemo(() => {
    if (step === 'success') return 'Aluno matriculado!';
    if (step === 'payment') {
      return initialStep === 'payment' ? 'Matricular e registrar pagamento' : 'Primeira mensalidade';
    }
    if (step === 'questions') return 'Dados da matrícula';
    return terms.matriculaModalTitle;
  }, [step, initialStep, terms.matriculaModalTitle]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="navi-modal-overlay"
      style={{ zIndex: 9999, padding: 16 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !modalBusy) onClose();
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
          maxWidth: step === 'questions' || step === 'payment' ? 480 : 420,
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
          <h3
            id="matricula-modal-title"
            style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--text)', fontWeight: 700 }}
          >
            {titleByStep}
          </h3>

          {step === 'success' ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <StudentStatusBadge status="ativo" />
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Deseja enviar o contrato agora?
              </p>
            </>
          ) : null}

          {step === 'choose' ? (
            <>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {terms.matriculaModalSubtitle}
              </p>
              {planField}
              {enrollmentDateField}
            </>
          ) : null}

          {step === 'questions' ? (
            <>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Registre as informações abaixo. O plano escolhido será salvo no cadastro do aluno.
              </p>
              {planField}
              {enrollmentDateField}
              <CustomLeadQuestionFields
                questions={enrollmentQuestions}
                values={answers}
                onChange={(qid, value) => setAnswers((prev) => ({ ...prev, [qid]: value }))}
                disabled={modalBusy}
              />
            </>
          ) : null}

          {step === 'payment' && showPaymentStep ? (
            <>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Opcional — registre a 1ª mensalidade ou pacote. O lançamento entra no caixa automaticamente.
              </p>
              {initialStep === 'payment' ? (
                <>
                  {planField}
                  {enrollmentDateField}
                </>
              ) : null}
              <MatriculaPaymentStep
                payForm={payForm}
                setPayForm={setPayForm}
                financeConfig={resolvedFinanceConfig}
                academyId={academyId}
                enrollmentPlan={enrollmentPlan}
                onPlanChange={setEnrollmentPlan}
                disabled={modalBusy}
                paymentError={paymentError}
              />
            </>
          ) : null}
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
          ) : null}

          {step === 'choose' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleEnrollOnly('simple')}
                disabled={!canEnrollNow}
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
              >
                {submitting ? 'Salvando…' : 'Matricular agora'}
              </button>
              {showPaymentStep ? (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => void handleEnrollThenPayment('simple')}
                  disabled={!canEnrollNow}
                  style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
                >
                  Matricular e registrar pagamento
                </button>
              ) : null}
              <button
                type="button"
                className="btn-outline"
                onClick={handleChooseFull}
                disabled={modalBusy}
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
              <button type="button" className="btn-ghost" onClick={onClose} disabled={modalBusy}>
                Cancelar
              </button>
            </div>
          ) : null}

          {step === 'questions' ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleEnrollThenPayment('full')}
                disabled={modalBusy || !canEnrollNow}
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
              >
                {submitting ? 'Salvando…' : showPaymentStep ? 'Continuar para pagamento' : 'Matricular'}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => void handleEnrollOnly('full')}
                disabled={modalBusy || !canEnrollNow}
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
              >
                Matricular sem pagamento
              </button>
              <button type="button" className="btn-ghost" onClick={() => setStep('choose')} disabled={modalBusy}>
                Voltar
              </button>
            </div>
          ) : null}

          {step === 'payment' && showPaymentStep ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleRegisterPayment()}
                disabled={modalBusy}
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
              >
                {paymentSaving ? 'Registrando…' : 'Registrar pagamento'}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => void handleSkipPayment()}
                disabled={modalBusy}
                style={{ width: '100%', justifyContent: 'center', minHeight: 44 }}
              >
                Pular pagamento
              </button>
              {initialStep !== 'payment' ? (
                <button type="button" className="btn-ghost" onClick={() => setStep('choose')} disabled={modalBusy}>
                  Voltar
                </button>
              ) : (
                <button type="button" className="btn-ghost" onClick={onClose} disabled={modalBusy}>
                  Cancelar
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
