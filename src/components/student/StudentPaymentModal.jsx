import React from 'react';
import { DateInput } from '../DateInput';
import BankAccountSelect from '../finance/BankAccountSelect.jsx';
import { PAYMENT_CATEGORY } from '../../lib/studentPayments.js';
import { BUNDLE_DURATION_OPTIONS } from '../../lib/paymentCategories.js';

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

export function buildDefaultPayForm(student) {
  const ym = new Date().toISOString().slice(0, 7);
  return {
    payment_type: PAYMENT_CATEGORY.PLAN,
    reference_month: ym,
    bundle_start_month: ym,
    bundle_months: 12,
    amount: student?.plan_price != null && student.plan_price !== '' ? String(student.plan_price) : '',
    method: student?.preferredPaymentMethod || 'pix',
    account: student?.preferredPaymentAccount || '',
    status: 'paid',
    paid_at: new Date().toISOString().slice(0, 10),
    due_date: '',
    plan_name: student?.plan || '',
    note: '',
  };
}

export default function StudentPaymentModal({
  open,
  student,
  academyId,
  financeConfig,
  payForm,
  setPayForm,
  saving,
  inputStyle,
  onClose,
  onSave,
}) {
  if (!open || !student) return null;

  const isPlan = payForm.payment_type === PAYMENT_CATEGORY.PLAN;
  const isBundle = payForm.payment_type === PAYMENT_CATEGORY.BUNDLE;
  const isFee = payForm.payment_type === PAYMENT_CATEGORY.FEE;
  const isOther = payForm.payment_type === PAYMENT_CATEGORY.OTHER;
  const showPaidDate = payForm.status === 'paid' || isFee || isBundle || isOther;
  const showPlanFields = isPlan || isBundle;

  return (
    <div
      className="navi-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-payment-modal-title"
      onClick={() => (saving ? undefined : onClose())}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}
      >
        <h3
          id="student-payment-modal-title"
          style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 800, color: 'var(--text)' }}
        >
          Registrar pagamento
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={labelStyle}>Tipo de pagamento</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { value: PAYMENT_CATEGORY.PLAN, label: 'Mensalidade' },
                { value: PAYMENT_CATEGORY.BUNDLE, label: 'Plano com cobertura' },
                { value: PAYMENT_CATEGORY.FEE, label: 'Taxa / avulso' },
                { value: PAYMENT_CATEGORY.OTHER, label: 'Outro' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    cursor: 'pointer',
                    color: 'var(--text)',
                  }}
                >
                  <input
                    type="radio"
                    name="payment_type"
                    value={opt.value}
                    checked={payForm.payment_type === opt.value}
                    onChange={() =>
                      setPayForm((p) => ({
                        ...p,
                        payment_type: opt.value,
                        status:
                          opt.value === PAYMENT_CATEGORY.FEE || opt.value === PAYMENT_CATEGORY.BUNDLE
                            ? 'paid'
                            : p.status,
                      }))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          {isPlan ? (
            <div>
              <DateInput
                label="Mês de referência"
                type="month"
                className="form-input"
                style={{ width: '100%' }}
                value={payForm.reference_month}
                onChange={(e) => setPayForm((p) => ({ ...p, reference_month: e.target.value }))}
                required
              />
            </div>
          ) : null}

          {isBundle ? (
            <>
              <div>
                <label style={labelStyle}>Duração</label>
                <select
                  className="form-input"
                  style={{ ...inputStyle, width: '100%' }}
                  value={payForm.bundle_months}
                  onChange={(e) =>
                    setPayForm((p) => ({ ...p, bundle_months: Number(e.target.value) }))
                  }
                >
                  {BUNDLE_DURATION_OPTIONS.map((o) => (
                    <option key={o.months} value={o.months}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <DateInput
                  label="Início da cobertura"
                  type="month"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={payForm.bundle_start_month}
                  onChange={(e) =>
                    setPayForm((p) => ({ ...p, bundle_start_month: e.target.value }))
                  }
                  required
                />
              </div>
            </>
          ) : null}

          {isFee || isOther ? (
            <div>
              <label style={labelStyle}>Descrição{isFee ? ' *' : ''}</label>
              <input
                type="text"
                className="form-input"
                style={{ ...inputStyle, width: '100%' }}
                placeholder={isFee ? 'Ex.: Taxa de competição' : 'Descrição do pagamento'}
                value={payForm.note}
                onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
                required={isFee}
              />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Não aparece na grade de Mensalidades.
              </p>
            </div>
          ) : null}

          {isPlan ? (
            <div>
              <label style={labelStyle}>Status</label>
              <select
                className="form-input"
                style={{ ...inputStyle, width: '100%' }}
                value={payForm.status}
                onChange={(e) => setPayForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="paid">Pago</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
          ) : null}

          <div>
            <label style={labelStyle}>Valor (R$)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0,00"
              className="form-input"
              style={{ ...inputStyle, width: '100%' }}
              value={payForm.amount}
              onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </div>

          {showPaidDate ? (
            <div>
              <DateInput
                label="Data do pagamento"
                type="date"
                className="form-input"
                style={{ width: '100%' }}
                value={payForm.paid_at}
                onChange={(e) => setPayForm((p) => ({ ...p, paid_at: e.target.value }))}
                required
              />
            </div>
          ) : null}

          {payForm.status === 'pending' && isPlan ? (
            <div>
              <DateInput
                label="Data de vencimento"
                type="date"
                className="form-input"
                style={{ width: '100%' }}
                value={payForm.due_date}
                onChange={(e) => setPayForm((p) => ({ ...p, due_date: e.target.value }))}
                required
              />
            </div>
          ) : null}

          <div>
            <label style={labelStyle}>Forma de pagamento</label>
            <select
              className="form-input"
              style={{ ...inputStyle, width: '100%' }}
              value={payForm.method}
              onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}
            >
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cartão_débito">Cartão débito</option>
              <option value="cartão_crédito">Cartão crédito</option>
              <option value="transferência">Transferência</option>
            </select>
          </div>

          <BankAccountSelect
            id="student-pay-account"
            academyId={academyId}
            financeConfig={financeConfig}
            value={payForm.account}
            onChange={(v) => setPayForm((p) => ({ ...p, account: v }))}
            label="Conta"
            required
            className="form-input"
            style={{ ...inputStyle, width: '100%' }}
            labelStyle={labelStyle}
          />

          {showPlanFields ? (
            <div>
              <label style={labelStyle}>Plano</label>
              <input
                type="text"
                className="form-input"
                style={{ ...inputStyle, width: '100%' }}
                value={payForm.plan_name}
                onChange={(e) => setPayForm((p) => ({ ...p, plan_name: e.target.value }))}
              />
            </div>
          ) : null}

          {showPlanFields ? (
            <div>
              <label style={labelStyle}>Observação</label>
              <textarea
                rows={2}
                className="form-input"
                style={{ ...inputStyle, width: '100%', resize: 'vertical', minHeight: 64 }}
                value={payForm.note}
                onChange={(e) => setPayForm((p) => ({ ...p, note: e.target.value }))}
              />
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              color: 'var(--text-secondary)',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 10,
              border: 'none',
              background: '#5B3FBF',
              color: '#fff',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
