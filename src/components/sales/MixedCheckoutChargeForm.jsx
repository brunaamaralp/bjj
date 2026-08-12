import React, { useEffect, useMemo, useState } from 'react';
import { PAYMENT_CATEGORY, BUNDLE_DURATION_OPTIONS } from '../../lib/paymentCategories.js';
import { formatBRLFromCents, parseMaskToCents, centsToNumber } from '../../lib/moneyBr.js';

function currentYm() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

function newChargeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function amountFromPlanPrice(studentPlanPrice) {
  if (studentPlanPrice == null || !Number.isFinite(Number(studentPlanPrice)) || Number(studentPlanPrice) <= 0) {
    return '';
  }
  return formatBRLFromCents(Math.round(Number(studentPlanPrice) * 100));
}

/**
 * Form compacto para adicionar mensalidade / pacote / taxa ao checkout misto.
 */
export default function MixedCheckoutChargeForm({
  disabled = false,
  studentPlanName = '',
  studentPlanPrice = null,
  onAdd,
}) {
  const [kind, setKind] = useState(PAYMENT_CATEGORY.PLAN);
  const [amountDisplay, setAmountDisplay] = useState(() => amountFromPlanPrice(studentPlanPrice));
  const [note, setNote] = useState('');
  const [referenceMonth, setReferenceMonth] = useState(currentYm);
  const [bundleMonths, setBundleMonths] = useState(12);
  const [bundleStart, setBundleStart] = useState(currentYm);
  const [error, setError] = useState('');

  const amountNum = centsToNumber(parseMaskToCents(amountDisplay)) || 0;

  const kindOptions = useMemo(
    () => [
      { value: PAYMENT_CATEGORY.PLAN, label: 'Mensalidade' },
      { value: PAYMENT_CATEGORY.BUNDLE, label: 'Pacote' },
      { value: PAYMENT_CATEGORY.FEE, label: 'Taxa' },
    ],
    []
  );

  useEffect(() => {
    if (kind === PAYMENT_CATEGORY.PLAN) {
      const next = amountFromPlanPrice(studentPlanPrice);
      if (next) setAmountDisplay(next);
    }
  }, [studentPlanPrice, kind]);

  const handleKindChange = (next) => {
    setKind(next);
    setError('');
    if (next === PAYMENT_CATEGORY.PLAN) {
      const fromPlan = amountFromPlanPrice(studentPlanPrice);
      if (fromPlan) setAmountDisplay(fromPlan);
    }
  };

  const handleAdd = () => {
    setError('');
    if (disabled) {
      setError('Selecione o aluno acima para incluir mensalidade ou taxa.');
      return;
    }
    if (!(amountNum > 0)) {
      setError('Informe o valor.');
      return;
    }
    if (kind === PAYMENT_CATEGORY.FEE && !String(note || '').trim()) {
      setError('Informe a descrição da taxa.');
      return;
    }
    const line = {
      id: newChargeId(),
      kind,
      amount: amountNum,
      note: String(note || '').trim(),
      plan_name: studentPlanName || '',
      reference_month: kind === PAYMENT_CATEGORY.PLAN ? referenceMonth : null,
      bundle_months: kind === PAYMENT_CATEGORY.BUNDLE ? Number(bundleMonths) || 12 : undefined,
      coverage_start_month: kind === PAYMENT_CATEGORY.BUNDLE ? bundleStart : undefined,
      bundle_start_month: kind === PAYMENT_CATEGORY.BUNDLE ? bundleStart : undefined,
    };
    onAdd?.(line);
    setNote('');
    setAmountDisplay(kind === PAYMENT_CATEGORY.PLAN ? amountFromPlanPrice(studentPlanPrice) : '');
    setError('');
  };

  return (
    <section
      className={`mixed-checkout-charge-form${disabled ? ' mixed-checkout-charge-form--disabled' : ''}`}
      aria-label="Adicionar mensalidade, pacote ou taxa"
    >
      <div className="mixed-checkout-charge-form__head">
        <h4 className="mixed-checkout-charge-form__title">Mensalidade ou taxa</h4>
        <p className="mixed-checkout-charge-form__hint">
          {disabled
            ? 'Vincule um aluno acima para incluir no mesmo pagamento da maquininha.'
            : 'Inclua no mesmo total do checkout (mesmo cartão / PIX).'}
        </p>
      </div>

      <div className="mixed-checkout-charge-form__kinds" role="group" aria-label="Tipo de cobrança">
        {kindOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`mixed-checkout-charge-form__kind${kind === o.value ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => handleKindChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mixed-checkout-charge-form__body">
        <div className="mixed-checkout-charge-form__row">
          <label className="form-group mixed-checkout-charge-form__field">
            <span className="text-small">Valor</span>
            <input
              className="form-input"
              inputMode="decimal"
              value={amountDisplay}
              disabled={disabled}
              onChange={(e) => setAmountDisplay(formatBRLFromCents(parseMaskToCents(e.target.value)))}
              placeholder="R$ 0,00"
            />
          </label>
          {kind === PAYMENT_CATEGORY.PLAN ? (
            <label className="form-group mixed-checkout-charge-form__field">
              <span className="text-small">Mês</span>
              <input
                className="form-input"
                type="month"
                value={referenceMonth}
                disabled={disabled}
                onChange={(e) => setReferenceMonth(e.target.value)}
              />
            </label>
          ) : null}
          {kind === PAYMENT_CATEGORY.FEE ? (
            <label className="form-group mixed-checkout-charge-form__field mixed-checkout-charge-form__field--grow">
              <span className="text-small">Descrição</span>
              <input
                className="form-input"
                value={note}
                disabled={disabled}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: Taxa de competição"
                maxLength={120}
              />
            </label>
          ) : null}
        </div>

        {kind === PAYMENT_CATEGORY.BUNDLE ? (
          <div className="mixed-checkout-charge-form__row">
            <label className="form-group mixed-checkout-charge-form__field">
              <span className="text-small">Duração</span>
              <select
                className="form-input"
                value={bundleMonths}
                disabled={disabled}
                onChange={(e) => setBundleMonths(Number(e.target.value) || 12)}
              >
                {BUNDLE_DURATION_OPTIONS.map((o) => (
                  <option key={o.months} value={o.months}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group mixed-checkout-charge-form__field">
              <span className="text-small">Início</span>
              <input
                className="form-input"
                type="month"
                value={bundleStart}
                disabled={disabled}
                onChange={(e) => setBundleStart(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        {error ? (
          <p className="mixed-checkout-charge-form__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="btn-outline mixed-checkout-charge-form__add"
          disabled={disabled}
          onClick={handleAdd}
        >
          Incluir no checkout
        </button>
      </div>
    </section>
  );
}

export { newChargeId };
