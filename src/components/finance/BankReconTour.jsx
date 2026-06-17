import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { RECON_TOUR_STEPS } from '../../lib/bankReconOnboarding.js';

function getTargetRect(targetKey) {
  if (typeof document === 'undefined' || !targetKey) return null;
  const el = document.querySelector(`[data-recon-tour="${targetKey}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return null;
  return rect;
}

export default function BankReconTour({ open, onComplete, onSkip, hasConfirmAll = false }) {
  const steps = useMemo(
    () => RECON_TOUR_STEPS.filter((s) => !s.optional || (s.id === 'confirm-all' && hasConfirmAll)),
    [hasConfirmAll]
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);

  const step = steps[index] || null;
  const isLast = index >= steps.length - 1;

  const refreshRect = useCallback(() => {
    if (!open || !step) {
      setRect(null);
      return;
    }
    setRect(getTargetRect(step.target));
  }, [open, step]);

  useLayoutEffect(() => {
    refreshRect();
  }, [refreshRect, index]);

  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => refreshRect();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, refreshRect]);

  useEffect(() => {
    if (!open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onSkip?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onSkip]);

  if (!open || !step) return null;

  const pad = 8;
  const highlightStyle = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const tooltipTop = rect ? rect.bottom + 12 : '50%';
  const tooltipLeft = rect ? Math.min(rect.left, window.innerWidth - 320) : '50%';

  return (
    <div className="bank-recon-tour" role="presentation">
      <div className="bank-recon-tour__backdrop" onClick={() => onSkip?.()} aria-hidden />
      {highlightStyle ? (
        <div className="bank-recon-tour__highlight" style={highlightStyle} aria-hidden />
      ) : null}
      <div
        className="bank-recon-tour__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-recon-tour-title"
        aria-live="polite"
        style={{
          top: typeof tooltipTop === 'number' ? `${tooltipTop}px` : tooltipTop,
          left: typeof tooltipLeft === 'number' ? `${tooltipLeft}px` : tooltipLeft,
          transform: rect ? 'none' : 'translate(-50%, -50%)',
        }}
      >
        <p className="bank-recon-tour__step text-xs text-muted">
          {index + 1} de {steps.length}
        </p>
        <h3 id="bank-recon-tour-title" className="bank-recon-tour__title">
          {step.title}
        </h3>
        <p className="bank-recon-tour__desc">{step.description}</p>
        <div className="bank-recon-tour__actions">
          <button type="button" className="btn-text btn-sm" onClick={() => onSkip?.()}>
            Pular tour
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => {
              if (isLast) onComplete?.();
              else setIndex((i) => i + 1);
            }}
          >
            {isLast ? 'Concluir' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}
