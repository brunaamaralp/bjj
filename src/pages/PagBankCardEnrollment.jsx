import '../styles/pagbank-card-enrollment.css';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CreditCard, CheckCircle2, ShieldCheck, AlertTriangle } from 'lucide-react';
import NaviBrandLockup from '../components/NaviBrandLockup.jsx';
import FieldError from '../components/shared/FieldError.jsx';
import StatusBanner from '../components/shared/StatusBanner.jsx';
import { maskCardNumber, maskExpiry, parseExpiryParts } from '../lib/pagbankCardMasks.js';

const STEPS_LABELS = {
  encrypting: 'Validando cartão…',
  subscribing: 'Confirmando pagamento…',
  subscribing_plan: 'Ativando plano…',
};

const STEP_ORDER = ['encrypting', 'subscribing', 'subscribing_plan'];

const PROGRESS_STEPS = [
  { key: 'encrypting', label: 'Validar cartão' },
  { key: 'subscribing', label: 'Confirmar pagamento' },
  { key: 'subscribing_plan', label: 'Ativar plano' },
];

function formatPlanAmount(cents) {
  const value = Number(cents) || 0;
  return (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ProgressSteps({ step }) {
  const currentIdx = STEP_ORDER.indexOf(step);
  return (
    <div
      className="pagbank-enrollment-page__steps"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Progresso do cadastro"
    >
      {PROGRESS_STEPS.map((s) => {
        const thisIdx = STEP_ORDER.indexOf(s.key);
        const isDone = thisIdx < currentIdx;
        const isActive = thisIdx === currentIdx;
        return (
          <div
            key={s.key}
            className={`pagbank-enrollment-page__step${
              isDone ? ' pagbank-enrollment-page__step--done' : isActive ? ' pagbank-enrollment-page__step--active' : ''
            }`}
            aria-current={isActive ? 'step' : undefined}
          >
            <div className="pagbank-enrollment-page__step-dot" />
            <span>{isDone ? '✓ ' : ''}{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SuccessView({ context, subscriptionId, alreadySubscribed }) {
  const title = alreadySubscribed ? 'Sua assinatura já está ativa' : 'Assinatura ativada!';

  return (
    <div
      className="card pagbank-enrollment-card pagbank-enrollment-card--success"
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 size={32} className="pagbank-enrollment-card__success-icon" aria-hidden />
      <h1 className="navi-page-title pagbank-enrollment-title">{title}</h1>
      <p className="text-small pagbank-enrollment-card__message">
        {alreadySubscribed ? (
          <>
            O plano <strong>{context?.plan_name || 'da academia'}</strong> já está vinculado ao seu cadastro.
            {context?.plan_frequency ? (
              <> As cobranças continuam {context.plan_frequency} no cartão cadastrado.</>
            ) : null}
          </>
        ) : (
          <>
            Seu plano <strong>{context?.plan_name}</strong> foi ativado com sucesso. Você será cobrado
            automaticamente {context?.plan_frequency || 'por mês'}.
          </>
        )}
      </p>
      {subscriptionId ? (
        <p className="text-small text-muted pagbank-enrollment-card__protocol">
          Protocolo: <code>{subscriptionId}</code>
        </p>
      ) : null}
    </div>
  );
}

export default function PagBankCardEnrollment() {
  const { token: tokenParam } = useParams();
  const token = decodeURIComponent(String(tokenParam || '').trim());

  const [context, setContext] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadErrorRetryable, setLoadErrorRetryable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [holderName, setHolderName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [step, setStep] = useState('idle');
  const [submitError, setSubmitError] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');

  const isSubmitting = STEP_ORDER.includes(step);

  const loadPortalInfo = useCallback(async () => {
    if (!token) {
      setLoadError('Link inválido ou expirado.');
      setLoadErrorRetryable(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    setLoadErrorRetryable(false);

    try {
      const res = await fetch('/api/agent?route=pagbank-portal-info', {
        headers: { 'x-portal-token': token },
      });

      if (res.status === 401) {
        setLoadError('Este link expirou ou é inválido. Solicite um novo link à recepção.');
        setLoadErrorRetryable(false);
        return;
      }
      if (!res.ok) {
        setLoadError('Erro ao carregar. Tente novamente.');
        setLoadErrorRetryable(true);
        return;
      }

      const data = await res.json();
      setContext(data);
      if (data.already_subscribed) {
        setAlreadySubscribed(true);
        setSubscriptionId(data.subscription_id || '');
        setStep('done');
      }
    } catch {
      setLoadError('Erro de conexão. Verifique sua internet e tente novamente.');
      setLoadErrorRetryable(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPortalInfo();
  }, [loadPortalInfo]);

  function validate() {
    const errs = {};
    const num = cardNumber.replace(/\s/g, '');
    if (!num || num.length < 13) errs.cardNumber = 'Número de cartão inválido';

    const monthNum = Number(expMonth);
    const yearNum = Number(expYear);
    if (!expMonth || !expYear || monthNum < 1 || monthNum > 12 || yearNum < 2026) {
      errs.expiry = 'Validade inválida';
    }

    if (!cvv || cvv.length < 3) errs.cvv = 'CVV inválido';
    if (!holderName.trim()) errs.holderName = 'Nome igual ao impresso no cartão';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function runSubmit() {
    if (!token || !validate() || isSubmitting) return;
    setSubmitError('');
    setStep('encrypting');

    let encryptedCard;
    try {
      const res = await fetch('/api/agent?route=pagbank-encrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({
          number: cardNumber.replace(/\s/g, ''),
          exp_month: expMonth.padStart(2, '0'),
          exp_year: expYear,
          security_code: cvv,
          holder_name: holderName.trim().toUpperCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao processar cartão');
      encryptedCard = data.encrypted_card;
    } catch {
      setStep('error');
      setSubmitError('Erro ao processar o cartão. Verifique os dados e tente novamente.');
      return;
    }

    setStep('subscribing');
    let subscriberId;
    try {
      const res = await fetch('/api/agent?route=pagbank-subscriber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ encrypted_card: encryptedCard }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 422) {
          throw new Error('Cartão recusado. Verifique os dados ou tente outro cartão.');
        }
        throw new Error(data.error || 'Erro ao registrar cartão');
      }
      subscriberId = data.subscriber_id;
    } catch (e) {
      setStep('error');
      setSubmitError(e?.message || 'Erro ao registrar cartão. Tente novamente.');
      return;
    }

    setStep('subscribing_plan');
    try {
      const res = await fetch('/api/agent?route=pagbank-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify({ subscriber_id: subscriberId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao ativar plano');
      setAlreadySubscribed(false);
      setSubscriptionId(data.subscription_id || '');
      setStep('done');
    } catch {
      setStep('error');
      setSubmitError(
        'Cartão registrado, mas houve um erro ao ativar o plano. Entre em contato com a recepção.'
      );
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    void runSubmit();
  }

  const showForm = !loading && !loadError && step !== 'done';
  const academyLabel = context?.academy_name || 'Academia';

  return (
    <div className="pagbank-enrollment-page">
      <header className="pagbank-enrollment-page__header">
        <NaviBrandLockup height={26} variant="light" />
      </header>

      <main className="pagbank-enrollment-page__body">
        {loading ? (
          <p className="text-small text-muted">Carregando formulário…</p>
        ) : null}

        {loadError ? (
          <div className="card pagbank-enrollment-card" role="alert">
            <AlertTriangle size={22} className="pagbank-enrollment-card__alert-icon" aria-hidden />
            <p className="pagbank-enrollment-card__message">{loadError}</p>
            {loadErrorRetryable ? (
              <button type="button" className="btn-secondary pagbank-enrollment-card__retry" onClick={loadPortalInfo}>
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}

        {showForm ? (
          <>
            <h1 className="navi-page-title pagbank-enrollment-title">
              Cadastro de cartão — {academyLabel}
            </h1>
            <p className="text-small pagbank-enrollment-subtitle">
              Olá, <strong>{context?.student_name}</strong>. Informe os dados do cartão para ativar sua assinatura.
              Campos com * são obrigatórios.
            </p>

            <div className="pagbank-enrollment-page__plan-card">
              <span className="pagbank-enrollment-page__plan-name">{context?.plan_name}</span>
              <span className="pagbank-enrollment-page__plan-amount">
                {formatPlanAmount(context?.plan_amount)}
              </span>
              <span className="pagbank-enrollment-page__plan-freq">
                {context?.plan_frequency || 'por mês'} — cobrado automaticamente no cartão
              </span>
            </div>

            {step === 'idle' || step === 'error' ? (
              <form onSubmit={handleFormSubmit} className="pagbank-enrollment-page__card-form">
                <div className="card pagbank-enrollment-card">
                  <div className="form-group">
                    <label htmlFor="pagbank-card-number">Número do cartão *</label>
                    <input
                      id="pagbank-card-number"
                      className="form-input"
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                      maxLength={19}
                      inputMode="numeric"
                      autoComplete="cc-number"
                      aria-invalid={fieldErrors.cardNumber ? 'true' : undefined}
                      disabled={isSubmitting}
                    />
                    <FieldError>{fieldErrors.cardNumber}</FieldError>
                  </div>

                  <div className="form-group">
                    <label htmlFor="pagbank-holder-name">Nome (como no cartão) *</label>
                    <input
                      id="pagbank-holder-name"
                      className="form-input"
                      placeholder="NOME SOBRENOME"
                      value={holderName}
                      onChange={(e) => setHolderName(e.target.value.toUpperCase())}
                      autoComplete="cc-name"
                      aria-invalid={fieldErrors.holderName ? 'true' : undefined}
                      disabled={isSubmitting}
                    />
                    <FieldError>{fieldErrors.holderName}</FieldError>
                  </div>

                  <div className="pagbank-enrollment-page__card-row">
                    <div className="form-group">
                      <label htmlFor="pagbank-expiry">Validade *</label>
                      <input
                        id="pagbank-expiry"
                        className="form-input"
                        placeholder="MM/AA"
                        value={expiry}
                        onChange={(e) => {
                          const masked = maskExpiry(e.target.value);
                          setExpiry(masked);
                          const { expMonth: m, expYear: y } = parseExpiryParts(masked);
                          setExpMonth(m);
                          setExpYear(y);
                        }}
                        maxLength={5}
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        aria-invalid={fieldErrors.expiry ? 'true' : undefined}
                        disabled={isSubmitting}
                      />
                      <FieldError>{fieldErrors.expiry}</FieldError>
                    </div>

                    <div className="form-group">
                      <label htmlFor="pagbank-cvv">CVV *</label>
                      <input
                        id="pagbank-cvv"
                        className="form-input"
                        placeholder="123"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        maxLength={4}
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        type="password"
                        aria-invalid={fieldErrors.cvv ? 'true' : undefined}
                        disabled={isSubmitting}
                      />
                      <FieldError>{fieldErrors.cvv}</FieldError>
                    </div>
                  </div>
                </div>

                {submitError ? <StatusBanner variant="error" message={submitError} /> : null}

                <div className="pagbank-enrollment-page__security-note">
                  <ShieldCheck size={14} aria-hidden />
                  <span>Seus dados são criptografados e nunca armazenados.</span>
                </div>

                <button
                  type="submit"
                  className="btn-primary pagbank-enrollment-page__submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  <CreditCard size={16} aria-hidden />
                  Ativar assinatura
                </button>
              </form>
            ) : (
              <div className="pagbank-enrollment-page__progress" aria-busy="true">
                <p className="pagbank-enrollment-page__progress-label">{STEPS_LABELS[step]}</p>
                <ProgressSteps step={step} />
              </div>
            )}
          </>
        ) : null}

        {step === 'done' && !loading && !loadError ? (
          <SuccessView
            context={context}
            subscriptionId={subscriptionId}
            alreadySubscribed={alreadySubscribed}
          />
        ) : null}
      </main>
    </div>
  );
}
