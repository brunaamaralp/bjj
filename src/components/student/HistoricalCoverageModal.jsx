import React, { useMemo, useState, useCallback } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import { DateInput } from '../DateInput';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import {
  buildHistoricalCoverageMonthSpecs,
  previewHistoricalCoverage,
  formatReferenceMonthLong,
  coverageEndMonth,
  HISTORICAL_COVERAGE_MIN_MONTHS,
  HISTORICAL_COVERAGE_MAX_MONTHS,
} from '../../lib/bundleCoverage.js';
import { isMensalidadesGridPayment } from '../../lib/paymentCategories.js';

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Modal provisório: cobertura histórica sem Caixa (owner/admin no perfil).
 */
export default function HistoricalCoverageModal({
  open,
  student,
  payments = [],
  onClose,
  onConfirm,
  busy = false,
}) {
  const [startYm, setStartYm] = useState(currentYm);
  const [months, setMonths] = useState(12);
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose?.();
  }, [busy, onClose]);

  useModalA11y({ isOpen: open, onClose: handleClose });

  const existingByMonth = useMemo(() => {
    const map = new Map();
    for (const p of payments || []) {
      if (!isMensalidadesGridPayment(p)) continue;
      const ym = String(p.reference_month || '').trim();
      if (/^\d{4}-\d{2}$/.test(ym) && !map.has(ym)) map.set(ym, p);
    }
    return map;
  }, [payments]);

  const specs = useMemo(
    () =>
      buildHistoricalCoverageMonthSpecs({
        startYm,
        bundleMonths: months,
        note,
      }),
    [startYm, months, note]
  );

  const preview = useMemo(
    () => previewHistoricalCoverage({ specs, existingByMonth }),
    [specs, existingByMonth]
  );

  const endYm = coverageEndMonth(startYm, months);

  const validate = () => {
    const errors = {};
    if (!/^\d{4}-\d{2}$/.test(String(startYm || ''))) {
      errors.startYm = 'Informe o mês de início.';
    }
    const n = Math.trunc(Number(months));
    if (
      !Number.isFinite(n) ||
      n < HISTORICAL_COVERAGE_MIN_MONTHS ||
      n > HISTORICAL_COVERAGE_MAX_MONTHS
    ) {
      errors.months = `Duração entre ${HISTORICAL_COVERAGE_MIN_MONTHS} e ${HISTORICAL_COVERAGE_MAX_MONTHS} meses.`;
    }
    if (preview.monthsToWrite === 0 && specs.length > 0) {
      errors.preview = 'Todos os meses do intervalo já estão pagos ou parciais.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onConfirm?.({
      coverage_start_month: startYm,
      bundle_months: Math.trunc(Number(months)),
      note: String(note || '').trim(),
      lead_id: student?.$id || student?.id,
    });
  };

  if (!open || !student) return null;

  return (
    <ModalShell
      open={open}
      title="Cobertura histórica"
      onClose={handleClose}
      closeOnOverlay={!busy}
      closeOnEsc={!busy}
      showCloseButton={!busy}
      maxWidth={440}
      className="navi-modal-overlay--form"
      ariaLabelledBy={undefined}
      footer={
        <div className="payment-modal-footer__actions" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-outline" disabled={busy} onClick={handleClose} style={{ flex: 1 }}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || preview.monthsToWrite === 0}
            onClick={handleSubmit}
            style={{ flex: 1 }}
          >
            {busy ? 'Salvando…' : 'Confirmar cobertura'}
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted" style={{ marginBottom: 12 }} role="note">
        Marca meses como cobertos sem lançar valor no Caixa. Use só para pagamentos antigos fora do
        Nave.
      </p>

      <div className="form-group">
        <DateInput
          id="historical-coverage-start"
          label="Início da cobertura"
          type="month"
          value={startYm}
          onChange={(e) => {
            setStartYm(e.target.value);
            setFieldErrors((f) => ({ ...f, startYm: undefined, preview: undefined }));
          }}
          required
          aria-invalid={fieldErrors.startYm ? 'true' : undefined}
        />
        <FieldError>{fieldErrors.startYm}</FieldError>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="historical-coverage-months">
          Duração (meses)
        </label>
        <input
          id="historical-coverage-months"
          className="form-input"
          type="number"
          min={HISTORICAL_COVERAGE_MIN_MONTHS}
          max={HISTORICAL_COVERAGE_MAX_MONTHS}
          value={months}
          onChange={(e) => {
            setMonths(e.target.value);
            setFieldErrors((f) => ({ ...f, months: undefined, preview: undefined }));
          }}
          aria-invalid={fieldErrors.months ? 'true' : undefined}
        />
        <FieldError>{fieldErrors.months}</FieldError>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="historical-coverage-note">
          Nota (opcional)
        </label>
        <input
          id="historical-coverage-note"
          className="form-input"
          type="text"
          maxLength={200}
          placeholder="Ex.: pago em dinheiro em 2025"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {specs.length > 0 ? (
        <p className="text-sm" style={{ marginTop: 8 }} role="status">
          Cobre de <strong>{formatReferenceMonthLong(startYm)}</strong> a{' '}
          <strong>{formatReferenceMonthLong(endYm)}</strong>
          {'. '}
          {preview.monthsToWrite} mês(es) a marcar
          {preview.monthsSkipped > 0
            ? `; ${preview.monthsSkipped} já pago(s)/parcial(is) serão pulados`
            : ''}
          .
        </p>
      ) : null}
      <FieldError>{fieldErrors.preview}</FieldError>
    </ModalShell>
  );
}
