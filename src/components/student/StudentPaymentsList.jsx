import React, { useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import {
  groupStudentPaymentsForProfile,
  formatReferenceMonthShort,
  formatReferenceMonthLong,
  bundlePlanShortLabel,
  compareReferenceMonths,
} from '../../lib/bundleCoverage.js';
import { centsToNumber, formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr';

function fmtMoney(n) {
  try {
    return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(n || 0).toFixed(2)}`;
  }
}

function statusLabel(st) {
  const s = String(st || '').toLowerCase();
  if (s === 'paid') return 'Pago';
  if (s === 'covered') return 'Coberto';
  if (s === 'pending') return 'Pendente';
  if (s === 'cancelled') return 'Cancelado';
  return s;
}

function BundleGroupCard({ group, onCancelCoverage, cancelling }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelFrom, setCancelFrom] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const { anchor, children, months, startYm, endYm } = group;
  const planLabel = bundlePlanShortLabel(months);
  const total = Number(anchor.amount ?? anchor.paid_amount ?? 0);
  const paidLabel = formatReferenceMonthShort(anchor.reference_month);
  const futureCovered = useMemo(() => {
    const nowYm = new Date().toISOString().slice(0, 7);
    return children.filter(
      (c) =>
        String(c.status || '').toLowerCase() === 'covered' &&
        compareReferenceMonths(c.reference_month, nowYm) >= 0
    );
  }, [children]);

  const handleCancel = () => {
    if (!cancelFrom || !onCancelCoverage) return;
    onCancelCoverage({
      anchor_id: anchor.$id,
      from_reference_month: cancelFrom,
      refundAmount: centsToNumber(parseMaskToCents(refundAmount)) || 0,
    });
  };

  return (
    <div
      style={{
        border: '1px solid var(--v200, #ddd6fe)',
        borderRadius: 10,
        background: 'var(--v50, #f9f7ff)',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
          <Calendar size={20} color="var(--petroleo)" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              Plano {planLabel.charAt(0).toUpperCase() + planLabel.slice(1)} — pago em {paidLabel}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              Cobre: {formatReferenceMonthShort(startYm)} → {formatReferenceMonthShort(endYm)}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--success)', flexShrink: 0 }}>
          {fmtMoney(total)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 10,
          border: 'none',
          background: 'none',
          color: 'var(--petroleo)',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'inherit',
        }}
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Ocultar meses cobertos' : 'Ver meses cobertos'}
      </button>

      {expanded ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[anchor, ...children]
            .filter((p) => p.reference_month)
            .sort((a, b) => compareReferenceMonths(a.reference_month, b.reference_month))
            .map((p) => (
              <div
                key={p.$id}
                style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}
              >
                <span>{formatReferenceMonthLong(p.reference_month)}</span>
                <span style={{ color: 'var(--v700, var(--petroleo))', fontWeight: 600 }}>
                  ✓ {statusLabel(p.status)}
                </span>
              </div>
            ))}
        </div>
      ) : null}

      {futureCovered.length > 0 && onCancelCoverage ? (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--border-light)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
            Cancelar cobertura a partir de
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <select
              className="form-input"
              value={cancelFrom}
              onChange={(e) => setCancelFrom(e.target.value)}
              style={{ fontSize: 13, minWidth: 140 }}
            >
              <option value="">Selecione o mês</option>
              {futureCovered.map((c) => (
                <option key={c.$id} value={c.reference_month}>
                  {formatReferenceMonthLong(c.reference_month)}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="numeric"
              className="form-input"
              placeholder="R$ 0,00"
              value={refundAmount}
              onChange={(e) => setRefundAmount(formatBRLFromCents(parseMaskToCents(e.target.value)))}
              style={{ fontSize: 13, width: 140 }}
            />
            <button
              type="button"
              className="btn-outline btn-sm"
              disabled={!cancelFrom || cancelling}
              onClick={() => handleCancel()}
            >
              {cancelling ? 'Cancelando…' : 'Cancelar cobertura'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SinglePaymentRow({ payment, formatDdMmYyyyFromIso, METHOD_PAYMENT_LABELS }) {
  const st = String(payment.status || '');
  const leftBorder =
    st === 'pending'
      ? '2px solid var(--danger)'
      : st === 'paid' || st === 'covered'
        ? '2px solid var(--success)'
        : '2px solid var(--border)';
  const amountColor =
    st === 'paid' || st === 'covered'
      ? 'var(--success)'
      : st === 'pending'
        ? 'var(--danger)'
        : 'var(--text-muted)';
  const monthTitle = payment.reference_month
    ? formatReferenceMonthLong(payment.reference_month)
    : 'Avulso';
  const isFee = String(payment.payment_category || '') === 'fee';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        background: 'var(--surface)',
        border: '0.5px solid var(--border-light)',
        borderLeft: leftBorder,
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {isFee ? payment.note || 'Taxa / avulso' : monthTitle}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          {st === 'paid' || st === 'covered'
            ? `${METHOD_PAYMENT_LABELS[payment.method] || payment.method} · ${statusLabel(st)}`
            : statusLabel(st)}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: amountColor, flexShrink: 0 }}>
        {fmtMoney(payment.amount)}
      </div>
    </div>
  );
}

export default function StudentPaymentsList({
  payments,
  formatDdMmYyyyFromIso,
  METHOD_PAYMENT_LABELS,
  onCancelCoverage,
  cancellingCoverage,
}) {
  const { groups } = useMemo(() => groupStudentPaymentsForProfile(payments), [payments]);

  if (!groups.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map((g) =>
        g.type === 'bundle' ? (
          <BundleGroupCard
            key={g.anchor.$id}
            group={g}
            onCancelCoverage={onCancelCoverage}
            cancelling={cancellingCoverage}
          />
        ) : (
          <SinglePaymentRow
            key={g.payment.$id}
            payment={g.payment}
            formatDdMmYyyyFromIso={formatDdMmYyyyFromIso}
            METHOD_PAYMENT_LABELS={METHOD_PAYMENT_LABELS}
          />
        )
      )}
    </div>
  );
}
