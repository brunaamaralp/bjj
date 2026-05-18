import React, { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { parseMaskToCents, formatBRLFromCents } from '../../lib/moneyBr';
import {
  SALE_PAYMENT_FORM_OPTIONS,
  TROCO_FORM_OPTIONS,
  MAX_SALE_PAYMENTS,
  rowTrocoCents,
  netPaidCentsFromRows,
  paymentsUiValid,
} from '../../lib/salePayments';

function rebalanceFirstRow(rows, totalCents) {
  if (rows.length < 2) return rows;
  const next = rows.map((r) => ({ ...r }));
  const restVal = next.slice(1).reduce((s, r) => s + Math.max(0, Math.round(Number(r.valorCents) || 0)), 0);
  const allTroco = next.reduce((s, r) => s + rowTrocoCents(r), 0);
  const v0 = Math.max(0, Math.round(Number(totalCents) || 0) - restVal + allTroco);
  next[0] = { ...next[0], valorCents: v0 };
  return next;
}

export default function SalesPaymentBlock({ totalCents, payments, onChange, disabled }) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0));

  const validation = useMemo(() => paymentsUiValid(payments, total), [payments, total]);
  const netCents = useMemo(() => netPaidCentsFromRows(payments), [payments]);
  const diffCents = total - netCents;

  const updateRow = (idx, patch) => {
    let next = payments.map((r, i) => (i === idx ? { ...r, ...patch } : { ...r }));
    if (idx > 0 && next.length >= 2) {
      next = rebalanceFirstRow(next, total);
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
      },
    ]);
  };

  const removeRow = (idx) => {
    if (payments.length <= 1) return;
    let next = payments.filter((_, i) => i !== idx);
    if (next.length >= 2) next = rebalanceFirstRow(next, total);
    else if (next.length === 1) next[0] = { ...next[0], valorCents: total };
    onChange(next);
  };

  const sumLabel = formatBRLFromCents(netCents);
  const totalLabel = formatBRLFromCents(total);

  return (
    <div className="sales-payment-block form-group sales-checkout__field">
      <div className="sales-payment-block__head">
        <label style={{ margin: 0 }}>Pagamento</label>
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

      <div className="sales-payment-block__rows">
        {payments.map((row, idx) => {
          const isCash = row.forma === 'dinheiro';
          const trocoCents = rowTrocoCents(row);
          const recebidoCents = Math.max(0, Math.round(Number(row.recebidoCents ?? row.valorCents) || 0));
          const valorCents = Math.max(0, Math.round(Number(row.valorCents) || 0));
          const insuficiente = isCash && recebidoCents < valorCents;

          return (
            <div key={row.id} className="sales-payment-row card" style={{ padding: 12, marginBottom: 10 }}>
              <div className="sales-payment-row__main">
                <select
                  className="form-input"
                  disabled={disabled}
                  value={row.forma}
                  onChange={(e) => {
                    const forma = e.target.value;
                    const patch = { forma };
                    if (forma === 'dinheiro') {
                      patch.recebidoCents = valorCents;
                    }
                    updateRow(idx, patch);
                  }}
                >
                  {SALE_PAYMENT_FORM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="form-input"
                  disabled={disabled}
                  value={formatBRLFromCents(valorCents)}
                  onChange={(e) => setValorCents(idx, parseMaskToCents(e.target.value))}
                  placeholder="R$ 0,00"
                  aria-label="Valor"
                />
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={disabled || payments.length <= 1}
                  onClick={() => removeRow(idx)}
                  aria-label="Remover forma"
                  style={{ padding: 8 }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

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
                      {TROCO_FORM_OPTIONS.map((o) => (
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
        className="sales-payment-block__sum text-small"
        style={{
          color: validation.ok ? 'var(--success, #0d7a4a)' : diffCents > 0 ? 'var(--warning, #b8860b)' : 'var(--danger)',
        }}
      >
        {validation.ok ? (
          <>
            Total informado: <strong>{sumLabel}</strong> ✓ (venda {totalLabel})
          </>
        ) : validation.reason === 'troco_negativo' ? (
          <>Corrija o valor recebido em dinheiro (insuficiente).</>
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
