import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  EXCEPTION_STATUS_KEYS,
  DEFAULT_EXCEPTION_STATUS_LABELS,
  exceptionStatusBadgeClass,
} from '../../lib/paymentExceptions.js';

export default function ExceptionStatusLabelsSection({ labels, onChange, embedded = false }) {
  return (
    <section className="finance-config-section animate-in">
      {!embedded ? (
        <h3 className="navi-section-heading finance-config-section__heading">
          <AlertTriangle size={18} className="finance-config-section__icon" aria-hidden />
          Status de exceção
        </h3>
      ) : null}
      <p
        className={`finance-config-section__hint${embedded ? ' finance-settings-lead' : ' text-small text-muted'}`}
      >
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
