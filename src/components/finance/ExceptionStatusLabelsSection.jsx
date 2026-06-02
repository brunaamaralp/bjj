import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  EXCEPTION_STATUS_KEYS,
  DEFAULT_EXCEPTION_STATUS_LABELS,
  exceptionStatusBadgeClass,
} from '../../lib/paymentExceptions.js';

export default function ExceptionStatusLabelsSection({ labels, onChange }) {
  return (
    <section className="finance-config-section animate-in">
      <h3 className="navi-section-heading finance-config-section__heading">
        <AlertTriangle size={18} className="finance-config-section__icon" aria-hidden />
        Status de exceção
      </h3>
      <p className="text-small text-muted finance-config-section__hint">
        Personalize os nomes exibidos na aba Pendências de Mensalidades. As regras de quando cada status aparece são
        definidas pelo sistema.
      </p>
      <div className="finance-config-section__body finance-config-section__body--compact">
        <div className="finance-exception-grid">
          {EXCEPTION_STATUS_KEYS.map((key) => (
            <div key={key} className="finance-exception-item">
              <span className={exceptionStatusBadgeClass(key)}>
                {labels[key] || DEFAULT_EXCEPTION_STATUS_LABELS[key]}
              </span>
              <input
                className="form-input finance-compact-input"
                value={labels[key] || ''}
                placeholder={DEFAULT_EXCEPTION_STATUS_LABELS[key]}
                onChange={(e) => onChange({ ...labels, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
