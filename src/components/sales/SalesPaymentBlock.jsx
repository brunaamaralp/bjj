import React, { useMemo, useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { parseMaskToCents, formatBRLFromCents } from '../../lib/moneyBr';
import {
  MAX_SALE_PAYMENTS,
  rowTrocoCents,
  netPaidCentsFromRows,
  paymentsUiValid,
  normalizePaymentInstallments,
  normalizePaymentForma,
  rebalancePaymentsForTotal,
  salePaymentFormOptionsForFinance,
  trocoFormOptionsForFinance,
} from '../../lib/salePayments';
import {
  needsCaptureMethodSelect,
  whenCaptureMethodChanges,
  whenPaymentMethodChangesWithCapture,
  validateCaptureMethodForSubmit,
  validateCardBrandForSubmit,
} from '../../lib/captureMethodPaymentForm.js';
import { findCaptureMethodById } from '../../lib/captureMethods.js';
import CaptureMethodSelect from '../finance/CaptureMethodSelect.jsx';
import CardBrandSelect from '../finance/CardBrandSelect.jsx';

function rebalanceFirstRow(rows, totalCents) {
  if (rows.length < 2) return rows;
  return rebalancePaymentsForTotal(rows, totalCents);
}

export default function SalesPaymentBlock({
  totalCents,
  payments,
  onChange,
  disabled,
  inlineValidate = false,
  financeConfig = null,
  allowPartial = false,
  saleTotalCents = null,
}) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));
  const saleTotal = saleTotalCents != null ? Math.max(0, Math.round(Number(saleTotalCents) || 0)) : total;
  const [touched, setTouched] = useState({});

  const paymentFormOptions = useMemo(
    () => salePaymentFormOptionsForFinance(financeConfig),
    [financeConfig]
  );
  const trocoFormOptions = useMemo(
    () => trocoFormOptionsForFinance(financeConfig),
    [financeConfig]
  );

  const markTouched = useCallback((key) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const validation = useMemo(
    () =>
      paymentsUiValid(payments, total, {
        financeConfig: financeConfig || undefined,
        allowPartial,
      }),
    [payments, total, financeConfig, allowPartial]
  );
  const netCents = useMemo(() => netPaidCentsFromRows(payments), [payments]);
  const diffCents = total - netCents;

  const updateRow = (idx, patch) => {
    let next = payments.map((r, i) => {
      if (i !== idx) return { ...r };
      const merged = { ...r, ...patch };
      const capture = merged.capture_method_id
        ? findCaptureMethodById(financeConfig, merged.capture_method_id)
        : null;
      const maxInstallments =
        normalizePaymentInstallments(merged.forma, merged.installments) > 1
          ? Math.min(12, Math.max(1, Number(capture?.maxInstallments) || 12))
          : 12;
      return {
        ...merged,
        installments:
          normalizePaymentInstallments(merged.forma, merged.installments) > 1
            ? Math.min(
                maxInstallments,
                normalizePaymentInstallments(merged.forma, merged.installments)
              )
            : normalizePaymentInstallments(merged.forma, merged.installments),
      };
    });
    if (next.length >= 2) {
      const cashTrocoOnFirstRow =
        idx === 0 &&
        patch.recebidoCents != null &&
        normalizePaymentForma(next[0]?.forma) === 'dinheiro';
      if (idx > 0 || cashTrocoOnFirstRow) {
        next = rebalanceFirstRow(next, total);
      }
    }
    onChange(next);
  };

  const setValorCents = (idx, cents) => {
    updateRow(idx, { valorCents: Math.max(0, Math.round(cents)) });
  };

  const addRow = () => {
    if (payments.length >= MAX_SALE_PAYMENTS) return;
    onChange([
      ...payments,
      {
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `pay-${Date.now()}`,
        forma: 'pix',
        valorCents: 0,
        recebidoCents: 0,
        formaTroco: 'pix',
        installments: 1,
      },
    ]);
  };

  const removeRow = (idx) => {
    if (payments.length <= 1) return;
    let next = payments.filter((_, i) => i !== idx);
    if (next.length >= 2) next = rebalanceFirstRow(next, total);
    else if (next.length === 1 && !allowPartial) {
      next[0] = { ...next[0], valorCents: total };
    }
    onChange(next);
  };

  const sumLabel = formatBRLFromCents(netCents);
  const totalLabel = formatBRLFromCents(total);

  return (
    <div className="sales-payment-block form-group sales-checkout__field">
      <div className="sales-payment-block__head">
        <label className="sales-payment-block__label">
          Pagamento
          {inlineValidate ? <span className="sales-field-required"> *</span> : null}
        </label>
        {payments.length < MAX_SALE_PAYMENTS ? (
          <button
            type="button"
            className="btn-ghost sales-payment-block__add"
            disabled={disabled || total <= 0}
            onClick={addRow}
          >
            <Plus size={14} aria-hidden />
            Adicionar forma de pagamento
          </button>
        ) : null}
      </div>
      {allowPartial ? (
        <p className="sales-payment-block__partial-hint text-small text-muted">
          Pode informar um valor menor que o total — o saldo fica em aberto.
        </p>
      ) : null}

      <div className="sales-payment-block__rows">
        {payments.map((row, idx) => {
          const isCash = row.forma === 'dinheiro';
          const trocoCents = rowTrocoCents(row);
          const recebidoCents = Math.max(0, Math.round(Number(row.recebidoCents ?? row.valorCents) || 0));
          const valorCents = Math.max(0, Math.round(Number(row.valorCents) || 0));
          const installments = normalizePaymentInstallments(row.forma, row.installments);
          const capture = row.capture_method_id
            ? findCaptureMethodById(financeConfig, row.capture_method_id)
            : null;
          const maxInstallments =
            row.forma === 'cartao_credito'
              ? Math.min(12, Math.max(1, Number(capture?.maxInstallments) || 12))
              : 1;
          const insuficiente = isCash && recebidoCents < valorCents;
          const showInstallments = row.forma === 'cartao_credito';
          const showCardDetails =
            showInstallments || needsCaptureMethodSelect(financeConfig, row.forma);

          const formaKey = `forma-${idx}`;
          const valorKey = `valor-${idx}`;
          const captureKey = `capture-${idx}`;
          const brandKey = `brand-${idx}`;
          const formaMissing = !String(row.forma || '').trim();
          const valorMissing = total > 0 && valorCents <= 0;
          const captureError = validateCaptureMethodForSubmit(
            financeConfig,
            row.forma,
            row.capture_method_id
          );
          const brandError = validateCardBrandForSubmit(financeConfig, {
            method: row.forma,
            installments,
            captureMethodId: row.capture_method_id,
            feeReceiverId: row.fee_receiver_id,
            bankAccount: row.conta,
            cardBrand: row.card_brand,
          });
          const showFormaError = inlineValidate && touched[formaKey] && formaMissing;
          const showValorError = inlineValidate && touched[valorKey] && valorMissing;
          const showCaptureError = inlineValidate && touched[captureKey] && captureError;
          const showBrandError = inlineValidate && touched[brandKey] && brandError;

          return (
            <div key={row.id} className="sales-payment-row card">
              <div className="sales-payment-row__main">
                <div className="sales-payment-row__field">
                  {inlineValidate && idx === 0 ? (
                    <span className="text-xs sales-payment-row__field-label">
                      Forma de pagamento <span className="sales-field-required">*</span>
                    </span>
                  ) : null}
                  <select
                    className={`form-input${showFormaError ? ' sales-input--invalid' : ''}`}
                    disabled={disabled}
                    value={row.forma}
                    aria-label="Forma de pagamento"
                    onBlur={() => inlineValidate && markTouched(formaKey)}
                    onChange={(e) => {
                    const forma = e.target.value;
                    const patch = { forma, ...whenPaymentMethodChangesWithCapture(financeConfig, forma) };
                    if (forma === 'dinheiro') {
                      patch.recebidoCents = valorCents;
                    } else {
                      patch.capture_method_id = patch.capture_method_id || '';
                      patch.capture_method_name = patch.capture_method_name || '';
                      patch.fee_receiver_id = patch.fee_receiver_id || '';
                      patch.card_brand = '';
                    }
                    patch.installments =
                      forma === 'cartao_credito'
                        ? normalizePaymentInstallments(
                            forma,
                            row.installments
                          )
                        : 1;
                    updateRow(idx, patch);
                  }}
                >
                  {paymentFormOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                  {showFormaError ? (
                    <p className="sales-field-error" role="alert">Campo obrigatório</p>
                  ) : null}
                </div>
                <div className="sales-payment-row__field">
                  {inlineValidate && idx === 0 ? (
                    <span className="text-xs sales-payment-row__field-label">
                      Valor <span className="sales-field-required">*</span>
                    </span>
                  ) : null}
                  <input
                    type="text"
                    className={`form-input${showValorError ? ' sales-input--invalid' : ''}`}
                    disabled={disabled}
                    value={formatBRLFromCents(valorCents)}
                    onBlur={() => inlineValidate && markTouched(valorKey)}
                    onChange={(e) => setValorCents(idx, parseMaskToCents(e.target.value))}
                    placeholder="R$ 0,00"
                    aria-label="Valor"
                  />
                  {showValorError ? (
                    <p className="sales-field-error" role="alert">Campo obrigatório</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-ghost sales-payment-row__remove"
                  disabled={disabled || payments.length <= 1}
                  onClick={() => removeRow(idx)}
                  aria-label="Remover forma"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {showCardDetails ? (
                <div className="sales-payment-row__details">
                  <CaptureMethodSelect
                    financeConfig={financeConfig}
                    method={row.forma}
                    value={row.capture_method_id}
                    id={`sale-capture-${idx}`}
                    className="form-input"
                    variant="compact"
                    disabled={disabled}
                    error={showCaptureError ? captureError : ''}
                    onBlur={() => inlineValidate && markTouched(captureKey)}
                    onChange={(captureId) =>
                      updateRow(idx, {
                        ...whenCaptureMethodChanges(financeConfig, captureId, row.forma),
                        installments:
                          row.forma === 'cartao_credito'
                            ? Math.min(
                                Math.max(
                                  1,
                                  Number(findCaptureMethodById(financeConfig, captureId)?.maxInstallments) ||
                                    12
                                ),
                                installments
                              )
                            : 1,
                      })
                    }
                  />

                  {showInstallments ? (
                    <div className="sales-payment-row__detail-field">
                      <label className="text-xs sales-payment-row__field-label" htmlFor={`sale-installments-${idx}`}>
                        Parcelas
                      </label>
                      <select
                        id={`sale-installments-${idx}`}
                        className="form-input"
                        disabled={disabled}
                        value={String(installments)}
                        aria-label="Parcelas"
                        onChange={(e) =>
                          updateRow(idx, {
                            installments: Math.min(
                              maxInstallments,
                              Math.max(1, Number(e.target.value) || 1)
                            ),
                            card_brand: '',
                          })
                        }
                      >
                        {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={String(n)}>
                            {n}x
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <CardBrandSelect
                    financeConfig={financeConfig}
                    method={row.forma}
                    installments={installments}
                    captureMethodId={row.capture_method_id}
                    feeReceiverId={row.fee_receiver_id}
                    bankAccount={row.conta}
                    value={row.card_brand}
                    id={`sale-brand-${idx}`}
                    className="form-input"
                    variant="compact"
                    disabled={disabled}
                    error={showBrandError ? brandError : ''}
                    onBlur={() => inlineValidate && markTouched(brandKey)}
                    onChange={(brand) => updateRow(idx, { card_brand: brand })}
                  />
                </div>
              ) : null}

              {isCash ? (
                <div className="sales-payment-row__cash">
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="text-xs">Valor recebido</label>
                    <input
                      type="text"
                      className="form-input"
                      disabled={disabled}
                      value={formatBRLFromCents(recebidoCents)}
                      onChange={(e) => {
                        const rc = parseMaskToCents(e.target.value);
                        updateRow(idx, { recebidoCents: rc });
                      }}
                    />
                  </div>
                  <div className="text-small" style={{ marginBottom: 8 }}>
                    Troco:{' '}
                    <strong style={{ color: insuficiente ? 'var(--danger)' : 'var(--text)' }}>
                      {formatBRLFromCents(trocoCents)}
                    </strong>
                    {insuficiente ? (
                      <span style={{ color: 'var(--danger)', marginLeft: 8 }}>Valor insuficiente</span>
                    ) : null}
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="text-xs">Devolver via</label>
                    <select
                      className="form-input"
                      disabled={disabled}
                      value={row.formaTroco || 'pix'}
                      onChange={(e) => updateRow(idx, { formaTroco: e.target.value })}
                    >
                      {trocoFormOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div
        className={`sales-payment-block__sum text-small ${
          validation.ok
            ? 'sales-payment-block__sum--ok'
            : diffCents > 0
              ? 'sales-payment-block__sum--warn'
              : 'sales-payment-block__sum--danger'
        }`}
      >
        {validation.ok ? (
          <>
            Total informado: <strong>{sumLabel}</strong> ✓
            {allowPartial && validation.partial ? (
              <> (parcial — saldo {totalLabel})</>
            ) : allowPartial && saleTotal > total ? (
              <> (quita saldo de {totalLabel})</>
            ) : (
              <> (venda {formatBRLFromCents(saleTotal)})</>
            )}
          </>
        ) : validation.reason === 'troco_negativo' ? (
          <>Corrija o valor recebido em dinheiro (insuficiente).</>
        ) : allowPartial && diffCents > 0 ? (
          <>
            Total informado: {sumLabel} — <strong>Parcial</strong> (saldo {totalLabel}
            {diffCents < total ? `, faltam ${formatBRLFromCents(diffCents)} para quitar` : ''})
          </>
        ) : diffCents > 0 ? (
          <>
            Total informado: {sumLabel} — <strong>Faltam {formatBRLFromCents(diffCents)}</strong>
          </>
        ) : (
          <>
            Total informado: {sumLabel} — <strong>Excede em {formatBRLFromCents(-diffCents)}</strong> (ajuste troco)
          </>
        )}
      </div>
    </div>
  );
}
