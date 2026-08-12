import React, { useMemo, useState } from 'react';
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

/**
 * Form compacto para adicionar mensalidade / pacote / taxa ao checkout misto.
 */
export default function MixedCheckoutChargeForm({
  disabled = false,
  studentPlanName = '',
  studentPlanPrice = null,
  onAdd,
}) {
  const [kind, setKind] = useState(PAYMENT_CATEGORY.FEE);
  const [amountDisplay, setAmountDisplay] = useState('');
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

  const handleKindChange = (next) => {
    setKind(next);
    setError('');
    if (next === PAYMENT_CATEGORY.PLAN && studentPlanPrice != null && Number(studentPlanPrice) > 0) {
      setAmountDisplay(formatBRLFromCents(Math.round(Number(studentPlanPrice) * 100)));
    }
  };

  const handleAdd = () => {
    setError('');
    if (disabled) {
      setError('Selecione o aluno para adicionar cobrança.');
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
    setAmountDisplay('');
    setError('');
  };

  return (
    <div className="mixed-checkout-charge-form">
      <div className="mixed-checkout-charge-form__head">
        <span className="text-small" style={{ fontWeight: 600 }}>
          Adicionar cobrança
        </span>
        {disabled ? (
          <span className="text-small text-muted">Vincule um aluno para mensalidade/taxa</span>
        ) : null}
      </div>
      <div className="mixed-checkout-charge-form__row">
        <label className="form-group" style={{ flex: 1, margin: 0 }}>
          <span className="text-small">Tipo</span>
          <select
            className="form-input"
            value={kind}
            disabled={disabled}
            onChange={(e) => handleKindChange(e.target.value)}
          >
            {kindOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-group" style={{ flex: 1, margin: 0 }}>
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
      </div>
      {kind === PAYMENT_CATEGORY.FEE ? (
        <label className="form-group">
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
      {kind === PAYMENT_CATEGORY.PLAN ? (
        <label className="form-group">
          <span className="text-small">Mês de referência</span>
          <input
            className="form-input"
            type="month"
            value={referenceMonth}
            disabled={disabled}
            onChange={(e) => setReferenceMonth(e.target.value)}
          />
        </label>
      ) : null}
      {kind === PAYMENT_CATEGORY.BUNDLE ? (
        <div className="mixed-checkout-charge-form__row">
          <label className="form-group" style={{ flex: 1, margin: 0 }}>
            <span className="text-small">Meses</span>
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
          <label className="form-group" style={{ flex: 1, margin: 0 }}>
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
        <p className="text-small" role="alert" style={{ color: 'var(--danger, #b91c1c)', margin: '4px 0' }}>
          {error}
        </p>
      ) : null}
      <button type="button" className="btn-outline" disabled={disabled} onClick={handleAdd}>
        Incluir no checkout
      </button>
    </div>
  );
}

export { newChargeId };
